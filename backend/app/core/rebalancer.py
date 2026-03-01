import os
import shutil
import uuid
from typing import List, Optional, Set
from sqlalchemy.orm import Session

from app.models.chunk import Chunk
from app.models.node import Node


def _ring_distance(idx_a: int, idx_b: int, num_nodes: int) -> int:
    diff = abs(idx_a - idx_b)
    return min(diff, num_nodes - diff)


def _pick_separated_target(
    primary_node_id: str,
    online_nodes: List[Node],
    exclude_node_ids: Set[str],
) -> Optional[Node]:
    num_nodes = len(online_nodes)
    if num_nodes == 0:
        return None

    min_separation = max(1, num_nodes // 2)
    node_ring = {n.id: idx for idx, n in enumerate(online_nodes)}
    primary_idx = node_ring.get(primary_node_id, 0)

    candidates = [n for n in online_nodes if n.id not in exclude_node_ids]
    if not candidates:
        return None

    well_separated = [
        n for n in candidates
        if _ring_distance(node_ring[n.id], primary_idx, num_nodes) >= min_separation
    ]

    pool = well_separated if well_separated else candidates
    return max(pool, key=lambda n: _ring_distance(node_ring[n.id], primary_idx, num_nodes))


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

    db.add(Chunk(
        chunk_id=new_chunk_id,
        file_id=source_chunk.file_id,
        chunk_index=source_chunk.chunk_index,
        node_id=target_node.id,
        checksum=source_chunk.checksum,
        size_bytes=source_chunk.size_bytes,
        is_replica=1,
        replica_of=replica_of or source_chunk.chunk_id,
    ))
    target_node.used_bytes = (target_node.used_bytes or 0) + source_chunk.size_bytes
    target_node.chunk_count = (target_node.chunk_count or 0) + 1


def rebalance_node(failed_node_id: str, db: Session, hard: bool = False) -> dict:
    online_nodes = (
        db.query(Node)
        .filter(Node.status == "ONLINE", Node.id != failed_node_id)
        .all()
    )

    if not online_nodes:
        return {"status": "error", "message": "No online nodes to rebalance to"}

    failed_chunks = db.query(Chunk).filter(Chunk.node_id == failed_node_id).all()

    if not hard:
        return _soft_rebalance(failed_node_id, failed_chunks, online_nodes, db)
    else:
        return _hard_rebalance(failed_node_id, failed_chunks, online_nodes, db)


def _soft_rebalance(
    failed_node_id: str,
    failed_chunks: List[Chunk],
    online_nodes: List[Node],
    db: Session,
) -> dict:
    """
    Soft kill — physical files are STILL ON DISK.
    Strategy: NEVER delete chunk rows. Metadata is preserved exactly as-is.
    When the node recovers, files are instantly accessible again.

    The only action here is to check if primary chunks have at least
    one ONLINE replica so the file remains downloadable during downtime.
    If a primary has no online replica, attempt to create one from the replica
    (which is already on an online node) — but this is rare with smart placement.
    """
    degraded = 0
    ensured = 0

    for chunk in failed_chunks:
        if chunk.is_replica == 0:
            # Primary is offline — check if any replica is online
            online_replica = (
                db.query(Chunk)
                .join(Node, Chunk.node_id == Node.id)
                .filter(
                    Chunk.replica_of == chunk.chunk_id,
                    Chunk.is_replica == 1,
                    Node.status == "ONLINE",
                )
                .first()
            )

            if online_replica:
                ensured += 1
                # ✅ Replica is online — file is accessible during downtime
                # No action needed — chunk row stays intact for when node recovers
            else:
                # Both primary AND all replicas offline — truly degraded
                # Nothing to copy from, just report it
                degraded += 1

        # Replica offline: primary is on another node — file still accessible
        # Row preserved — replica becomes available again on node recovery

    db.commit()
    return {
        "status": "ok",
        "type": "soft",
        "note": "Chunk metadata fully preserved. Files instantly recoverable when node comes back online.",
        "chunks_with_online_replica": ensured,
        "fully_degraded_chunks": degraded,
    }


def _hard_rebalance(
    failed_node_id: str,
    failed_chunks: List[Chunk],
    online_nodes: List[Node],
    db: Session,
) -> dict:
    """
    Hard kill — physical files are PERMANENTLY DESTROYED (folder renamed/deleted).
    Strategy: promote replicas to primaries, create new replicas, delete dead rows.
    """
    rebalanced = 0
    lost = 0

    for chunk in failed_chunks:
        if chunk.is_replica == 0:
            # Primary is permanently gone — promote a replica
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
                old_primary_id = chunk.chunk_id

                # Promote replica → new primary (update in place, keep its chunk_id)
                replica.is_replica = 0
                replica.replica_of = None

                # Delete the permanently dead primary row
                db.delete(chunk)
                db.flush()

                # Fix any other replicas still referencing the dead primary chunk_id
                db.query(Chunk).filter(
                    Chunk.replica_of == old_primary_id
                ).update({"replica_of": replica.chunk_id}, synchronize_session=False)

                # Create new replica on a well-separated online node
                exclude = {failed_node_id, replica.node_id}
                target = _pick_separated_target(replica.node_id, online_nodes, exclude)
                if target:
                    _copy_chunk_to_node(replica, target, db, replica_of=replica.chunk_id)

                rebalanced += 1
            else:
                # No replica found — data is truly lost
                db.delete(chunk)
                lost += 1

        else:
            # Replica is permanently gone — recreate from primary
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
                existing_replicas = (
                    db.query(Chunk)
                    .filter(
                        Chunk.replica_of == primary.chunk_id,
                        Chunk.chunk_id != chunk.chunk_id,
                    )
                    .all()
                )
                exclude = {failed_node_id, primary.node_id} | {r.node_id for r in existing_replicas}
                target = _pick_separated_target(primary.node_id, online_nodes, exclude)
                if target:
                    _copy_chunk_to_node(primary, target, db, replica_of=primary.chunk_id)

            db.delete(chunk)

    db.commit()
    return {
        "status": "ok",
        "type": "hard",
        "rebalanced": rebalanced,
        "lost": lost,
    }
