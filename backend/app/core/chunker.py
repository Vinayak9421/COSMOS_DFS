import uuid
import zlib
from typing import List, Tuple
from app.config import settings
from app.core.integrity import compute_sha256


def chunk_file(file_data: bytes) -> Tuple[str, List[dict], bool]:
    """
    Returns (original_file_checksum, list_of_chunk_dicts, is_compressed).
    Uses memoryview for zero-copy slicing — no per-chunk memory allocation.
    Checksum always computed on original uncompressed bytes.
    """
    original_checksum = compute_sha256(file_data)

    is_compressed = settings.ENABLE_COMPRESSION
    if is_compressed:
        processed = zlib.compress(file_data, level=6)
    else:
        processed = file_data

    # memoryview avoids copying bytes on every slice
    mv = memoryview(processed)
    chunk_size = settings.CHUNK_SIZE_BYTES
    total = len(mv)
    chunks = []
    offset = 0
    chunk_index = 0

    while offset < total:
        chunk_slice = mv[offset: offset + chunk_size]  # zero-copy
        chunks.append({
            "chunk_id": str(uuid.uuid4()),
            "chunk_index": chunk_index,
            "data": chunk_slice,           # memoryview — compatible with write() and hashlib
            "checksum": compute_sha256(chunk_slice),
            "size_bytes": len(chunk_slice),
        })
        offset += chunk_size
        chunk_index += 1

    return original_checksum, chunks, is_compressed
