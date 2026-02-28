import uuid
from typing import List
from sqlalchemy.orm import Session
from app.models.node import Node


def get_online_nodes(db: Session) -> List[Node]:
    return db.query(Node).filter(Node.status == "ONLINE").all()


def round_robin_distribute(
    chunks: List[dict],
    nodes: List[Node],
    replication_factor: int = 2
) -> List[dict]:
    """
    Assigns each chunk to `replication_factor` different nodes via round-robin.
    Returns flat list of assignments with node_id, is_replica, replica_of added.
    """
    if not nodes:
        raise ValueError("No online nodes available for distribution")

    replication_factor = min(replication_factor, len(nodes))
    assignments = []
    num_nodes = len(nodes)

    for i, chunk in enumerate(chunks):
        primary_node = nodes[i % num_nodes]

        # Primary
        assignments.append({
            **chunk,
            "node_id": primary_node.id,
            "is_replica": 0,
            "replica_of": None,
        })

        # Replicas
        primary_chunk_id = chunk["chunk_id"]
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
