import asyncio
import os
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.file_record import FileRecord
from app.models.chunk import Chunk
from app.models.node import Node
from app.models.user import User
from app.services.file_service import (
    upload_file,
    download_file,
    delete_file,
    list_files_for_user,
    get_file_record_by_name,
    list_file_versions,
    get_merkle_proof_for_chunk,      # ← new import
)
from app.core.integrity import verify_chunk
from app.core.security import get_current_user

router = APIRouter(prefix="/files", tags=["Files"])


def _assert_ownership(record: FileRecord, current_user: User):
    if current_user.role != "admin" and record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="File not found")


@router.post("/upload")
async def upload(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per request")

    async def process_one(file: UploadFile) -> dict:
        file_data = await file.read()
        mime_type = file.content_type or "application/octet-stream"
        return await upload_file(file_data, file.filename, mime_type, db, current_user.id)

    results = await asyncio.gather(
        *[process_one(f) for f in files],
        return_exceptions=True,
    )

    successes, failures = [], []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            failures.append({"filename": files[i].filename, "error": str(result)})
        else:
            successes.append(result)

    return {
        "success": len(failures) == 0,
        "total": len(files),
        "succeeded": len(successes),
        "failed_count": len(failures),
        "uploaded": successes,
        "failed": failures,
    }


@router.get("/list")
def list_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scoped_user_id = None if current_user.role == "admin" else current_user.id
    files = list_files_for_user(db, user_id=scoped_user_id)
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
                "is_compressed": bool(f.is_compressed),
                "merkle_root": f.merkle_root,
                "owner_id": f.user_id,
                "created_at": str(f.created_at),
            }
            for f in files
        ]
    }


@router.get("/by-name/{filename}")
def download_by_name(
    filename: str,
    version: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scoped_user_id = None if current_user.role == "admin" else current_user.id
    record = get_file_record_by_name(filename, version, db, user_id=scoped_user_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        result = download_file(record.file_id, db)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if not result:
        raise HTTPException(status_code=503, detail="File cannot be reconstructed — check node health")

    file_data, original_name, mime_type = result
    return Response(
        content=file_data,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )


@router.get("/versions/{filename}")
def get_versions(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scoped_user_id = None if current_user.role == "admin" else current_user.id
    versions = list_file_versions(filename, db, user_id=scoped_user_id)
    if not versions:
        raise HTTPException(status_code=404, detail="No file found with that name")
    return {
        "filename": filename,
        "total_versions": len(versions),
        "versions": [
            {
                "file_id": v.file_id,
                "version": v.version,
                "file_size": v.file_size,
                "total_chunks": v.total_chunks,
                "status": v.status,
                "is_compressed": bool(v.is_compressed),
                "merkle_root": v.merkle_root,
                "created_at": str(v.created_at),
            }
            for v in versions
        ],
    }


@router.get("/download/{file_id}")
def download(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    _assert_ownership(record, current_user)

    try:
        result = download_file(file_id, db)
    except ValueError as e:
        # Merkle root mismatch — file is tampered/corrupted
        raise HTTPException(status_code=409, detail=str(e))

    if not result:
        raise HTTPException(status_code=404, detail="File cannot be reconstructed — check node health")

    file_data, original_name, mime_type = result
    return Response(
        content=file_data,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )


@router.get("/{file_id}/info")
def file_info(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    _assert_ownership(record, current_user)

    chunks = (
        db.query(Chunk)
        .filter(Chunk.file_id == file_id)
        .order_by(Chunk.chunk_index)
        .all()
    )
    return {
        "file_id": record.file_id,
        "original_name": record.original_name,
        "file_size": record.file_size,
        "total_chunks": record.total_chunks,
        "checksum": record.checksum,
        "merkle_root": record.merkle_root,
        "status": record.status,
        "version": record.version,
        "is_compressed": bool(record.is_compressed),
        "owner_id": record.user_id,
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


# ── NEW: Merkle Proof Endpoint ─────────────────────────────────────────────
@router.get("/{file_id}/merkle-proof/{chunk_index}")
def merkle_proof(
    file_id: str,
    chunk_index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a cryptographic Merkle proof for a specific chunk.

    Proves that chunk_index is authentic and part of the original file
    without needing to download any other chunk.

    How to verify independently:
      1. Start with chunk_hash
      2. For each proof_step:
         - If position="right": new_hash = SHA256(current + step.hash)
         - If position="left":  new_hash = SHA256(step.hash + current)
      3. Final result must equal merkle_root
    """
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    _assert_ownership(record, current_user)

    if not record.merkle_root:
        raise HTTPException(
            status_code=404,
            detail="No Merkle tree stored for this file (uploaded before this feature was added)",
        )

    proof = get_merkle_proof_for_chunk(file_id, chunk_index, db)
    if not proof:
        raise HTTPException(
            status_code=404,
            detail=f"chunk_index {chunk_index} does not exist in this file (total chunks: {record.total_chunks})",
        )

    return proof


@router.post("/{file_id}/verify")
def verify_file_integrity(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    _assert_ownership(record, current_user)

    chunks = db.query(Chunk).filter(Chunk.file_id == file_id).all()
    results = []

    for chunk in chunks:
        node = db.query(Node).filter(Node.id == chunk.node_id).first()
        if not node or node.status == "OFFLINE":
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
        "merkle_root": record.merkle_root,
        "overall_integrity": "PASS" if overall else "FAIL",
        "chunk_results": results,
    }


@router.delete("/{file_id}")
def delete_file_endpoint(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    _assert_ownership(record, current_user)

    result = delete_file(file_id, db)
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True, "data": result}
