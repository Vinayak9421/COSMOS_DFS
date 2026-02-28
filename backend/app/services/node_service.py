import os
from sqlalchemy.orm import Session
from app.models.node import Node
from app.config import settings


def initialize_nodes(db: Session):
    """Creates default satellite nodes on first startup."""
    if db.query(Node).count() > 0:
        return

    for i in range(1, settings.NUM_NODES + 1):
        node_id = f"node_{i:02d}"
        storage_path = os.path.join(settings.STORAGE_PATH, node_id)
        os.makedirs(storage_path, exist_ok=True)

        node = Node(
            id=node_id,
            status="ONLINE",
            storage_path=storage_path,
            capacity_bytes=1073741824,      # 1GB simulated capacity
            used_bytes=0,
            simulated_latency_ms=(i - 1) * 10,   # 0, 10, 20, 30, 40ms simulated orbital latency
            chunk_count=0,
        )
        db.add(node)

    db.commit()
