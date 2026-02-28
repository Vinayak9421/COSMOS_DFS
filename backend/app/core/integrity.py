import hashlib
import os
from typing import Optional


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_chunk(chunk_path: str, expected_checksum: str) -> bool:
    if not os.path.exists(chunk_path):
        return False
    with open(chunk_path, "rb") as f:
        data = f.read()
    return compute_sha256(data) == expected_checksum


def read_chunk_data(chunk_path: str) -> Optional[bytes]:
    if not os.path.exists(chunk_path):
        return None
    with open(chunk_path, "rb") as f:
        return f.read()
