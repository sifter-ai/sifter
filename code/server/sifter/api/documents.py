from typing import Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..services.document_processor import enqueue
from ..services.document_service import DocumentService

logger = structlog.get_logger()
router = APIRouter(prefix="/api/documents", tags=["documents"])

_MAX_DPI = 300
_DEFAULT_DPI = 150


class ReprocessRequest(BaseModel):
    sift_id: Optional[str] = None


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    statuses = await svc.get_document_statuses(document_id)
    return {
        "id": doc.id,
        "filename": doc.filename,
        "original_filename": doc.original_filename,
        "content_type": doc.content_type,
        "size_bytes": doc.size_bytes,
        "folder_id": doc.folder_id,
        "uploaded_at": doc.uploaded_at.isoformat(),
        "sift_statuses": [
            {
                "id": s.id,
                "sift_id": s.sift_id,
                "status": s.status,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "error_message": s.error_message,
                "filter_reason": s.filter_reason,
                "sift_record_id": s.sift_record_id,
            }
            for s in statuses
        ],
    }


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..storage import get_storage_backend
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    storage = get_storage_backend()
    data = await storage.load(doc.storage_path)

    safe_filename = doc.original_filename.replace('"', '\\"')
    return Response(
        content=data,
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    ok = await svc.delete_document(document_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")


@router.post("/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_document(
    document_id: str,
    body: ReprocessRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.sift_id:
        sift_ids = [body.sift_id]
    else:
        links = await svc.list_folder_extractors(doc.folder_id)
        sift_ids = [l.sift_id for l in links]

    if not sift_ids:
        raise HTTPException(status_code=400, detail="No sifts linked to this document's folder")

    from ..models.document import DocumentSiftStatusEnum

    enqueued = []
    for sift_id in sift_ids:
        await svc.update_sift_status(document_id, sift_id, DocumentSiftStatusEnum.PENDING)
        await enqueue(document_id, sift_id, doc.storage_path)
        enqueued.append(sift_id)

    return {"document_id": document_id, "enqueued_for": enqueued}


@router.get("/{document_id}/pages")
async def list_document_pages(
    document_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from ..storage import local_path as storage_local_path

    try:
        import fitz
    except ImportError:
        raise HTTPException(status_code=501, detail="PDF rendering not available (pymupdf not installed)")

    async with storage_local_path(doc.storage_path) as local_file:
        pdf = fitz.open(str(local_file))
        items = []
        for i, page in enumerate(pdf, start=1):
            rect = page.rect
            items.append({
                "page": i,
                "width": rect.width,
                "height": rect.height,
                "thumbnail_url": f"/api/documents/{document_id}/pages/{i}/image?dpi=72",
            })
        pdf.close()

    return {"items": items, "total": len(items)}


@router.get("/{document_id}/pages/{page_number}/image")
async def get_document_page_image(
    document_id: str,
    page_number: int,
    dpi: int = Query(default=_DEFAULT_DPI, ge=36, le=_MAX_DPI),
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from ..storage import get_storage_backend, local_path as storage_local_path

    storage = get_storage_backend()
    cache_key = f"__pages/{document_id}/{page_number}@{dpi}.png"

    # Try cache first
    try:
        cached = await storage.load(cache_key)
        return Response(content=cached, media_type="image/png")
    except Exception:
        pass

    try:
        import fitz
    except ImportError:
        raise HTTPException(status_code=501, detail="PDF rendering not available (pymupdf not installed)")

    async with storage_local_path(doc.storage_path) as local_file:
        pdf = fitz.open(str(local_file))
        n_pages = len(pdf)
        if page_number < 1 or page_number > n_pages:
            pdf.close()
            raise HTTPException(status_code=404, detail=f"Page {page_number} not found (document has {n_pages} pages)")

        page = pdf[page_number - 1]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        png_bytes: bytes = pix.tobytes("png")
        pdf.close()

    # Cache for future requests
    try:
        await storage.save("__pages", f"{document_id}/{page_number}@{dpi}.png", png_bytes)
    except Exception:
        pass  # Cache failure is non-fatal

    return Response(content=png_bytes, media_type="image/png")
