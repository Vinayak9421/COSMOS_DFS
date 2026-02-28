from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(String, primary_key=True)           # e.g., "node_01"
    status = Column(String, default="ONLINE")        # ONLINE, OFFLINE, DEGRADED
    storage_path = Column(String, nullable=False)
    capacity_bytes = Column(Integer, default=1073741824)  # 1GB
    used_bytes = Column(Integer, default=0)
    simulated_latency_ms = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    last_heartbeat = Column(DateTime, server_default=func.now())
