import asyncio
import os
import uuid
import zlib
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
from app.config import settings

# Protects only the DB metadata commit phase — disk writes stay fully parallel
_metadata_lock = asyncio.Lock()

# Thread pool for parallel disk I/O — 16 workers handles burst of concurrent uploads
_io_executor = ThreadPoolExecutor(max_workers=16, thread_name_prefix="chunk_writer")


def _write_chunk_to_disk(chunk_path: Path, data) -> None:
    """Runs in thread pool. Accepts bytes or memoryview."""
    with open(chunk_path, "wb") as f:
        f.write(data)


async def _write_all_chunks_parallel(
    assignments: List[dict],
    node_map: Dict[str, Node],
) -> None:
    """
    Fires all chunk disk writes simultaneously via ThreadPoolExecutor.
    DB is never touched here — pure I/O.
    """
    loop = asyncio.get_running_loop()
    write_tasks = [
        loop.run_in_executor(
            _io_executor,
            _write_chunk_to_disk,
            Path(node_map[a["node_id"]].storage_path) / a["chunk_id"],
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
) -> dict:
    # ── Phase 1: Pure computation, no lock, no DB ──────────────────────────
    original_checksum, chunks, is_compressed = chunk_file(file_data)

    nodes = get_online_nodes(db)
    if not nodes:
        raise ValueError("No online satellite nodes available")

    replication_factor = min(settings.REPLICATION_FACTOR, len(nodes))
    assignments = distribute(chunks, nodes, replication_factor)
    node_map: Dict[str, Node] = {n.id: n for n in nodes}

    # ── Phase 2: Parallel disk writes, no lock needed ──────────────────────
    await _write_all_chunks_parallel(assignments, node_map)

    # ── Phase 3: Metadata commit, LOCKED ───────────────────────────────────
    # Lock is acquired AFTER disk writes so multiple files write to disk simultaneously.
    # Only the tiny DB commit phase is serialized.
    file_id: str = str(uuid.uuid4())
    version: int = 1

    async with _metadata_lock:
        try:
            # Re-query version inside lock — prevents duplicate version race condition
            latest = (
                db.query(FileRecord)
                .filter(FileRecord.original_name == original_name)
                .order_by(FileRecord.version.desc())
                .first()
            )
            version = (latest.version + 1) if latest else 1

            file_record = FileRecord(
                file_id=file_id,
                original_name=original_name,
                file_size=len(file_data),
                total_chunks=len(chunks),
                mime_type=mime_type,
                checksum=original_checksum,
                version=version,
                status="UPLOADING",
                is_compressed=1 if is_compressed else 0,
            )
            db.add(file_record)
            db.flush()

            # Single batched INSERT for all chunks — replaces N individual inserts
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

            # Aggregate node stat updates — one query per node instead of per chunk
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
            # Cleanup orphaned chunk files written to disk before DB failed
            for a in assignments:
                node = node_map.get(a["node_id"])
                if node:
                    try:
                        (Path(node.storage_path) / a["chunk_id"]).unlink(missing_ok=True)
                    except Exception:
                        pass
            raise

    return {
        "file_id": file_id,
        "original_name": original_name,
        "file_size": len(file_data),
        "total_chunks": len(chunks),
        "replication_factor": replication_factor,
        "checksum": original_checksum,
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

    return file_data, record.original_name, record.mime_type


def delete_file(file_id: str, db: Session) -> Optional[dict]:
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        return None

    chunks = db.query(Chunk).filter(Chunk.file_id == file_id).all()

    deletion_targets: List[Tuple[Path, str, int, str]] = []
    node_cache: dict = {}

    for chunk in chunks:
        if chunk.node_id not in node_cache:
            node_cache[chunk.node_id] = db.query(Node).filter(Node.id == chunk.node_id).first()
        node = node_cache[chunk.node_id]
        if node:
            deletion_targets.append((
                Path(node.storage_path) / chunk.chunk_id,
                chunk.node_id,
                chunk.size_bytes,
                chunk.chunk_id,
            ))

    size_per_node: dict = {}
    count_per_node: dict = {}
    for _, node_id, size_bytes, _ in deletion_targets:
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
    for chunk_path, _, _, chunk_id in deletion_targets:
        chunk_cache.invalidate(chunk_id)
        try:
            chunk_path.unlink()
            deleted_physically += 1
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Warning: Could not delete chunk at {chunk_path}: {e}")

    return {
        "file_id": file_id,
        "original_name": original_name,
        "chunks_in_db": total_chunks_count,
        "chunks_deleted_from_disk": deleted_physically,
    }


def get_file_record_by_name(
    filename: str,
    version: Optional[int],
    db: Session,
) -> Optional[FileRecord]:
    query = db.query(FileRecord).filter(FileRecord.original_name == filename)
    if version is not None:
        return query.filter(FileRecord.version == version).first()
    return query.order_by(FileRecord.version.desc()).first()


def list_file_versions(filename: str, db: Session) -> List[FileRecord]:
    return (
        db.query(FileRecord)
        .filter(FileRecord.original_name == filename)
        .order_by(FileRecord.version.asc())
        .all()
    )
