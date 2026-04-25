from typing import Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..config import config
from ..db import get_db
from ..limiter import limiter
from ..models.document import Folder
from ..services.document_processor import enqueue
from ..services.document_service import DocumentService
from ..services.limits import NoopLimiter, get_usage_limiter
from ..storage import get_storage_backend
from ._pagination import paginated

logger = structlog.get_logger()
router = APIRouter(prefix="/api/folders", tags=["folders"])


async def _do_link_and_propagate(
    svc: DocumentService,
    db,
    folder_id: str,
    sift_id: str,
):
    """Link sift to folder + all subfolders, enqueue existing docs. Returns (link, enqueued, subfolder_count)."""
    link = await svc.link_extractor(folder_id, sift_id)
    subfolder_ids = await svc.get_subfolder_ids(folder_id)
    for sub_id in subfolder_ids:
        await svc.link_extractor(sub_id, sift_id)

    enqueued = 0
    for fid in [folder_id] + subfolder_ids:
        docs = await db["documents"].find({"folder_id": fid}).to_list(length=None)
        for doc in docs:
            doc_id = str(doc["_id"])
            storage_path = doc.get("storage_path")
            if not storage_path:
                continue
            if await db["document_sift_statuses"].find_one({"document_id": doc_id, "sift_id": sift_id}):
                continue
            await svc.create_sift_status(doc_id, sift_id)
            await enqueue(doc_id, sift_id, storage_path)
            enqueued += 1

    if enqueued > 0:
        await db["sifts"].update_one(
            {"_id": ObjectId(sift_id)},
            {"$inc": {"total_documents": enqueued}, "$set": {"status": "indexing"}},
        )

    return link, enqueued, len(subfolder_ids)


async def _do_unlink_and_propagate(svc: DocumentService, folder_id: str, sift_id: str) -> bool:
    """Unlink sift from folder and all subfolders."""
    ok = await svc.unlink_extractor(folder_id, sift_id)
    for sub_id in await svc.get_subfolder_ids(folder_id):
        await svc.unlink_extractor(sub_id, sift_id)
    return ok


class CreateFolderRequest(BaseModel):
    name: str
    description: str = ""
    parent_id: Optional[str] = None


class UpdateFolderRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class LinkSiftRequest(BaseModel):
    sift_id: str


def _folder_dict(f: Folder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "description": f.description,
        "document_count": f.document_count,
        "parent_id": f.parent_id,
        "path": f.path,
        "created_at": f.created_at.isoformat(),
    }


@router.get("")
async def list_folders(
    limit: int = 200,
    offset: int = 0,
    parent_id: Optional[str] = None,
    all: bool = True,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """List folders. By default returns all folders (flat).
    Pass ?all=false&parent_id=root for root-level folders.
    Pass ?all=false&parent_id={id} for direct children."""
    svc = DocumentService(db)
    if all:
        folders, total = await svc.list_folders(skip=offset, limit=limit, parent_id="ALL", org_id=principal.org_id)
    elif parent_id == "root":
        folders, total = await svc.list_folders(skip=offset, limit=limit, parent_id=None, org_id=principal.org_id)
    else:
        folders, total = await svc.list_folders(skip=offset, limit=limit, parent_id=parent_id, org_id=principal.org_id)
    return paginated([_folder_dict(f) for f in folders], total, limit, offset)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: CreateFolderRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    await svc.ensure_indexes()
    folder = await svc.create_folder(body.name, body.description, parent_id=body.parent_id, org_id=principal.org_id)

    if body.parent_id:
        for sid in await svc.collect_effective_sift_ids(body.parent_id):
            await svc.link_extractor(folder.id, sid)

    return _folder_dict(folder)


@router.get("/by-path")
async def get_folder_by_path(
    path: str,
    create: bool = False,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Resolve a folder by its path. Pass create=true to auto-create intermediate folders."""
    svc = DocumentService(db)
    if create:
        await svc.ensure_indexes()
        folder = await svc.get_or_create_folder_by_path(path)
    else:
        folder = await svc.get_folder_by_path(path)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    return _folder_dict(folder)


@router.patch("/by-path")
async def update_folder_by_path(
    path: str,
    body: UpdateFolderRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Update a folder identified by its path."""
    svc = DocumentService(db)
    folder = await svc.get_folder_by_path(path)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    folder = await svc.update_folder(folder.id, updates)
    return _folder_dict(folder)


@router.delete("/by-path", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder_by_path(
    path: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Delete a folder identified by its path."""
    svc = DocumentService(db)
    folder = await svc.get_folder_by_path(path)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await svc.delete_folder(folder.id)


@router.get("/{folder_id}")
async def get_folder(
    folder_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    folder = await svc.get_folder(folder_id, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    extractors = await svc.list_folder_extractors(folder_id)
    inherited = await svc.list_inherited_extractors(folder_id)
    return {
        **_folder_dict(folder),
        "extractors": [
            {"id": e.id, "sift_id": e.sift_id, "created_at": e.created_at.isoformat()}
            for e in extractors
        ],
        "inherited_extractors": [
            {"id": e.id, "sift_id": e.sift_id, "folder_id": e.folder_id, "created_at": e.created_at.isoformat()}
            for e in inherited
        ],
    }


@router.get("/{folder_id}/path")
async def get_folder_path(
    folder_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Return ordered list of ancestor folders from root to this folder (for breadcrumbs)."""
    svc = DocumentService(db)
    ancestors = await svc.get_folder_path(folder_id)
    return [_folder_dict(f) for f in ancestors]


@router.patch("/{folder_id}")
async def update_folder(
    folder_id: str,
    body: UpdateFolderRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    folder = await svc.update_folder(folder_id, updates, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return _folder_dict(folder)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    ok = await svc.delete_folder(folder_id, org_id=principal.org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Folder not found")


# ---- Folder ↔ Sift links ----

@router.get("/{folder_id}/sifts")
async def list_sifts_for_folder(
    folder_id: str,
    limit: int = 100,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    folder = await svc.get_folder(folder_id, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    links = await svc.list_folder_extractors(folder_id)
    items = [{"id": l.id, "sift_id": l.sift_id, "created_at": l.created_at.isoformat()} for l in links]
    return paginated(items[offset:offset + limit], len(items), limit, offset)


@router.post("/{folder_id}/sifts", status_code=status.HTTP_201_CREATED)
async def link_sift(
    folder_id: str,
    body: LinkSiftRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    if not await svc.get_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")
    link, enqueued, sub_count = await _do_link_and_propagate(svc, db, folder_id, body.sift_id)
    return {
        "id": link.id,
        "folder_id": link.folder_id,
        "sift_id": link.sift_id,
        "created_at": link.created_at.isoformat(),
        "enqueued_existing": enqueued,
        "propagated_to_subfolders": sub_count,
    }


@router.delete("/{folder_id}/sifts/{sift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_sift(
    folder_id: str,
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    ok = await _do_unlink_and_propagate(svc, folder_id, sift_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")


# ---- Legacy extractor routes (backward compat) ----

@router.get("/{folder_id}/extractors")
async def list_extractors(
    folder_id: str,
    limit: int = 100,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    folder = await svc.get_folder(folder_id, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    links = await svc.list_folder_extractors(folder_id)
    items = [
        {"id": l.id, "sift_id": l.sift_id, "extraction_id": l.sift_id, "created_at": l.created_at.isoformat()}
        for l in links
    ]
    return paginated(items[offset:offset + limit], len(items), limit, offset)


@router.post("/{folder_id}/extractors", status_code=status.HTTP_201_CREATED)
async def link_extractor(
    folder_id: str,
    body: dict,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    sift_id = body.get("sift_id") or body.get("extraction_id")
    if not sift_id:
        raise HTTPException(status_code=422, detail="sift_id is required")
    svc = DocumentService(db)
    if not await svc.get_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")
    link, enqueued, sub_count = await _do_link_and_propagate(svc, db, folder_id, sift_id)
    return {
        "id": link.id,
        "folder_id": link.folder_id,
        "sift_id": link.sift_id,
        "extraction_id": link.sift_id,
        "created_at": link.created_at.isoformat(),
        "enqueued_existing": enqueued,
        "propagated_to_subfolders": sub_count,
    }


@router.delete("/{folder_id}/extractors/{sift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_extractor(
    folder_id: str,
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    ok = await _do_unlink_and_propagate(svc, folder_id, sift_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")


# ---- Documents ----

@router.get("/{folder_id}/documents")
async def list_documents(
    folder_id: str,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    folder = await svc.get_folder(folder_id, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    documents, total = await svc.list_documents(folder_id, skip=offset, limit=limit)
    return paginated(documents, total, limit, offset)


@router.post("/{folder_id}/documents", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("30/minute")
async def upload_document(
    request: Request,
    folder_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
    usage: NoopLimiter = Depends(get_usage_limiter),
    file: UploadFile = File(...),
    on_conflict: str = Form("fail"),
):
    svc = DocumentService(db)
    folder = await svc.get_folder(folder_id, org_id=principal.org_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    from ..services.file_processor import FileProcessor
    if not FileProcessor().is_supported(file.filename or ""):
        from pathlib import Path
        ext = Path(file.filename or "").suffix or "(none)"
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext}")

    max_bytes = config.max_file_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds max size of {config.max_file_size_mb}MB",
        )

    if (file.filename or "").lower().endswith(".pdf"):
        from ..services.file_processor import count_pdf_pages

        pages = count_pdf_pages(content)
        if pages is not None and pages > config.max_pdf_pages:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"PDF {file.filename} has {pages} pages; max is "
                    f"{config.max_pdf_pages}. Split the document and retry."
                ),
            )


    storage = get_storage_backend()
    storage_path = await storage.save(folder_id, file.filename, content)

    conflict = on_conflict if on_conflict in ("fail", "replace") else "replace"
    try:
        doc = await svc.save_document(
            filename=file.filename,
            content_type=file.content_type or "application/octet-stream",
            folder_id=folder_id,
            size_bytes=len(content),
            storage_path=storage_path,
            on_conflict=conflict,
            org_id=principal.org_id,
        )
    except Exception as e:
        if "DuplicateKeyError" in type(e).__name__ or "E11000" in str(e):
            raise HTTPException(status_code=409, detail=f"Document '{file.filename}' already exists in this folder.")
        raise

    sift_ids = await svc.collect_effective_sift_ids(folder_id)
    is_replace = on_conflict == "replace"

    enqueued = []
    for sid in sift_ids:
        if is_replace:
            await svc.reset_sift_status(doc.id, sid)
        else:
            await svc.create_sift_status(doc.id, sid)
        await enqueue(doc.id, sid, doc.storage_path)
        enqueued.append(sid)
        if not is_replace:
            await db["sifts"].update_one(
                {"_id": ObjectId(sid)},
                {"$inc": {"total_documents": 1}, "$set": {"status": "indexing"}},
            )
        else:
            await db["sifts"].update_one(
                {"_id": ObjectId(sid)},
                {"$set": {"status": "indexing"}},
            )

    return {
        "id": doc.id,
        "filename": doc.filename,
        "size_bytes": doc.size_bytes,
        "enqueued_for": enqueued,
    }
