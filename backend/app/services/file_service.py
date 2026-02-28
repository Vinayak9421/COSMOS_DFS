import os
import uuid
import mimetypes
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models.file_record import FileRecord
from app.models.chunk import Chunk
from app.models.node import Node
from app.core.chunker import chunk_file
from app.core.distributor import get_online_nodes, round_robin_distribute
from app.core.reconstructor import reconstruct_file
from app.config import settings


def upload_file(
    file_data: bytes,
    original_name: str,
    mime_type: str,
    db: Session,
) -> dict:
    # Handle versioning: same filename = new version
    latest = (
        db.query(FileRecord)
        .filter(FileRecord.original_name == original_name)
        .order_by(FileRecord.version.desc())
        .first()
    )
    version = (latest.version + 1) if latest else 1

    # Chunk the file
    file_checksum, chunks = chunk_file(file_data)

    # Get available nodes
    nodes = get_online_nodes(db)
    if not nodes:
        raise ValueError("No online satellite nodes available")

    replication_factor = min(settings.REPLICATION_FACTOR, len(nodes))
    assignments = round_robin_distribute(chunks, nodes, replication_factor)

    # Create file record
    file_id = str(uuid.uuid4())
    file_record = FileRecord(
        file_id=file_id,
        original_name=original_name,
        file_size=len(file_data),
        total_chunks=len(chunks),
        mime_type=mime_type,
        checksum=file_checksum,
        version=version,
        status="UPLOADING",
    )
    db.add(file_record)
    db.flush()

    # Write chunks to node folders + persist metadata
    for assignment in assignments:
        node = db.query(Node).filter(Node.id == assignment["node_id"]).first()
        chunk_path = os.path.join(node.storage_path, assignment["chunk_id"])

        with open(chunk_path, "wb") as f:
            f.write(assignment["data"])

        db.add(Chunk(
            chunk_id=assignment["chunk_id"],
            file_id=file_id,
            chunk_index=assignment["chunk_index"],
            node_id=assignment["node_id"],
            checksum=assignment["checksum"],
            size_bytes=assignment["size_bytes"],
            is_replica=assignment["is_replica"],
            replica_of=assignment["replica_of"],
        ))

        node.used_bytes = (node.used_bytes or 0) + assignment["size_bytes"]
        node.chunk_count = (node.chunk_count or 0) + 1

    file_record.status = "COMPLETE"
    db.commit()

    return {
        "file_id": file_id,
        "original_name": original_name,
        "file_size": len(file_data),
        "total_chunks": len(chunks),
        "replication_factor": replication_factor,
        "checksum": file_checksum,
        "version": version,
    }


def download_file(
    file_id: str, db: Session
) -> Optional[Tuple[bytes, str, str]]:
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        return None

    file_data = reconstruct_file(file_id, db)
    if file_data is None:
        return None

    return file_data, record.original_name, record.mime_type
