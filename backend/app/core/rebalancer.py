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
    """
    Picks the best target node for a new replica after rebalancing.
    Maximises ring distance from the primary — same philosophy as distributor.
    Falls back to the furthest available node if separation can't be fully met.

    exclude_node_ids: nodes already holding this chunk (primary + existing replicas).
    """
    num_nodes = len(online_nodes)
    if num_nodes == 0:
        return None

    min_separation = max(1, num_nodes // 2)
    node_ring = {n.id: idx for idx, n in enumerate(online_nodes)}
    primary_idx = node_ring.get(primary_node_id, 0)

    candidates = [n for n in online_nodes if n.id not in exclude_node_ids]
    if not candidates:
        return None

    # Prefer nodes that meet full min_separation
    well_separated = [
        n for n in candidates
        if _ring_distance(node_ring[n.id], primary_idx, num_nodes) >= min_separation
    ]

    pool = well_separated if well_separated else candidates
    # Among valid candidates, pick the one with the most ring distance from primary
    return max(pool, key=lambda n: _ring_distance(node_ring[n.id], primary_idx, num_nodes))


def rebalance_node(failed_node_id: str, db: Session) -> dict:
    """
    Called when a node goes OFFLINE.
    - Primary chunks: promote a replica to primary, create new replica with separation.
    - Replica chunks: re-create the replica on a well-separated node from the primary.
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

    for chunk in failed_chunks:
        if chunk.is_replica == 0:
            # ── PRIMARY lost: promote a replica, then create new replica ──
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
                promoted_node_id = replica.node_id

                # Promote replica → primary
                replica.is_replica = 0
                replica.replica_of = None
                db.delete(chunk)

                # All nodes already holding this chunk
                exclude = {failed_node_id, promoted_node_id}

                # Create new replica on a well-separated node
                target = _pick_separated_target(promoted_node_id, online_nodes, exclude)
                if target:
                    _copy_chunk_to_node(replica, target, db, replica_of=replica.chunk_id)

                rebalanced += 1
            else:
                db.delete(chunk)
                lost += 1

        else:
            # ── REPLICA lost: re-create it from primary ──
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
                # Exclude: failed node, primary node, any other existing replica node
                existing_replicas = (
                    db.query(Chunk)
                    .filter(
                        Chunk.replica_of == primary.chunk_id,
                        Chunk.is_replica == 1,
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
