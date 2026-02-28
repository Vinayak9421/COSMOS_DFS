from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.file_record import FileRecord
from app.models.chunk import Chunk
from app.models.node import Node
from app.services.file_service import upload_file, download_file
from app.core.integrity import verify_chunk

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/upload")
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_data = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    try:
        result = upload_file(file_data, file.filename, mime_type, db)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/list")
def list_files(db: Session = Depends(get_db)):
    files = db.query(FileRecord).order_by(FileRecord.created_at.desc()).all()
    return {
        "files": [
            {
                "file_id": f.file_id,
                "original_name": f.original_name,
                "file_size": f.file_size,
                "total_chunks": f.total_chunks,
                "status": f.status,
                "version": f.version,
                "mime_type": f.mime_type,
                "created_at": str(f.created_at),
            }
            for f in files
        ]
    }


@router.get("/download/{file_id}")
def download(file_id: str, db: Session = Depends(get_db)):
    result = download_file(file_id, db)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="File not found or cannot be reconstructed (check node health)"
        )
    file_data, original_name, mime_type = result
    return Response(
        content=file_data,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )


@router.get("/{file_id}/info")
def file_info(file_id: str, db: Session = Depends(get_db)):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    chunks = db.query(Chunk).filter(Chunk.file_id == file_id).order_by(Chunk.chunk_index).all()
    return {
        "file_id": record.file_id,
        "original_name": record.original_name,
        "file_size": record.file_size,
        "total_chunks": record.total_chunks,
        "checksum": record.checksum,
        "status": record.status,
        "version": record.version,
        "created_at": str(record.created_at),
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "chunk_index": c.chunk_index,
                "node_id": c.node_id,
                "checksum": c.checksum,
                "size_bytes": c.size_bytes,
                "is_replica": bool(c.is_replica),
                "replica_of": c.replica_of,
            }
            for c in chunks
        ],
    }


@router.post("/{file_id}/verify")
def verify_file_integrity(file_id: str, db: Session = Depends(get_db)):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    import os
    chunks = db.query(Chunk).filter(Chunk.file_id == file_id).all()
    results = []

    for chunk in chunks:
        node = db.query(Node).filter(Node.id == chunk.node_id).first()
        if not node or node.status != "ONLINE":
            results.append({
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "node_id": chunk.node_id,
                "is_replica": bool(chunk.is_replica),
                "status": "NODE_OFFLINE",
            })
            continue

        chunk_path = os.path.join(node.storage_path, chunk.chunk_id)
        is_valid = verify_chunk(chunk_path, chunk.checksum)
        results.append({
            "chunk_id": chunk.chunk_id,
            "chunk_index": chunk.chunk_index,
            "node_id": chunk.node_id,
            "is_replica": bool(chunk.is_replica),
            "status": "VALID" if is_valid else "CORRUPTED",
        })

    overall = all(r["status"] == "VALID" for r in results)
    return {
        "file_id": file_id,
        "overall_integrity": "PASS" if overall else "FAIL",
        "chunk_results": results,
    }
