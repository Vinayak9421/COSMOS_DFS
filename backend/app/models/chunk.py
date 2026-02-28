from sqlalchemy import Column, String, Integer, DateTime, BigInteger, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Chunk(Base):
    __tablename__ = "chunks"

    chunk_id = Column(String, primary_key=True)      # UUID
    file_id = Column(String, ForeignKey("file_records.file_id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)     # order index for reconstruction
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    checksum = Column(String, nullable=False)         # SHA-256 of this chunk
    size_bytes = Column(BigInteger, nullable=False)
    is_replica = Column(Integer, default=0)           # 0 = primary, 1 = replica
    replica_of = Column(String, nullable=True)        # chunk_id of primary if replica
    created_at = Column(DateTime, server_default=func.now())
