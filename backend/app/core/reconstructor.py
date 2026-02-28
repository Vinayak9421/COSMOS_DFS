import os
from typing import Optional
from sqlalchemy.orm import Session
from app.models.chunk import Chunk
from app.models.node import Node
from app.core.integrity import verify_chunk, read_chunk_data
from app.core.cache import chunk_cache


def reconstruct_file(file_id: str, db: Session) -> Optional[bytes]:
    primary_chunks = (
        db.query(Chunk)
        .filter(Chunk.file_id == file_id, Chunk.is_replica == 0)
        .order_by(Chunk.chunk_index)
        .all()
    )

    if not primary_chunks:
        return None

    assembled = bytearray()
    for chunk in primary_chunks:
        data = _fetch_chunk_with_fallback(chunk, db)
        if data is None:
            return None
        assembled.extend(data)

    return bytes(assembled)


def _fetch_chunk_with_fallback(chunk: Chunk, db: Session) -> Optional[bytes]:
    # 1. Check LRU cache
    cached = chunk_cache.get(chunk.chunk_id)
    if cached is not None:
        return cached

    # 2. Try primary node
    node = db.query(Node).filter(Node.id == chunk.node_id).first()
    if node and node.status == "ONLINE":
        path = os.path.join(node.storage_path, chunk.chunk_id)
        if verify_chunk(path, chunk.checksum):
            data = read_chunk_data(path)
            if data:
                chunk_cache.put(chunk.chunk_id, data)
                return data

    # 3. Fallback to replicas
    replicas = (
        db.query(Chunk)
        .filter(Chunk.replica_of == chunk.chunk_id, Chunk.is_replica == 1)
        .all()
    )
    for replica in replicas:
        replica_node = db.query(Node).filter(Node.id == replica.node_id).first()
        if replica_node and replica_node.status == "ONLINE":
            path = os.path.join(replica_node.storage_path, replica.chunk_id)
            if verify_chunk(path, replica.checksum):
                data = read_chunk_data(path)
                if data:
                    chunk_cache.put(chunk.chunk_id, data)
                    return data

    return None
