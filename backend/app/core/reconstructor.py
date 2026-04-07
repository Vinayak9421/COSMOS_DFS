import os
import zlib
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session

from app.models.chunk import Chunk
from app.models.node import Node
from app.core.integrity import verify_chunk
from app.core.cache import chunk_cache
from app.core.storage_backend import storage


def reconstruct_file(
    file_id: str,
    db: Session,
    is_compressed: bool = False,
) -> Optional[bytes]:
    primary_chunks = (
        db.query(Chunk)
        .filter(Chunk.file_id == file_id, Chunk.is_replica == 0)
        .order_by(Chunk.chunk_index)
        .all()
    )

    if not primary_chunks:
        return None

    # Pre-load all data into plain dicts before threading (SA sessions are not thread-safe)
    all_nodes = {n.id: n for n in db.query(Node).all()}
    replica_map: dict = {}
    for replica in (
        db.query(Chunk)
        .filter(Chunk.file_id == file_id, Chunk.is_replica == 1)
        .all()
    ):
        replica_map.setdefault(replica.replica_of, []).append(replica)

    fetch_infos = []
    for chunk in primary_chunks:
        primary_node = all_nodes.get(chunk.node_id)
        replicas = replica_map.get(chunk.chunk_id, [])

        replica_infos = []
        for r in replicas:
            rn = all_nodes.get(r.node_id)
            if rn:
                replica_infos.append({
                    "chunk_id": r.chunk_id,
                    "checksum": r.checksum,
                    "node_status": rn.status,
                    "node_path": rn.storage_path,
                })

        fetch_infos.append({
            "chunk_id": chunk.chunk_id,
            "chunk_index": chunk.chunk_index,
            "checksum": chunk.checksum,
            "primary_node_status": primary_node.status if primary_node else "OFFLINE",
            "primary_node_path": primary_node.storage_path if primary_node else "",
            "replicas": replica_infos,
        })

    # Fetch all chunks in parallel
    results: dict = {}
    with ThreadPoolExecutor(max_workers=min(len(fetch_infos), 8)) as executor:
        future_to_index = {
            executor.submit(_fetch_chunk_from_info, info): info["chunk_index"]
            for info in fetch_infos
        }
        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                data = future.result()
            except Exception:
                data = None
            results[index] = data

    if any(v is None for v in results.values()):
        return None

    assembled = bytearray()
    for i in sorted(results.keys()):
        assembled.extend(results[i])

    raw = bytes(assembled)
    return zlib.decompress(raw) if is_compressed else raw


def _fetch_chunk_from_info(info: dict) -> Optional[bytes]:
    # 1. LRU cache
    cached = chunk_cache.get(info["chunk_id"])
    if cached is not None:
        return cached

    # 2. Primary node (ONLINE or MAINTENANCE are both readable)
    if info["primary_node_status"] in ("ONLINE", "MAINTENANCE"):
        node_path = info["primary_node_path"]
        chunk_id = info["chunk_id"]
        # Use storage backend abstraction (local disk or S3)
        chunk_path = os.path.join(node_path, chunk_id)
        if verify_chunk(chunk_path, info["checksum"]):
            data = storage.read_chunk(node_path, chunk_id)
            if data:
                chunk_cache.put(chunk_id, data)
                return data

    # 3. Fallback to replicas
    for replica in info["replicas"]:
        if replica["node_status"] in ("ONLINE", "MAINTENANCE"):
            node_path = replica["node_path"]
            chunk_id = replica["chunk_id"]
            chunk_path = os.path.join(node_path, chunk_id)
            if verify_chunk(chunk_path, replica["checksum"]):
                data = storage.read_chunk(node_path, chunk_id)
                if data:
                    chunk_cache.put(chunk_id, data)
                    return data

    return None
