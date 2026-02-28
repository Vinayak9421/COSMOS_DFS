import uuid
from typing import List, Tuple
from app.config import settings
from app.core.integrity import compute_sha256


def chunk_file(file_data: bytes) -> Tuple[str, List[dict]]:
    """
    Returns (file_checksum, list_of_chunk_dicts).
    Each chunk dict: {chunk_id, chunk_index, data, checksum, size_bytes}
    """
    file_checksum = compute_sha256(file_data)
    chunk_size = settings.CHUNK_SIZE_BYTES
    chunks = []
    total = len(file_data)
    offset = 0
    chunk_index = 0

    while offset < total:
        chunk_data = file_data[offset: offset + chunk_size]
        chunks.append({
            "chunk_id": str(uuid.uuid4()),
            "chunk_index": chunk_index,
            "data": chunk_data,
            "checksum": compute_sha256(chunk_data),
            "size_bytes": len(chunk_data),
        })
        offset += chunk_size
        chunk_index += 1

    return file_checksum, chunks
