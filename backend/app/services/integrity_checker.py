import asyncio
import os
from app.database import SessionLocal
from app.models.chunk import Chunk
from app.models.node import Node
from app.models.file_record import FileRecord
from app.core.integrity import verify_chunk
from app.config import settings


async def integrity_check_loop():
    """
    Background task: every INTEGRITY_CHECK_INTERVAL seconds, re-verifies
    all primary chunk checksums and updates FileRecord.status to DEGRADED
    if any chunk is missing or corrupted.
    """
    while True:
        await asyncio.sleep(settings.INTEGRITY_CHECK_INTERVAL)
        db = SessionLocal()
        try:
            files = (
                db.query(FileRecord)
                .filter(FileRecord.status != "UPLOADING")
                .all()
            )

            for file_record in files:
                primary_chunks = (
                    db.query(Chunk)
                    .filter(
                        Chunk.file_id == file_record.file_id,
                        Chunk.is_replica == 0,
                    )
                    .all()
                )

                is_degraded = False
                for chunk in primary_chunks:
                    node = db.query(Node).filter(Node.id == chunk.node_id).first()
                    if not node or node.status == "OFFLINE":
                        is_degraded = True
                        continue
                    chunk_path = os.path.join(node.storage_path, chunk.chunk_id)
                    if not verify_chunk(chunk_path, chunk.checksum):
                        is_degraded = True

                new_status = "DEGRADED" if is_degraded else "COMPLETE"
                if file_record.status != new_status:
                    file_record.status = new_status

            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
