import os
import shutil
import uuid
from sqlalchemy.orm import Session
from app.models.chunk import Chunk
from app.models.node import Node


def rebalance_node(failed_node_id: str, db: Session) -> dict:
    """
    Called when a node goes OFFLINE.
    - Primary chunks: promote a replica to primary, then create a new replica elsewhere.
    - Replica chunks: re-create the replica on another healthy node from the primary.
    """
    online_nodes = (
        db.query(Node)
        .filter(Node.status == "ONLINE", Node.id != failed_node_id)
        .all()
    )

    if not online_nodes:
        return {"status": "error", "message": "No online nodes to rebalance to"}

    failed_chunks = db.query(Chunk).filter(Chunk.node_id == failed_node_id).all()
    rebalanced, lost = 0, 0
    cycle = 0

    for chunk in failed_chunks:
        if chunk.is_replica == 0:
            # PRIMARY chunk lost — promote a replica
            replica = (
                db.query(Chunk)
                .join(Node, Chunk.node_id == Node.id)
                .filter(
                    Chunk.replica_of == chunk.chunk_id,
                    Chunk.is_replica == 1,
                    Node.status == "ONLINE",
                )
                .first()
            )

            if replica:
                # Promote replica → primary
                replica.is_replica = 0
                replica.replica_of = None
                chunk.node_id = replica.node_id
                chunk.chunk_id = replica.chunk_id
                db.delete(replica)

                # Create a new replica on a different healthy node
                other_nodes = [n for n in online_nodes if n.id != replica.node_id]
                if other_nodes:
                    target = other_nodes[cycle % len(other_nodes)]
                    cycle += 1
                    _copy_chunk_to_node(chunk, target, db)

                rebalanced += 1
            else:
                db.delete(chunk)
                lost += 1

        else:
            # REPLICA chunk lost — re-create from primary
            primary = (
                db.query(Chunk)
                .join(Node, Chunk.node_id == Node.id)
                .filter(
                    Chunk.chunk_id == chunk.replica_of,
                    Chunk.is_replica == 0,
                    Node.status == "ONLINE",
                )
                .first()
            )

            if primary:
                other_nodes = [n for n in online_nodes if n.id != primary.node_id]
                if other_nodes:
                    target = other_nodes[cycle % len(other_nodes)]
                    cycle += 1
                    _copy_chunk_to_node(primary, target, db, replica_of=primary.chunk_id)

            db.delete(chunk)

    db.commit()
    return {"status": "ok", "rebalanced": rebalanced, "lost": lost}


def _copy_chunk_to_node(
    source_chunk: Chunk,
    target_node: Node,
    db: Session,
    replica_of: str = None,
):
    source_node = db.query(Node).filter(Node.id == source_chunk.node_id).first()
    if not source_node:
        return

    src_path = os.path.join(source_node.storage_path, source_chunk.chunk_id)
    if not os.path.exists(src_path):
        return

    new_chunk_id = str(uuid.uuid4())
    dst_path = os.path.join(target_node.storage_path, new_chunk_id)
    shutil.copy2(src_path, dst_path)

    new_chunk = Chunk(
        chunk_id=new_chunk_id,
        file_id=source_chunk.file_id,
        chunk_index=source_chunk.chunk_index,
        node_id=target_node.id,
        checksum=source_chunk.checksum,
        size_bytes=source_chunk.size_bytes,
        is_replica=1,
        replica_of=replica_of or source_chunk.chunk_id,
    )
    db.add(new_chunk)
    target_node.used_bytes = (target_node.used_bytes or 0) + source_chunk.size_bytes
    target_node.chunk_count = (target_node.chunk_count or 0) + 1
