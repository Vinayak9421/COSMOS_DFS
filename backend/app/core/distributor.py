import uuid
from typing import List, Set
from sqlalchemy.orm import Session
from app.models.node import Node
from app.config import settings


def get_online_nodes(db: Session) -> List[Node]:
    return db.query(Node).filter(Node.status == "ONLINE").all()


def _ring_distance(idx_a: int, idx_b: int, num_nodes: int) -> int:
    """
    Shortest distance between two positions on a circular ring of num_nodes.
    e.g. nodes=8, distance(0,6) = min(6, 2) = 2
    """
    diff = abs(idx_a - idx_b)
    return min(diff, num_nodes - diff)


def _pick_separated_indices(
    num_nodes: int,
    replication_factor: int,
    primary_index: int,
) -> List[int]:
    """
    Returns replication_factor node indices, starting with primary_index,
    each at least min_separation apart on the ring.

    min_separation = num_nodes // replication_factor
    e.g. 8 nodes, rf=2 → separation=4 → primary at 0, replica at 4
         8 nodes, rf=3 → separation=2 → primary at 0, replicas at 2, 4

    Gracefully degrades when there aren't enough nodes to honour full separation.
    """
    min_separation = max(1, num_nodes // replication_factor)
    selected = [primary_index]

    for r in range(1, replication_factor):
        # Ideal slot: evenly spaced around the ring
        ideal = (primary_index + min_separation * r) % num_nodes

        best = None
        best_dist_to_ideal = float("inf")

        for candidate in range(num_nodes):
            if candidate in selected:
                continue
            # Must be at least min_separation away from ALL already-selected nodes
            sep_ok = all(
                _ring_distance(candidate, sel, num_nodes) >= min_separation
                for sel in selected
            )
            dist = _ring_distance(candidate, ideal, num_nodes)
            if sep_ok and dist < best_dist_to_ideal:
                best = candidate
                best_dist_to_ideal = dist

        # Fallback: no candidate meets full separation (e.g. 2 nodes, rf=2)
        # Just pick the furthest unselected node
        if best is None:
            unselected = [c for c in range(num_nodes) if c not in selected]
            if unselected:
                best = max(
                    unselected,
                    key=lambda c: _ring_distance(c, primary_index, num_nodes),
                )

        if best is not None:
            selected.append(best)

    return selected


def round_robin_distribute(
    chunks: List[dict],
    nodes: List[Node],
    replication_factor: int = 2,
) -> List[dict]:
    if not nodes:
        raise ValueError("No online nodes available for distribution")

    replication_factor = min(replication_factor, len(nodes))
    num_nodes = len(nodes)
    assignments = []

    for i, chunk in enumerate(chunks):
        primary_index = i % num_nodes
        selected = _pick_separated_indices(num_nodes, replication_factor, primary_index)

        primary_chunk_id = chunk["chunk_id"]

        assignments.append({
            **chunk,
            "node_id": nodes[selected[0]].id,
            "is_replica": 0,
            "replica_of": None,
        })

        for r in range(1, replication_factor):
            assignments.append({
                **chunk,
                "chunk_id": str(uuid.uuid4()),
                "node_id": nodes[selected[r]].id,
                "is_replica": 1,
                "replica_of": primary_chunk_id,
            })

    return assignments


def least_loaded_distribute(
    chunks: List[dict],
    nodes: List[Node],
    replication_factor: int = 2,
) -> List[dict]:
    if not nodes:
        raise ValueError("No online nodes available for distribution")

    replication_factor = min(replication_factor, len(nodes))
    num_nodes = len(nodes)
    node_loads = {n.id: (n.used_bytes or 0) for n in nodes}
    assignments = []

    for chunk in chunks:
        # Primary = least-loaded node
        primary_index = min(range(num_nodes), key=lambda idx: node_loads[nodes[idx].id])

        # Get separation-compliant candidate indices
        selected = _pick_separated_indices(num_nodes, replication_factor, primary_index)

        # Among replica slots (not primary), prefer the least-loaded of the
        # separation-valid candidates. Primary is already optimal (least-loaded).
        if len(selected) > 1:
            selected = [selected[0]] + sorted(
                selected[1:],
                key=lambda idx: node_loads[nodes[idx].id],
            )

        primary_chunk_id = chunk["chunk_id"]

        for i, node_index in enumerate(selected):
            node = nodes[node_index]
            is_replica = 1 if i > 0 else 0
            current_chunk_id = primary_chunk_id if i == 0 else str(uuid.uuid4())

            assignments.append({
                **chunk,
                "chunk_id": current_chunk_id,
                "node_id": node.id,
                "is_replica": is_replica,
                "replica_of": primary_chunk_id if is_replica else None,
            })
            node_loads[node.id] += chunk["size_bytes"]

    return assignments


def distribute(
    chunks: List[dict],
    nodes: List[Node],
    replication_factor: int = 2,
) -> List[dict]:
    """Unified entry point — strategy selected from config."""
    if settings.DISTRIBUTION_STRATEGY == "least_loaded":
        return least_loaded_distribute(chunks, nodes, replication_factor)
    return round_robin_distribute(chunks, nodes, replication_factor)
