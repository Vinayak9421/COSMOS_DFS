"""
storage_backend.py — Abstraction layer for chunk storage.

LOCAL DEV:   Reads/writes chunks to local node folders (default).
AWS PROD:    Reads/writes chunks to S3 using boto3.

To switch: set STORAGE_BACKEND=s3 in your .env and fill in AWS credentials.
Only THIS file needs to change — no other code touches raw file I/O.
"""
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.config import settings


class StorageBackend(ABC):
    """Abstract interface for chunk storage."""

    @abstractmethod
    def write_chunk(self, node_path: str, chunk_id: str, data: bytes) -> None:
        """Write a chunk to storage."""

    @abstractmethod
    def read_chunk(self, node_path: str, chunk_id: str) -> Optional[bytes]:
        """Read a chunk from storage. Returns None if not found."""

    @abstractmethod
    def delete_chunk(self, node_path: str, chunk_id: str) -> bool:
        """Delete a chunk. Returns True if deleted, False if not found."""

    @abstractmethod
    def chunk_exists(self, node_path: str, chunk_id: str) -> bool:
        """Check if a chunk exists in storage."""


class LocalStorageBackend(StorageBackend):
    """
    Default — stores chunks as files on local disk.
    node_path = absolute path to the node's storage folder.
    """

    def write_chunk(self, node_path: str, chunk_id: str, data: bytes) -> None:
        chunk_path = Path(node_path) / chunk_id
        os.makedirs(node_path, exist_ok=True)
        with open(chunk_path, "wb") as f:
            f.write(data)

    def read_chunk(self, node_path: str, chunk_id: str) -> Optional[bytes]:
        chunk_path = Path(node_path) / chunk_id
        if not chunk_path.exists():
            return None
        with open(chunk_path, "rb") as f:
            return f.read()

    def delete_chunk(self, node_path: str, chunk_id: str) -> bool:
        chunk_path = Path(node_path) / chunk_id
        try:
            chunk_path.unlink()
            return True
        except FileNotFoundError:
            return False
        except Exception as e:
            print(f"Warning: Could not delete chunk at {chunk_path}: {e}")
            return False

    def chunk_exists(self, node_path: str, chunk_id: str) -> bool:
        return (Path(node_path) / chunk_id).exists()


class S3StorageBackend(StorageBackend):
    """
    AWS S3 storage backend (stub — fill in when deploying to AWS).

    S3 Key pattern:  nodes/{node_id}/chunks/{chunk_id}
    The node_path parameter maps to the S3 prefix.

    Prerequisites:
      pip install boto3
      Set in .env:
        STORAGE_BACKEND=s3
        AWS_S3_BUCKET=your-bucket
        AWS_REGION=ap-south-1
        AWS_ACCESS_KEY_ID=...       (or use IAM role on EC2/ECS)
        AWS_SECRET_ACCESS_KEY=...
    """

    def __init__(self):
        try:
            import boto3
            self._s3 = boto3.client(
                "s3",
                region_name=settings.AWS_REGION,
            )
            self._bucket = settings.AWS_S3_BUCKET
            if not self._bucket:
                raise ValueError("AWS_S3_BUCKET is not set in .env")
            print(f"[S3] Connected to bucket: {self._bucket}")
        except ImportError:
            raise RuntimeError(
                "boto3 is required for S3 storage backend. "
                "Install it: pip install boto3"
            )

    def _key(self, node_path: str, chunk_id: str) -> str:
        """Build S3 key from node path + chunk ID."""
        # Extract node folder name from the local path pattern
        node_name = Path(node_path).name  # e.g., "node_1"
        return f"nodes/{node_name}/chunks/{chunk_id}"

    def write_chunk(self, node_path: str, chunk_id: str, data: bytes) -> None:
        self._s3.put_object(
            Bucket=self._bucket,
            Key=self._key(node_path, chunk_id),
            Body=data,
            ServerSideEncryption="AES256",
        )

    def read_chunk(self, node_path: str, chunk_id: str) -> Optional[bytes]:
        try:
            response = self._s3.get_object(
                Bucket=self._bucket,
                Key=self._key(node_path, chunk_id),
            )
            return response["Body"].read()
        except self._s3.exceptions.NoSuchKey:
            return None
        except Exception:
            return None

    def delete_chunk(self, node_path: str, chunk_id: str) -> bool:
        try:
            self._s3.delete_object(
                Bucket=self._bucket,
                Key=self._key(node_path, chunk_id),
            )
            return True
        except Exception:
            return False

    def chunk_exists(self, node_path: str, chunk_id: str) -> bool:
        try:
            self._s3.head_object(
                Bucket=self._bucket,
                Key=self._key(node_path, chunk_id),
            )
            return True
        except Exception:
            return False


# ── Singleton — created once at import time ──────────────────────────────
def _create_backend() -> StorageBackend:
    backend_type = settings.STORAGE_BACKEND.lower()
    if backend_type == "s3":
        print("[STORAGE] Using S3 backend")
        return S3StorageBackend()
    else:
        print("[STORAGE] Using local disk backend")
        return LocalStorageBackend()


storage = _create_backend()
