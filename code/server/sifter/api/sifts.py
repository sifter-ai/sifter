import asyncio
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
import warnings
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..config import config
from ..db import get_db
from ..limiter import limiter
from ..models.sift import Sift, SiftStatus
from ..services.limits import NoopLimiter, get_usage_limiter
from ..services.pipeline_validator import cap_limit, validate_pipeline
from ..services.sift_results import SiftResultsService
from ..services.sift_service import SiftService
from ..storage import get_storage_backend
from ._pagination import paginated

logger = structlog.get_logger()
router = APIRouter(prefix="/api/sifts", tags=["sifts"])


with warnings.catch_warnings():
    warnings.filterwarnings("ignore", message="Field name.*shadows", category=UserWarning)

    class CreateSiftRequest(BaseModel):
        name: str
        description: str = ""
        instructions: str
        schema: Optional[str] = None
        multi_record: bool = False

    class UpdateSiftRequest(BaseModel):
        name: Optional[str] = None
        description: Optional[str] = None
        instructions: Optional[str] = None
        schema: Optional[str] = None
        multi_record: Optional[bool] = None


class QueryRequest(BaseModel):
    query: str
    execute: bool = True


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class AggregateRequest(BaseModel):
    pipeline: list[dict]
    limit: int = 1000


class BatchRecordsRequest(BaseModel):
    ids: list[str]


class ExtractRequest(BaseModel):
    document_id: str


# ---------------------------------------------------------------------------
# Cursor helpers
# ---------------------------------------------------------------------------

def _encode_cursor(object_id: ObjectId) -> str:
    return base64.b64encode(str(object_id).encode()).decode()


def _decode_cursor(cursor: str) -> ObjectId:
    try:
        return ObjectId(base64.b64decode(cursor.encode()).decode())
    except Exception:
        raise HTTPException(status_code=400, detail="invalid cursor")


# ---------------------------------------------------------------------------
# Filter DSL helpers
# ---------------------------------------------------------------------------

_LOGICAL_OPS = {"$and", "$or", "$not", "$nor"}


def _translate_filter(f: dict) -> dict:
    """Translate user-facing filter dict to MongoDB query against extracted_data.*"""
    out = {}
    for key, val in f.items():
        if key in _LOGICAL_OPS:
            # Recurse into logical operator lists
            if isinstance(val, list):
                out[key] = [_translate_filter(clause) for clause in val]
            else:
                out[key] = _translate_filter(val)
        elif key.startswith("$"):
            out[key] = val
        else:
            out[f"extracted_data.{key}"] = val
    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=dict)
async def create_sift(
    body: CreateSiftRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
    usage: NoopLimiter = Depends(get_usage_limiter),
):
    await usage.check_sift_create(principal.org_id)
    svc = SiftService(db)
    await svc.ensure_indexes()

    sift = await svc.create(
        name=body.name,
        description=body.description,
        instructions=body.instructions,
        schema=body.schema,
        multi_record=body.multi_record,
        org_id=principal.org_id,
    )

    return _sift_to_dict(sift)


@router.get("", response_model=dict)
async def list_sifts(
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sifts, total = await svc.list_all(skip=offset, limit=limit, org_id=principal.org_id)
    return paginated([_sift_to_dict(s) for s in sifts], total, limit, offset)


@router.get("/{sift_id}", response_model=dict)
async def get_sift(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return _sift_to_dict(sift)


@router.patch("/{sift_id}", response_model=dict)
async def update_sift(
    sift_id: str,
    body: UpdateSiftRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    sift = await svc.update(sift_id, updates)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return _sift_to_dict(sift)


@router.get("/{sift_id}/folders")
async def list_sift_folders(
    sift_id: str,
    limit: int = 100,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Return root-level folders that have this sift linked to them.

    When a sift is linked to a folder, it propagates to all subfolders
    (folder_extractors gets rows for every descendant). This endpoint filters
    those out and returns only the top-level entries — folders whose parent is
    not also in the linked set.
    """
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    links = await db["folder_extractors"].find({"sift_id": sift_id}).to_list(length=None)
    folder_ids = [ObjectId(lnk["folder_id"]) for lnk in links if lnk.get("folder_id")]
    if not folder_ids:
        return paginated([], 0, limit, offset)
    folders = await db["folders"].find({"_id": {"$in": folder_ids}}).to_list(length=None)
    linked_id_set = {str(f["_id"]) for f in folders}
    result = [
        {"id": str(f["_id"]), "name": f.get("name", ""), "path": f.get("path")}
        for f in folders
        if not f.get("parent_id") or f.get("parent_id") not in linked_id_set
    ]
    total = len(result)
    return paginated(result[offset:offset + limit], total, limit, offset)


@router.delete("/{sift_id}")
async def delete_sift(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    deleted = await svc.delete(sift_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sift not found")
    await db["folder_extractors"].delete_many({"sift_id": sift_id})
    await db["document_sift_statuses"].delete_many({"sift_id": sift_id})
    await db["processing_queue"].delete_many({"sift_id": sift_id, "status": {"$in": ["pending", "processing"]}})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Upload / reindex / reset
# ---------------------------------------------------------------------------

@router.post("/{sift_id}/upload")
@limiter.limit("30/minute")
async def upload_documents(
    request: Request,
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
    usage: NoopLimiter = Depends(get_usage_limiter),
    files: list[UploadFile] = File(...),
    on_conflict: str = Form("fail"),
):
    from ..services.document_service import DocumentService
    from ..services.document_processor import enqueue

    svc = SiftService(db)
    doc_svc = DocumentService(db)

    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    folder_id = sift.default_folder_id
    if not folder_id:
        try:
            folder = await doc_svc.create_folder(sift.name, "", org_id=principal.org_id)
        except Exception as e:
            if "E11000" in str(e) or "DuplicateKeyError" in type(e).__name__:
                # Folder with same name already exists — use a unique name based on sift_id
                folder = await doc_svc.create_folder(f"{sift.name}-{sift_id[:8]}", "", org_id=principal.org_id)
            else:
                raise
        await doc_svc.link_extractor(folder.id, sift_id)
        await svc.update(sift_id, {"default_folder_id": folder.id})
        folder_id = folder.id

    # Flip to INDEXING upfront so the UI (and API consumers polling /sifts)
    # reflect the new state while the file loop runs. Without this, the status
    # stays ACTIVE for the whole request — which can be several seconds — and
    # by the time the loop finishes a fast worker may already have transitioned
    # the sift back to ACTIVE, so the indexing state is never observed.
    await svc.update(sift_id, {"status": SiftStatus.INDEXING, "error": None})

    max_bytes = config.max_file_size_mb * 1024 * 1024
    storage = get_storage_backend()
    uploaded_files = []

    for file in files:
        content = await file.read()
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File {file.filename} exceeds max size of {config.max_file_size_mb}MB",
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

        storage_path = await storage.save(folder_id, file.filename, content)
        conflict = on_conflict if on_conflict in ("fail", "replace") else "replace"
        try:
            doc = await doc_svc.save_document(
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
                raise HTTPException(status_code=409, detail=f"Document '{file.filename}' already exists in this sift.")
            raise
        await doc_svc.create_sift_status(doc.id, sift_id)

        # Atomically bump total_documents and flip to INDEXING *before* enqueue.
        # Otherwise a fast worker can finish the task, see processed>=total, and
        # mark the sift ACTIVE before we ever record the new total — leaving it
        # stuck in INDEXING once we set the total afterwards.
        await svc.col.update_one(
            {"_id": ObjectId(sift_id)},
            {
                "$inc": {"total_documents": 1},
                "$set": {
                    "status": SiftStatus.INDEXING,
                    "error": None,
                    "updated_at": datetime.now(timezone.utc),
                },
            },
        )

        await enqueue(doc.id, sift_id, storage_path)
        uploaded_files.append(file.filename)

    return {"uploaded": len(uploaded_files), "files": uploaded_files, "folder_id": folder_id}


@router.post("/{sift_id}/reindex")
async def reindex_sift(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.document_service import DocumentService
    from ..services.document_processor import enqueue
    from ..models.document import DocumentSiftStatusEnum

    svc = SiftService(db)
    doc_svc = DocumentService(db)

    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    statuses = await db["document_sift_statuses"].find(
        {"sift_id": sift_id}
    ).to_list(length=None)

    folder_doc_paths: list[tuple[str, str]] = []
    for s in statuses:
        doc = await db["documents"].find_one({"_id": __import__("bson").ObjectId(s["document_id"])})
        if doc and doc.get("storage_path"):
            folder_doc_paths.append((s["document_id"], doc["storage_path"]))

    upload_dir = Path(config.upload_dir) / sift_id
    direct_paths = []
    if upload_dir.exists():
        direct_paths = [
            str(p) for p in upload_dir.iterdir()
            if p.is_file() and not p.name.startswith(".")
        ]

    if not folder_doc_paths and not direct_paths:
        raise HTTPException(status_code=400, detail="No documents found to reindex")

    await svc.results_service.delete_by_sift_id(sift_id)
    await db["processing_queue"].delete_many({"sift_id": sift_id})
    await svc.update(
        sift_id,
        {
            "status": SiftStatus.INDEXING,
            "schema": None,
            "processed_documents": 0,
            "total_documents": len(folder_doc_paths) + len(direct_paths),
            "error": None,
        },
    )

    for doc_id, storage_path in folder_doc_paths:
        await db["document_sift_statuses"].update_one(
            {"document_id": doc_id, "sift_id": sift_id},
            {"$set": {"status": DocumentSiftStatusEnum.PENDING, "error_message": None, "sift_record_id": None}},
        )
        await enqueue(doc_id, sift_id, storage_path)

    if direct_paths:
        asyncio.create_task(svc.process_documents(sift_id, direct_paths))

    total = len(folder_doc_paths) + len(direct_paths)
    return {"status": "reindexing", "total": total}


@router.post("/{sift_id}/cancel-indexing")
async def cancel_indexing(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    """Cancel pending queue items for this sift and mark the sift active."""
    from ..services.document_processor import COLLECTION as QUEUE_COLLECTION

    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    result = await db[QUEUE_COLLECTION].update_many(
        {"sift_id": sift_id, "status": "pending"},
        {"$set": {"status": "cancelled"}},
    )
    cancelled = result.modified_count

    # Adjust total so processed_documents/total stays consistent, then force active.
    if cancelled:
        await db["sifts"].update_one(
            {"_id": __import__("bson").ObjectId(sift_id)},
            {"$inc": {"total_documents": -cancelled}},
        )

    sift = await svc.update(sift_id, {"status": SiftStatus.ACTIVE})
    return {**_sift_to_dict(sift), "cancelled_count": cancelled}


@router.post("/{sift_id}/reset")
async def reset_sift(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    result = await svc.reset_error(sift_id)
    return _sift_to_dict(result)


# ---------------------------------------------------------------------------
# Documents list
# ---------------------------------------------------------------------------

@router.get("/{sift_id}/documents")
async def list_sift_documents(
    sift_id: str,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    total = await db["document_sift_statuses"].count_documents({"sift_id": sift_id})
    statuses = await (
        db["document_sift_statuses"]
        .find({"sift_id": sift_id})
        .sort("_id", -1)
        .skip(offset)
        .limit(limit)
        .to_list(length=limit)
    )

    items = []
    for s in statuses:
        doc_id = s.get("document_id")
        doc = await db["documents"].find_one({"_id": __import__("bson").ObjectId(doc_id)}) if doc_id else None
        items.append({
            "document_id": doc_id,
            "filename": doc["filename"] if doc else None,
            "folder_id": doc["folder_id"] if doc else None,
            "size_bytes": doc.get("size_bytes", 0) if doc else 0,
            "uploaded_at": doc["uploaded_at"].isoformat() if doc and doc.get("uploaded_at") else None,
            "status": s.get("status"),
            "started_at": s["started_at"].isoformat() if s.get("started_at") else None,
            "completed_at": s["completed_at"].isoformat() if s.get("completed_at") else None,
            "error_message": s.get("error_message"),
            "filter_reason": s.get("filter_reason"),
            "sift_record_id": s.get("sift_record_id") or s.get("extraction_record_id"),
        })

    return paginated(items, total, limit, offset)


# ---------------------------------------------------------------------------
# Records (structured query)
# ---------------------------------------------------------------------------

@router.get("/{sift_id}/records/count")
async def count_records(
    sift_id: str,
    filter: Optional[str] = None,
    q: Optional[str] = None,
    min_confidence: Optional[float] = None,
    has_uncertain_fields: Optional[bool] = None,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    if min_confidence is not None and not (0.0 <= min_confidence <= 1.0):
        raise HTTPException(status_code=422, detail="min_confidence must be between 0.0 and 1.0")

    mongo_filter = _build_records_filter(sift_id, filter, q, min_confidence, has_uncertain_fields)
    count = await db["sift_results"].count_documents(mongo_filter)
    return {"count": count}


@router.post("/{sift_id}/records/batch")
async def batch_records(
    sift_id: str,
    body: BatchRecordsRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        object_ids = [ObjectId(i) for i in body.ids]
    except Exception:
        raise HTTPException(status_code=400, detail="invalid record id in ids list")

    docs = await db["sift_results"].find(
        {"_id": {"$in": object_ids}, "sift_id": sift_id}
    ).to_list(length=len(body.ids))

    return {"items": [_result_to_dict(d) for d in docs]}


@router.get("/{sift_id}/records")
async def get_records(
    sift_id: str,
    limit: int = 50,
    offset: Optional[int] = None,
    cursor: Optional[str] = None,
    filter: Optional[str] = None,
    sort: Optional[str] = None,
    project: Optional[str] = None,
    q: Optional[str] = None,
    min_confidence: Optional[float] = None,
    has_uncertain_fields: Optional[bool] = None,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    if min_confidence is not None and not (0.0 <= min_confidence <= 1.0):
        raise HTTPException(status_code=422, detail="min_confidence must be between 0.0 and 1.0")

    mongo_filter = _build_records_filter(sift_id, filter, q, min_confidence, has_uncertain_fields)

    # Cursor-based pagination takes precedence over offset
    if cursor is not None:
        last_id = _decode_cursor(cursor)
        mongo_filter["_id"] = {"$gt": last_id}
    elif offset is not None:
        pass  # handled below via .skip()

    # Sort
    sort_spec: list[tuple[str, int]] = [("_id", 1)]
    if sort:
        try:
            sort_input = json.loads(sort)
            if isinstance(sort_input, list):
                sort_spec = [(k, v) for k, v in sort_input]
            elif isinstance(sort_input, dict):
                sort_spec = list(sort_input.items())
        except Exception:
            raise HTTPException(status_code=400, detail="sort must be a JSON array or object")

    # Projection
    proj: Optional[dict] = None
    if project:
        try:
            proj = json.loads(project)
        except Exception:
            raise HTTPException(status_code=400, detail="project must be a JSON object")

    col = db["sift_results"]
    total = await col.count_documents({"sift_id": sift_id})

    find_cursor = col.find(mongo_filter, proj).sort(sort_spec).limit(limit)
    if offset is not None and cursor is None:
        find_cursor = find_cursor.skip(offset)

    docs = await find_cursor.to_list(length=limit)
    items = [_result_to_dict(d) for d in docs]

    # Encode next cursor from the last returned _id
    next_cursor: Optional[str] = None
    if len(docs) == limit:
        next_cursor = _encode_cursor(docs[-1]["_id"])

    if cursor is not None or offset is None:
        return paginated(items, total, limit, 0, next_cursor)
    else:
        return paginated(items, total, limit, offset, next_cursor)


@router.get("/{sift_id}/records/csv")
async def export_csv(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    results_svc = SiftResultsService(db)
    csv_content = await results_svc.export_csv(sift_id)

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{sift.name}.csv"'},
    )


# ---------------------------------------------------------------------------
# Citations
# ---------------------------------------------------------------------------

@router.get("/{sift_id}/records/{record_id}/citations")
async def get_record_citations(
    sift_id: str,
    record_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        doc = await db["sift_results"].find_one({"_id": ObjectId(record_id), "sift_id": sift_id})
    except Exception:
        raise HTTPException(status_code=400, detail="invalid record id")

    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")

    return doc.get("citations") or {}


# ---------------------------------------------------------------------------
# Record corrections + Correction rules
# ---------------------------------------------------------------------------

class CorrectionItem(BaseModel):
    value: Any
    scope: str  # "local" | "rule" | "reset"

class CorrectionRequest(BaseModel):
    corrections: dict[str, CorrectionItem]


async def _resolve_corrected_by(db, principal: Principal) -> str:
    """Return the user's email if resolvable, else fall back to key_id."""
    user_id = getattr(principal, "user_id", None) or principal.key_id
    if not user_id or user_id in ("anonymous", "bootstrap"):
        return user_id or "anonymous"
    try:
        user_doc = await db["users"].find_one({"_id": ObjectId(user_id)}, {"email": 1})
        if user_doc and user_doc.get("email"):
            return user_doc["email"]
    except Exception:
        pass
    return user_id


@router.patch("/{sift_id}/records/{record_id}")
async def patch_record(
    sift_id: str,
    record_id: str,
    body: CorrectionRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        doc = await db["sift_results"].find_one({"_id": ObjectId(record_id), "sift_id": sift_id})
    except Exception:
        raise HTTPException(status_code=400, detail="invalid record id")

    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")

    user_overrides = dict(doc.get("user_overrides") or {})
    corrected_fields = dict(doc.get("corrected_fields") or {})
    now = datetime.now(timezone.utc).isoformat()
    corrected_by = await _resolve_corrected_by(db, principal)

    for field_name, item in body.corrections.items():
        if item.scope == "reset":
            user_overrides.pop(field_name, None)
            corrected_fields.pop(field_name, None)
        else:
            old_value = {**doc.get("extracted_data", {}), **user_overrides}.get(field_name)
            user_overrides[field_name] = item.value
            corrected_fields[field_name] = {
                "value": item.value,
                "scope": item.scope,
                "corrected_by": corrected_by,
                "corrected_at": now,
            }
            if item.scope == "rule":
                rule_doc = {
                    "sift_id": sift_id,
                    "field_name": field_name,
                    "match_value": str(old_value).strip().lower() if old_value is not None else "",
                    "replace_value": item.value,
                    "created_by": principal.user_id or "anonymous",
                    "created_at": datetime.now(timezone.utc),
                    "applied_count": 0,
                    "active": True,
                }
                await db["correction_rules"].insert_one(rule_doc)

    await db["sift_results"].update_one(
        {"_id": ObjectId(record_id)},
        {"$set": {"user_overrides": user_overrides, "corrected_fields": corrected_fields}},
    )

    updated = await db["sift_results"].find_one({"_id": ObjectId(record_id)})
    return _result_to_dict(updated)


@router.get("/{sift_id}/correction-rules")
async def list_correction_rules(
    sift_id: str,
    active_only: bool = True,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    query: dict = {"sift_id": sift_id}
    if active_only:
        query["active"] = True
    docs = await db["correction_rules"].find(query).sort("created_at", 1).to_list(length=500)
    rules = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if "created_at" in d and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        rules.append(d)
    return {"rules": rules}


@router.delete("/{sift_id}/correction-rules/{rule_id}")
async def delete_correction_rule(
    sift_id: str,
    rule_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        result = await db["correction_rules"].update_one(
            {"_id": ObjectId(rule_id), "sift_id": sift_id},
            {"$set": {"active": False}},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="invalid rule id")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


@router.post("/{sift_id}/correction-rules/{rule_id}/backfill")
async def backfill_correction_rule(
    sift_id: str,
    rule_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        rule_doc = await db["correction_rules"].find_one({"_id": ObjectId(rule_id), "sift_id": sift_id})
    except Exception:
        raise HTTPException(status_code=400, detail="invalid rule id")

    if not rule_doc:
        raise HTTPException(status_code=404, detail="Rule not found")

    field_name = rule_doc["field_name"]
    match_value = rule_doc["match_value"]
    replace_value = rule_doc["replace_value"]
    now = datetime.now(timezone.utc).isoformat()
    corrected_by = await _resolve_corrected_by(db, principal)

    # Find matching records (check both extracted_data and user_overrides)
    cursor = db["sift_results"].find({"sift_id": sift_id})
    applied = 0
    async for doc in cursor:
        current = {**doc.get("extracted_data", {}), **doc.get("user_overrides", {})}
        raw = current.get(field_name)
        if raw is not None and str(raw).strip().lower() == match_value:
            overrides = dict(doc.get("user_overrides") or {})
            corrected = dict(doc.get("corrected_fields") or {})
            overrides[field_name] = replace_value
            corrected[field_name] = {
                "value": replace_value,
                "scope": "rule",
                "corrected_by": corrected_by,
                "corrected_at": now,
            }
            await db["sift_results"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"user_overrides": overrides, "corrected_fields": corrected}},
            )
            applied += 1

    await db["correction_rules"].update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": {"applied_count": rule_doc.get("applied_count", 0) + applied}},
    )
    return {"applied_count": applied}


# ---------------------------------------------------------------------------
# Query (NL) + Ad-hoc Aggregate
# ---------------------------------------------------------------------------

@router.post("/{sift_id}/query")
async def query_sift(
    sift_id: str,
    body: QueryRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    from ..services.aggregation_service import AggregationService

    agg_svc = AggregationService(db)
    try:
        if body.execute:
            results, pipeline = await agg_svc.live_query(sift_id, body.query)
        else:
            from ..services import pipeline_agent
            import json as _json
            samples = await agg_svc.results_service.get_sample_records(sift_id, limit=10)
            pipeline_json = await pipeline_agent.generate_pipeline(body.query, samples)
            pipeline = _json.loads(pipeline_json)
            results = None
    except Exception as e:
        logger.error("live_query_error", sift_id=sift_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "pipeline": pipeline,
        "results": results,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/{sift_id}/aggregate")
async def aggregate_sift(
    sift_id: str,
    body: AggregateRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    validate_pipeline(body.pipeline)
    limit = cap_limit(body.limit)

    results_svc = SiftResultsService(db)
    pipeline = list(body.pipeline)
    # Inject limit stage at the end
    pipeline.append({"$limit": limit})
    try:
        results = await results_svc.execute_aggregation(sift_id, pipeline)
    except Exception as e:
        logger.error("aggregate_error", sift_id=sift_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return {"results": results, "ran_at": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@router.post("/{sift_id}/chat")
async def sift_chat(
    sift_id: str,
    body: ChatRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.qa_agent import chat as qa_chat

    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        result = await qa_chat(
            extraction_id=sift_id,
            message=body.message,
            history=body.history,
            db=db,
        )
    except Exception as e:
        logger.error("sift_chat_error", sift_id=sift_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "response": result.response,
        "data": result.data,
        "pipeline": result.pipeline,
    }


# ---------------------------------------------------------------------------
# Extraction control
# ---------------------------------------------------------------------------

@router.post("/{sift_id}/extract")
async def extract_document(
    sift_id: str,
    body: ExtractRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.document_processor import enqueue
    from ..models.document import DocumentSiftStatusEnum

    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    try:
        doc = await db["documents"].find_one({"_id": ObjectId(body.document_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="invalid document_id")

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    status_doc = await db["document_sift_statuses"].find_one(
        {"document_id": body.document_id, "sift_id": sift_id}
    )
    if not status_doc:
        raise HTTPException(status_code=404, detail="Document is not associated with this sift")

    current_status = status_doc.get("status")
    if current_status == DocumentSiftStatusEnum.PROCESSING:
        raise HTTPException(status_code=409, detail="extraction already in progress")

    storage_path = doc.get("storage_path", "")
    task_id = f"{body.document_id}:{sift_id}"

    await db["document_sift_statuses"].update_one(
        {"document_id": body.document_id, "sift_id": sift_id},
        {"$set": {"status": DocumentSiftStatusEnum.PENDING, "error_message": None}},
    )
    await enqueue(body.document_id, sift_id, storage_path)

    return {"task_id": task_id, "status": "queued"}


@router.get("/{sift_id}/extraction-status")
async def extraction_status(
    sift_id: str,
    document_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    if not await svc.get(sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")

    status_doc = await db["document_sift_statuses"].find_one(
        {"document_id": document_id, "sift_id": sift_id}
    )
    if not status_doc:
        raise HTTPException(status_code=404, detail="Document not found for this sift")

    raw_status = status_doc.get("status", "pending")
    # Normalise to the enum values expected by the API spec
    status_map = {
        "pending": "queued",
        "processing": "running",
        "done": "completed",
        "error": "failed",
        "discarded": "completed",
    }
    api_status = status_map.get(raw_status, raw_status)

    result: dict[str, Any] = {"status": api_status}
    if raw_status == "error":
        result["error"] = status_doc.get("error_message")
    return result


# ---------------------------------------------------------------------------
# Schema endpoints (Step 2 — filled in schema_service)
# ---------------------------------------------------------------------------

@router.get("/{sift_id}/schema")
async def get_schema(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return {
        "schema_text": sift.schema,
        "schema_fields": sift.schema_fields,
        "schema_version": sift.schema_version,
    }


@router.get("/{sift_id}/schema.pydantic")
async def get_schema_pydantic(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.schema_service import emit_pydantic

    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return Response(content=emit_pydantic(sift), media_type="text/plain")


@router.get("/{sift_id}/schema.ts")
async def get_schema_ts(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.schema_service import emit_typescript

    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return Response(content=emit_typescript(sift), media_type="text/plain")


@router.get("/{sift_id}/schema.json")
async def get_schema_json(
    sift_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    from ..services.schema_service import emit_json_schema

    svc = SiftService(db)
    sift = await svc.get(sift_id, org_id=principal.org_id)
    if not sift:
        raise HTTPException(status_code=404, detail="Sift not found")
    return emit_json_schema(sift)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_records_filter(
    sift_id: str,
    filter_str: Optional[str],
    q: Optional[str],
    min_confidence: Optional[float] = None,
    has_uncertain_fields: Optional[bool] = None,
) -> dict:
    mongo_filter: dict = {"sift_id": sift_id}
    if filter_str:
        try:
            user_filter = json.loads(filter_str)
        except Exception:
            raise HTTPException(status_code=400, detail="filter must be valid JSON")
        mongo_filter.update(_translate_filter(user_filter))
    if q:
        mongo_filter["$text"] = {"$search": q}
    if min_confidence is not None:
        mongo_filter["confidence"] = {"$gte": min_confidence}
    if has_uncertain_fields:
        # Match records where any citation entry has confidence < 0.6 OR inferred: true.
        # Citations are a nested map; $objectToArray lets us iterate over map values.
        # Full-scan over citations is acceptable at typical dataset sizes (no index on citations values).
        mongo_filter["$expr"] = {
            "$anyElementTrue": {
                "$map": {
                    "input": {"$objectToArray": {"$ifNull": ["$citations", {}]}},
                    "as": "c",
                    "in": {
                        "$or": [
                            {"$lt": [{"$ifNull": ["$$c.v.confidence", 1.0]}, 0.6]},
                            {"$eq": [{"$ifNull": ["$$c.v.inferred", False]}, True]},
                        ]
                    },
                }
            }
        }
    return mongo_filter


def _result_to_dict(doc: dict) -> dict:
    d = {}
    for k, v in doc.items():
        if k == "_id":
            d["id"] = str(v)
        elif isinstance(v, ObjectId):
            d[k] = str(v)
        else:
            d[k] = v
    if "created_at" in d and hasattr(d["created_at"], "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    citations = d.get("citations") or {}
    d["has_uncertain_fields"] = any(
        isinstance(c, dict) and c.get("confidence", 1.0) < 0.6
        for c in citations.values()
    )
    # Merge user_overrides into extracted_data (overrides always win)
    user_overrides = d.get("user_overrides") or {}
    if user_overrides:
        d["extracted_data"] = {**d.get("extracted_data", {}), **user_overrides}
    return d


def _sift_to_dict(s: Sift) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "instructions": s.instructions,
        "schema": s.schema,
        "schema_version": s.schema_version,
        "schema_fields": s.schema_fields,
        "status": s.status,
        "error": s.error,
        "processed_documents": s.processed_documents,
        "total_documents": s.total_documents,
        "default_folder_id": s.default_folder_id,
        "multi_record": s.multi_record,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }
