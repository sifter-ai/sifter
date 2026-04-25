"""
Background document processing queue backed by MongoDB.
Workers poll the processing_queue collection and atomically claim tasks.
Single-tenant — no org_id.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.document import DocumentSiftStatusEnum
from ..models.processing_task import ProcessingTask

logger = structlog.get_logger()

# Module-level db reference set at startup
_db: Optional[AsyncIOMotorDatabase] = None

COLLECTION = "processing_queue"


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create indexes on the processing_queue collection."""
    await db[COLLECTION].create_index(
        [("status", 1), ("created_at", 1)],
        name="status_created_at_idx",
    )
    await db[COLLECTION].create_index("document_id", name="document_id_idx")


async def enqueue(
    document_id: str,
    sift_id: str,
    storage_path: str,
) -> None:
    """Insert a ProcessingTask into MongoDB processing_queue."""
    global _db
    if _db is None:
        from ..db import get_db
        _db = get_db()
    task = ProcessingTask(
        document_id=document_id,
        sift_id=sift_id,
        storage_path=storage_path,
    )
    await _db[COLLECTION].insert_one(task.to_mongo())
    logger.info("task_enqueued", document_id=document_id, sift_id=sift_id)


async def _claim_task(db: AsyncIOMotorDatabase) -> Optional[dict]:
    """Atomically claim the next available task from the queue."""
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    task_doc = await db[COLLECTION].find_one_and_update(
        {
            "$or": [
                {"status": "pending"},
                {"status": "error", "attempts": {"$lt": 3}},
                {"status": "processing", "claimed_at": {"$lt": stale_cutoff}, "attempts": {"$lt": 10}},
            ]
        },
        {
            "$set": {"status": "processing", "claimed_at": datetime.now(timezone.utc)},
            "$inc": {"attempts": 1},
        },
        sort=[("created_at", 1)],
        return_document=True,
    )
    return task_doc


async def worker(db: AsyncIOMotorDatabase) -> None:
    """Continuous worker coroutine. Polls MongoDB for tasks. Runs until cancelled."""
    from .document_service import DocumentService
    from .sift_service import SiftService

    # On startup, reset any stale "processing" tasks back to "pending" so they
    # are retried — they were left in-flight by a previous server instance.
    reset = await db[COLLECTION].update_many(
        {"status": "processing"},
        {"$set": {"status": "pending", "claimed_at": None}},
    )
    if reset.modified_count:
        logger.warning("stale_tasks_reset", count=reset.modified_count)

    pending = await db[COLLECTION].count_documents({"status": "pending"})
    logger.info("document_processor_worker_started", pending=pending)

    while True:
        try:
            task_doc = await _claim_task(db)
        except Exception as e:
            logger.error("claim_task_error", error=str(e))
            await asyncio.sleep(5)
            continue

        if task_doc is None:
            await asyncio.sleep(2)
            continue

        document_id = task_doc["document_id"]
        sift_id = task_doc["sift_id"]
        storage_path = task_doc["storage_path"]
        attempts = task_doc.get("attempts", 1)
        max_attempts = task_doc.get("max_attempts", 3)

        if attempts > 1:
            logger.warning(
                "task_reclaimed",
                document_id=document_id,
                sift_id=sift_id,
                attempt=attempts,
            )

        # Schema gate: if this sift has no schema yet, don't start in parallel.
        # Put the task back as pending and let whoever is already processing
        # this sift finish first (they will write the schema). Once the schema
        # exists every subsequent document can run in parallel.
        # Only apply on the first attempt — retries skip the gate to avoid
        # infinite loops when all documents cycle simultaneously.
        from bson import ObjectId as _ObjId
        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        sift_doc = await db["sifts"].find_one({"_id": _ObjId(sift_id)}, {"schema": 1, "org_id": 1})
        if attempts == 1 and sift_doc and not sift_doc.get("schema"):
            other_running = await db[COLLECTION].count_documents({
                "sift_id": sift_id,
                "status": "processing",
                "_id": {"$ne": task_doc["_id"]},
                "claimed_at": {"$gt": stale_cutoff},
            })
            if other_running > 0:
                logger.info(
                    "schema_gate_deferred",
                    document_id=document_id,
                    sift_id=sift_id,
                    other_running=other_running,
                )
                await db[COLLECTION].update_one(
                    {"_id": task_doc["_id"]},
                    {"$set": {"status": "pending", "claimed_at": None}},
                )
                await asyncio.sleep(2)
                continue

        doc_svc = DocumentService(db)
        ext_svc = SiftService(db)
        sift_org_id = sift_doc.get("org_id", "default") if sift_doc else "default"

        logger.info("processing_document", document_id=document_id, sift_id=sift_id, attempt=attempts)

        discard = await _process_task(
            db=db, task_doc=task_doc,
            document_id=document_id, sift_id=sift_id, storage_path=storage_path,
            sift_org_id=sift_org_id, attempts=attempts, max_attempts=max_attempts,
            doc_svc=doc_svc, ext_svc=ext_svc,
        )
        if discard:
            continue


async def _process_task(
    db, task_doc: dict,
    document_id: str, sift_id: str, storage_path: str,
    sift_org_id: str, attempts: int, max_attempts: int,
    doc_svc, ext_svc,
) -> bool:
    """Execute one extraction task. Returns True if the document was discarded (caller must `continue`)."""
    try:
        await doc_svc.update_sift_status(document_id, sift_id, DocumentSiftStatusEnum.PROCESSING)

        from ..storage import get_storage_backend, GCSBackend
        from ..config import config as oss_config
        from pathlib import Path
        backend = get_storage_backend()
        filename = Path(storage_path).name
        _use_gcs_uri = (
            isinstance(backend, GCSBackend)
            and oss_config.extractor_model.startswith("vertex_ai/")
        )
        logger.info("loading_document", document_id=document_id, storage_path=storage_path)
        if _use_gcs_uri:
            source = f"gs://{backend.bucket_name}/{storage_path}"
        else:
            source = await backend.load(storage_path)

        from .limits import get_usage_limiter
        await get_usage_limiter().check_extraction(org_id=sift_org_id)

        results = await ext_svc.process_single_document(
            sift_id, source, filename, document_id=document_id
        )

        first_record_id = results[0].id if results else None
        await doc_svc.update_sift_status(
            document_id, sift_id, DocumentSiftStatusEnum.DONE, sift_record_id=first_record_id
        )
        await db[COLLECTION].update_one(
            {"_id": task_doc["_id"]},
            {"$set": {"status": "done", "completed_at": datetime.now(timezone.utc)}},
        )

        logger.info("document_processed", document_id=document_id, sift_id=sift_id)

        from .limits import get_usage_limiter
        await get_usage_limiter().record_processed(org_id=sift_org_id, doc_count=1)

        records_payload = [
            {
                "id": r.id,
                "document_type": r.document_type,
                "confidence": r.confidence,
                "fields": r.extracted_data,
            }
            for r in results
        ]
        await _dispatch_webhook(
            db=db,
            event="sift.document.processed",
            payload={
                "status": "processed",
                "document_id": document_id,
                "sift_id": sift_id,
                "record_count": len(results),
                "records": records_payload,
            },
            sift_id=sift_id,
            org_id=sift_org_id,
        )
        return False

    except Exception as e:
        from .sift_service import DocumentDiscardedError
        if isinstance(e, DocumentDiscardedError):
            await doc_svc.update_sift_status(
                document_id, sift_id, DocumentSiftStatusEnum.DISCARDED, filter_reason=e.reason
            )
            await db[COLLECTION].update_one(
                {"_id": task_doc["_id"]},
                {"$set": {"status": "done", "completed_at": datetime.now(timezone.utc)}},
            )
            logger.info("document_discarded", document_id=document_id, sift_id=sift_id, reason=e.reason)
            await _dispatch_webhook(
                db=db,
                event="sift.document.discarded",
                payload={
                    "status": "discarded",
                    "document_id": document_id,
                    "sift_id": sift_id,
                    "reason": e.reason,
                },
                sift_id=sift_id,
                org_id=sift_org_id,
            )
            return True  # caller must `continue`

        error_msg = str(e)
        logger.error("document_processing_failed", document_id=document_id, sift_id=sift_id, error=error_msg, attempt=attempts)

        sift_not_found = f"Sift {sift_id} not found" in error_msg
        if not sift_not_found and attempts < max_attempts:
            await db[COLLECTION].update_one(
                {"_id": task_doc["_id"]},
                {"$set": {"status": "pending", "claimed_at": None, "error_message": error_msg}},
            )
        else:
            await db[COLLECTION].update_one(
                {"_id": task_doc["_id"]},
                {"$set": {"status": "error", "error_message": error_msg}},
            )
            if not sift_not_found:
                try:
                    await ext_svc.mark_document_failed(sift_id, error_msg)
                except Exception as mark_err:
                    logger.error("mark_document_failed_error", error=str(mark_err))

        try:
            await doc_svc.update_sift_status(document_id, sift_id, DocumentSiftStatusEnum.ERROR, error_message=error_msg)
            await _dispatch_webhook(
                db=db,
                event="sift.error",
                payload={
                    "status": "error",
                    "document_id": document_id,
                    "sift_id": sift_id,
                    "error": error_msg,
                },
                sift_id=sift_id,
                org_id=sift_org_id,
            )
        except Exception as update_err:
            logger.error("status_update_failed", error=str(update_err))
        return False


async def _dispatch_webhook(db, event: str, payload: dict, sift_id: Optional[str] = None, org_id: str = "default") -> None:
    """Fire-and-forget webhook dispatch."""
    try:
        from .webhook_service import WebhookService
        svc = WebhookService(db)
        await svc.dispatch(event=event, payload=payload, sift_id=sift_id, org_id=org_id)
    except Exception as e:
        logger.warning("webhook_dispatch_error", error=str(e))


def start_workers(n: int, db: AsyncIOMotorDatabase) -> list[asyncio.Task]:
    """Start n worker tasks. Call from lifespan startup."""
    global _db
    _db = db
    tasks = []
    for i in range(n):
        t = asyncio.create_task(worker(db), name=f"doc-processor-{i}")
        tasks.append(t)
    logger.info("document_processor_workers_started", count=n)
    return tasks
