import asyncio
import os
from datetime import datetime
from app.database import SessionLocal
from app.models.node import Node
from app.config import settings


async def heartbeat_loop():
    """Background task: checks each node's directory every HEARTBEAT_INTERVAL seconds."""
    while True:
        await asyncio.sleep(settings.HEARTBEAT_INTERVAL)
        db = SessionLocal()
        try:
            nodes = db.query(Node).all()
            for node in nodes:
                # Do not touch nodes that are explicitly OFFLINE or in MAINTENANCE
                if node.status in ("OFFLINE", "MAINTENANCE"):
                    continue

                if os.path.isdir(node.storage_path):
                    node.last_heartbeat = datetime.utcnow()
                    if node.status == "DEGRADED":
                        node.status = "ONLINE"
                else:
                    node.status = "DEGRADED"

            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
