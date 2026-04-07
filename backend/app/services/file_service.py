import asyncio
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from sqlalchemy import insert as sa_insert
from sqlalchemy.orm import Session

from app.models.file_record import FileRecord
from app.models.chunk import Chunk
from app.models.node import Node
from app.core.chunker import chunk_file
from app.core.distributor import get_online_nodes, distribute
from app.core.reconstructor import reconstruct_file
from app.core.cache import chunk_cache
from app.core.merkle import compute_merkle_root, verify_proof, generate_proof
from app.core.storage_backend import storage
from app.config import settings

_metadata_lock = asyncio.Lock()
_io_executor = ThreadPoolExecutor(max_workers=16, thread_name_prefix="chunk_writer")


def _write_chunk_to_storage(node_path: str, chunk_id: str, data: bytes) -> None:
    """Write a single chunk via the storage backend abstraction."""
    storage.write_chunk(node_path, chunk_id, data)


async def _write_all_chunks_parallel(
    assignments: List[dict],
    node_map: Dict[str, Node],
) -> None:
    loop = asyncio.get_running_loop()
    write_tasks = [
        loop.run_in_executor(
            _io_executor,
            _write_chunk_to_storage,
            node_map[a["node_id"]].storage_path,
            a["chunk_id"],
            a["data"],
        )
        for a in assignments
    ]
    await asyncio.gather(*write_tasks)


async def upload_file(
    file_data: bytes,
    original_name: str,
    mime_type: str,
    db: Session,
    user_id: str,
) -> dict:
    # ── File size guard ───────────────────────────────────────────────────
    max_bytes = settings.max_file_size_bytes
    if len(file_data) > max_bytes:
        raise ValueError(
            f"File too large ({len(file_data) / 1024 / 1024:.1f} MB). "
            f"Maximum allowed: {settings.MAX_FILE_SIZE_MB} MB."
        )

    # ── Input sanitization on filename ────────────────────────────────────
    # Strip path traversal attempts and limit length
    safe_name = Path(original_name).name  # removes any path components
    if len(safe_name) > 255:
        safe_name = safe_name[:255]
    original_name = safe_name

    # ── Phase 1: Chunk + compute Merkle root ──────────────────────────────
    original_checksum, chunks, is_compressed = chunk_file(file_data)

    # Build Merkle root from primary chunk hashes, ordered by chunk_index
    unique_chunks_sorted = sorted(
        {c["chunk_index"]: c for c in chunks}.values(),
        key=lambda c: c["chunk_index"],
    )
    leaf_hashes = [c["checksum"] for c in unique_chunks_sorted]
    merkle_root = compute_merkle_root(leaf_hashes)

    nodes = get_online_nodes(db)
    if not nodes:
        raise ValueError("No online satellite nodes available")

    replication_factor = min(settings.REPLICATION_FACTOR, len(nodes))
    assignments = distribute(chunks, nodes, replication_factor)
    node_map: Dict[str, Node] = {n.id: n for n in nodes}

    # ── Phase 2: Parallel writes via storage backend ──────────────────────
    await _write_all_chunks_parallel(assignments, node_map)

    # ── Phase 3: Metadata commit (locked) ─────────────────────────────────
    file_id: str = str(uuid.uuid4())
    version: int = 1

    async with _metadata_lock:
        try:
            latest = (
                db.query(FileRecord)
                .filter(
                    FileRecord.original_name == original_name,
                    FileRecord.user_id == user_id,
                )
                .order_by(FileRecord.version.desc())
                .first()
            )
            version = (latest.version + 1) if latest else 1

            file_record = FileRecord(
                file_id=file_id,
                user_id=user_id,
                original_name=original_name,
                file_size=len(file_data),
                total_chunks=len(unique_chunks_sorted),
                mime_type=mime_type,
                checksum=original_checksum,
                merkle_root=merkle_root,
                version=version,
                status="UPLOADING",
                is_compressed=1 if is_compressed else 0,
            )
            db.add(file_record)
            db.flush()

            chunk_mappings = [
                {
                    "chunk_id": a["chunk_id"],
                    "file_id": file_id,
                    "chunk_index": a["chunk_index"],
                    "node_id": a["node_id"],
                    "checksum": a["checksum"],
                    "size_bytes": a["size_bytes"],
                    "is_replica": a["is_replica"],
                    "replica_of": a["replica_of"],
                }
                for a in assignments
            ]
            db.execute(sa_insert(Chunk), chunk_mappings)

            size_per_node: Dict[str, int] = {}
            count_per_node: Dict[str, int] = {}
            for a in assignments:
                nid = a["node_id"]
                size_per_node[nid] = size_per_node.get(nid, 0) + a["size_bytes"]
                count_per_node[nid] = count_per_node.get(nid, 0) + 1

            for nid, node in node_map.items():
                if nid in size_per_node:
                    node.used_bytes = (node.used_bytes or 0) + size_per_node[nid]
                    node.chunk_count = (node.chunk_count or 0) + count_per_node[nid]

            file_record.status = "COMPLETE"
            db.commit()

        except Exception:
            db.rollback()
            # Cleanup written chunks on failure
            for a in assignments:
                node = node_map.get(a["node_id"])
                if node:
                    try:
                        storage.delete_chunk(node.storage_path, a["chunk_id"])
                    except Exception:
                        pass
            raise

    return {
        "file_id": file_id,
        "original_name": original_name,
        "file_size": len(file_data),
        "total_chunks": len(unique_chunks_sorted),
        "replication_factor": replication_factor,
        "checksum": original_checksum,
        "merkle_root": merkle_root,
        "version": version,
        "is_compressed": is_compressed,
        "distribution_strategy": settings.DISTRIBUTION_STRATEGY,
    }


def download_file(
    file_id: str,
    db: Session,
) -> Optional[Tuple[bytes, str, str]]:
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        return None

    file_data = reconstruct_file(
        file_id, db, is_compressed=bool(record.is_compressed)
    )
    if file_data is None:
        return None

    # ── Merkle integrity check on every download ──────────────────────────
    if record.merkle_root:
        primary_chunks = (
            db.query(Chunk)
            .filter(Chunk.file_id == file_id, Chunk.is_replica == False)
            .order_by(Chunk.chunk_index)
            .all()
        )
        live_leaf_hashes = [c.checksum for c in primary_chunks]
        live_root = compute_merkle_root(live_leaf_hashes)

        if live_root != record.merkle_root:
            raise ValueError(
                f"Merkle root mismatch — file '{record.original_name}' "
                f"has been tampered with. Expected: {record.merkle_root[:16]}... "
                f"Got: {live_root[:16]}..."
            )

    return file_data, record.original_name, record.mime_type


def get_merkle_proof_for_chunk(
    file_id: str,
    chunk_index: int,
    db: Session,
) -> Optional[dict]:
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record or not record.merkle_root:
        return None

    primary_chunks = (
        db.query(Chunk)
        .filter(Chunk.file_id == file_id, Chunk.is_replica == False)
        .order_by(Chunk.chunk_index)
        .all()
    )

    if chunk_index >= len(primary_chunks):
        return None

    leaf_hashes = [c.checksum for c in primary_chunks]
    proof_steps = generate_proof(leaf_hashes, chunk_index)

    target_hash = leaf_hashes[chunk_index]
    is_valid = verify_proof(target_hash, proof_steps, record.merkle_root)

    return {
        "file_id": file_id,
        "chunk_index": chunk_index,
        "chunk_hash": target_hash,
        "merkle_root": record.merkle_root,
        "total_chunks": len(primary_chunks),
        "proof_steps": proof_steps,
        "proof_valid": is_valid,
        "how_to_verify": (
            "Start with chunk_hash. For each step: if position='right', "
            "SHA256(current + step.hash). If position='left', SHA256(step.hash + current). "
            "Final result must equal merkle_root."
        ),
    }


def delete_file(file_id: str, db: Session) -> Optional[dict]:
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        return None

    chunks = db.query(Chunk).filter(Chunk.file_id == file_id).all()

    deletion_targets: List[Tuple[str, str, str, int]] = []  # (node_path, chunk_id, node_id, size)
    node_cache: dict = {}

    for chunk in chunks:
        if chunk.node_id not in node_cache:
            node_cache[chunk.node_id] = db.query(Node).filter(Node.id == chunk.node_id).first()
        node = node_cache[chunk.node_id]
        if node:
            deletion_targets.append((
                node.storage_path,
                chunk.chunk_id,
                chunk.node_id,
                chunk.size_bytes,
            ))

    size_per_node: dict = {}
    count_per_node: dict = {}
    for _, _, node_id, size_bytes in deletion_targets:
        size_per_node[node_id] = size_per_node.get(node_id, 0) + size_bytes
        count_per_node[node_id] = count_per_node.get(node_id, 0) + 1

    for node_id, node in node_cache.items():
        if node:
            node.used_bytes = max(0, (node.used_bytes or 0) - size_per_node.get(node_id, 0))
            node.chunk_count = max(0, (node.chunk_count or 0) - count_per_node.get(node_id, 0))

    original_name = record.original_name
    total_chunks_count = len(chunks)

    db.query(Chunk).filter(Chunk.file_id == file_id).delete(synchronize_session=False)
    db.delete(record)
    db.commit()

    deleted_physically = 0
    for node_path, chunk_id, _, _ in deletion_targets:
        chunk_cache.invalidate(chunk_id)
        if storage.delete_chunk(node_path, chunk_id):
            deleted_physically += 1

    return {
        "file_id": file_id,
        "original_name": original_name,
        "chunks_in_db": total_chunks_count,
        "chunks_deleted_from_disk": deleted_physically,
    }


def list_files_for_user(
    db: Session,
    user_id: Optional[str] = None,
) -> List[FileRecord]:
    query = db.query(FileRecord).order_by(FileRecord.created_at.desc())
    if user_id:
        query = query.filter(FileRecord.user_id == user_id)
    return query.all()


def get_file_record_by_name(
    filename: str,
    version: Optional[int],
    db: Session,
    user_id: Optional[str] = None,
) -> Optional[FileRecord]:
    query = db.query(FileRecord).filter(FileRecord.original_name == filename)
    if user_id:
        query = query.filter(FileRecord.user_id == user_id)
    if version is not None:
        return query.filter(FileRecord.version == version).first()
    return query.order_by(FileRecord.version.desc()).first()


def list_file_versions(
    filename: str,
    db: Session,
    user_id: Optional[str] = None,
) -> List[FileRecord]:
    query = (
        db.query(FileRecord)
        .filter(FileRecord.original_name == filename)
        .order_by(FileRecord.version.asc())
    )
    if user_id:
        query = query.filter(FileRecord.user_id == user_id)
    return query.all()
