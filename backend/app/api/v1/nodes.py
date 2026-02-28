import os
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.node import Node
from app.models.chunk import Chunk
from app.core.rebalancer import rebalance_node

router = APIRouter(prefix="/nodes", tags=["Nodes"])


@router.get("/")
def list_nodes(db: Session = Depends(get_db)):
    nodes = db.query(Node).all()
    return {
        "nodes": [
            {
                "id": n.id,
                "status": n.status,
                "storage_path": n.storage_path,
                "capacity_bytes": n.capacity_bytes,
                "used_bytes": n.used_bytes,
                "chunk_count": n.chunk_count,
                "simulated_latency_ms": n.simulated_latency_ms,
                "utilization_percent": round(
                    (n.used_bytes / n.capacity_bytes) * 100, 2
                ) if n.capacity_bytes else 0,
                "last_heartbeat": str(n.last_heartbeat),
            }
            for n in nodes
        ]
    }


@router.post("/{node_id}/kill")
def kill_node(node_id: str, hard: bool = False, db: Session = Depends(get_db)):
    """
    Soft kill: marks node OFFLINE in DB.
    Hard kill (hard=true): also renames storage folder, simulating physical failure.
    Triggers automatic rebalancing after kill.
    """
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status == "OFFLINE":
        raise HTTPException(status_code=400, detail="Node is already offline")

    node.status = "OFFLINE"
    db.commit()

    if hard and os.path.isdir(node.storage_path):
        os.rename(node.storage_path, node.storage_path + "_FAILED")

    rebalance_result = rebalance_node(node_id, db)

    return {
        "message": f"Node {node_id} killed ({'hard' if hard else 'soft'})",
        "rebalance_result": rebalance_result,
    }


@router.post("/{node_id}/recover")
def recover_node(node_id: str, db: Session = Depends(get_db)):
    """Brings an OFFLINE node back ONLINE. Restores folder if it was hard-killed."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status not in ("OFFLINE", "DEGRADED"):
        raise HTTPException(
            status_code=400,
            detail=f"Node is currently {node.status}. Use /activate to bring back from MAINTENANCE.",
        )

    failed_path = node.storage_path + "_FAILED"
    if os.path.isdir(failed_path):
        os.rename(failed_path, node.storage_path)

    os.makedirs(node.storage_path, exist_ok=True)
    node.status = "ONLINE"
    db.commit()

    return {"message": f"Node {node_id} is back ONLINE"}


@router.post("/{node_id}/maintenance")
def set_maintenance(node_id: str, db: Session = Depends(get_db)):
    """
    Sets an ONLINE node to MAINTENANCE mode.
    MAINTENANCE nodes: no new chunks assigned, but existing chunks remain readable.
    """
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status == "OFFLINE":
        raise HTTPException(
            status_code=400,
            detail="Node is offline. Recover it first before setting maintenance.",
        )
    if node.status == "MAINTENANCE":
        raise HTTPException(status_code=400, detail="Node is already in MAINTENANCE mode")

    node.status = "MAINTENANCE"
    db.commit()

    return {
        "message": f"Node {node_id} is now in MAINTENANCE mode",
        "note": "No new chunks will be assigned. Existing chunks are still readable.",
    }


@router.post("/{node_id}/activate")
def activate_node(node_id: str, db: Session = Depends(get_db)):
    """Brings a MAINTENANCE node back to ONLINE."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status != "MAINTENANCE":
        raise HTTPException(
            status_code=400,
            detail=f"Node is not in MAINTENANCE mode (current: {node.status})",
        )

    node.status = "ONLINE"
    db.commit()

    return {"message": f"Node {node_id} is now ONLINE and accepting new chunks"}


@router.get("/{node_id}/chunks")
def get_node_chunks(node_id: str, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    chunks = db.query(Chunk).filter(Chunk.node_id == node_id).all()
    return {
        "node_id": node_id,
        "status": node.status,
        "total_chunks": len(chunks),
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "file_id": c.file_id,
                "chunk_index": c.chunk_index,
                "is_replica": bool(c.is_replica),
                "size_bytes": c.size_bytes,
            }
            for c in chunks
        ],
    }
