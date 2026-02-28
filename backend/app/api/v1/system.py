from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.node import Node
from app.models.file_record import FileRecord
from app.models.chunk import Chunk
from app.core.cache import chunk_cache
from app.core.security import get_current_user, require_admin

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health")
def health_check(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),     # any logged-in user
):
    nodes = db.query(Node).all()
    online = sum(1 for n in nodes if n.status == "ONLINE")
    offline = sum(1 for n in nodes if n.status == "OFFLINE")
    degraded = sum(1 for n in nodes if n.status == "DEGRADED")

    return {
        "status": "healthy" if online > 0 else "critical",
        "nodes": {"total": len(nodes), "online": online, "offline": offline, "degraded": degraded},
        "total_files": db.query(FileRecord).count(),
        "total_chunks": db.query(Chunk).count(),
        "cache_size": chunk_cache.size(),
    }


@router.get("/stats")
def system_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),     # any logged-in user
):
    nodes = db.query(Node).all()
    total_used = sum(n.used_bytes or 0 for n in nodes)
    total_capacity = sum(n.capacity_bytes or 0 for n in nodes)

    return {
        "overall": {
            "total_used_bytes": total_used,
            "total_capacity_bytes": total_capacity,
            "utilization_percent": round((total_used / total_capacity) * 100, 2) if total_capacity else 0,
        },
        "nodes": [
            {
                "id": n.id,
                "status": n.status,
                "used_bytes": n.used_bytes,
                "capacity_bytes": n.capacity_bytes,
                "chunk_count": n.chunk_count,
                "simulated_latency_ms": n.simulated_latency_ms,
                "utilization_percent": round(
                    (n.used_bytes / n.capacity_bytes) * 100, 2
                ) if n.capacity_bytes else 0,
            }
            for n in nodes
        ],
        "cache": {
            "cached_chunks": chunk_cache.size(),
            "max_size": chunk_cache.max_size,
        },
    }


@router.delete("/cache/clear")
def clear_cache(current_user=Depends(require_admin)):   # admin only
    chunk_cache.clear()
    return {"message": "Cache cleared successfully"}
