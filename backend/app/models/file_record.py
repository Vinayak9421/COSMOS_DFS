from sqlalchemy import Column, String, Integer, DateTime, BigInteger, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class FileRecord(Base):
    __tablename__ = "file_records"

    file_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    original_name = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    total_chunks = Column(Integer, nullable=False)
    mime_type = Column(String, default="application/octet-stream")
    checksum = Column(String, nullable=False)       # SHA-256 of original full file
    merkle_root = Column(String, nullable=True)     # Merkle root of all chunk hashes
    version = Column(Integer, default=1)
    status = Column(String, default="COMPLETE")     # UPLOADING, COMPLETE, DEGRADED
    is_compressed = Column(Integer, default=0)      # 0 = raw, 1 = zlib compressed
    created_at = Column(DateTime, server_default=func.now())
