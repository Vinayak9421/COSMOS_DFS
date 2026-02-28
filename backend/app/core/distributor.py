import uuid
from typing import List
from sqlalchemy.orm import Session
from app.models.node import Node
from app.config import settings


def get_online_nodes(db: Session) -> List[Node]:
    # Only ONLINE nodes receive new chunks; MAINTENANCE nodes are read-only
    return db.query(Node).filter(Node.status == "ONLINE").all()


def round_robin_distribute(
    chunks: List[dict],
    nodes: List[Node],
    replication_factor: int = 2,
) -> List[dict]:
    if not nodes:
        raise ValueError("No online nodes available for distribution")

    replication_factor = min(replication_factor, len(nodes))
    assignments = []
    num_nodes = len(nodes)

    for i, chunk in enumerate(chunks):
        primary_chunk_id = chunk["chunk_id"]
        primary_node = nodes[i % num_nodes]

        assignments.append({
            **chunk,
            "node_id": primary_node.id,
            "is_replica": 0,
            "replica_of": None,
        })

        for r in range(1, replication_factor):
            replica_node = nodes[(i + r) % num_nodes]
            assignments.append({
                **chunk,
                "chunk_id": str(uuid.uuid4()),
                "node_id": replica_node.id,
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
    node_loads = {n.id: (n.used_bytes or 0) for n in nodes}
    node_map = {n.id: n for n in nodes}
    assignments = []

    for chunk in chunks:
        # Pick replication_factor least-loaded distinct nodes
        sorted_ids = sorted(node_loads.keys(), key=lambda nid: node_loads[nid])
        selected_ids = sorted_ids[:replication_factor]

        primary_chunk_id = chunk["chunk_id"]
        for i, node_id in enumerate(selected_ids):
            is_replica = 1 if i > 0 else 0
            current_chunk_id = primary_chunk_id if i == 0 else str(uuid.uuid4())

            assignments.append({
                **chunk,
                "chunk_id": current_chunk_id,
                "node_id": node_id,
                "is_replica": is_replica,
                "replica_of": primary_chunk_id if is_replica else None,
            })
            node_loads[node_id] += chunk["size_bytes"]

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
