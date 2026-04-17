import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.sift import Sift, SiftStatus
from ..models.sift_result import SiftResult
from . import sift_agent
from .sift_results import SiftResultsService
from .file_processor import FileProcessor

logger = structlog.get_logger()

COLLECTION = "sifts"


class DocumentDiscardedError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class SiftService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[COLLECTION]
        self.results_service = SiftResultsService(db)
        self.file_processor = FileProcessor()

    async def ensure_indexes(self):
        await self.col.create_index("created_at", name="created_at_idx")
        await self.results_service.ensure_indexes()

    async def create(
        self,
        name: str,
        description: str,
        instructions: str,
        schema: Optional[str] = None,
        multi_record: bool = False,
    ) -> Sift:
        sift = Sift(
            name=name,
            description=description,
            instructions=instructions,
            schema=schema,
            status=SiftStatus.ACTIVE,
            multi_record=multi_record,
        )
        doc = sift.to_mongo()
        result = await self.col.insert_one(doc)
        sift.id = str(result.inserted_id)
        logger.info("sift_created", sift_id=sift.id, name=name)
        return sift

    async def get(self, sift_id: str) -> Optional[Sift]:
        query: dict = {"_id": ObjectId(sift_id)}
        doc = await self.col.find_one(query)
        return Sift.from_mongo(doc) if doc else None

    async def list_all(
        self,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Sift], int]:
        total = await self.col.count_documents({})
        cursor = self.col.find({}).sort("created_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [Sift.from_mongo(d) for d in docs], total

    async def delete(self, sift_id: str) -> bool:
        await self.results_service.delete_by_sift_id(sift_id)
        result = await self.col.delete_one({"_id": ObjectId(sift_id)})
        return result.deleted_count > 0

    async def update(self, sift_id: str, updates: dict) -> Optional[Sift]:
        updates["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one(
            {"_id": ObjectId(sift_id)},
            {"$set": updates},
        )
        return await self.get(sift_id)

    async def reset_error(self, sift_id: str) -> Optional[Sift]:
        return await self.update(
            sift_id,
            {"status": SiftStatus.ACTIVE, "error": None},
        )

    async def process_documents(
        self,
        sift_id: str,
        file_paths: list[str],
    ) -> None:
        """
        Process a list of documents for a sift.
        Updates status, progress counters, and infers schema after first doc.
        """
        sift = await self.get(sift_id)
        if not sift:
            logger.error("sift_not_found", sift_id=sift_id)
            return

        total = len(file_paths)
        await self.update(
            sift_id,
            {
                "status": SiftStatus.INDEXING,
                "total_documents": total,
                "processed_documents": 0,
                "error": None,
            },
        )

        schema = sift.schema
        errors = []
        discarded = 0

        from ..storage import local_path as storage_local_path

        for idx, file_path in enumerate(file_paths):
            try:
                async with storage_local_path(file_path) as local_file:
                    result = await sift_agent.extract(
                        file_path=local_file,
                        instructions=sift.instructions,
                        schema=schema,
                        multi_record=sift.multi_record,
                    )

                if not result.matches_filter:
                    discarded += 1
                    logger.info(
                        "document_discarded",
                        sift_id=sift_id,
                        document=Path(file_path).name,
                        reason=result.filter_reason,
                    )
                    await self.update(sift_id, {"processed_documents": idx + 1 - len(errors)})
                    continue

                filename = Path(file_path).name
                doc_id = str(uuid4())
                for rec_idx, record_data in enumerate(result.extracted_data):
                    await self.results_service.insert_result(
                        sift_id=sift_id,
                        document_id=doc_id,
                        filename=filename,
                        document_type=result.document_type,
                        confidence=result.confidence,
                        extracted_data=record_data,
                        record_index=rec_idx,
                    )

                # Update schema from first successful result (process_documents path)
                if result.extracted_data:
                    current_sift = await self.get(sift_id)
                    if current_sift:
                        await self._update_schema_if_changed(current_sift, result.extracted_data[0])
                        schema = (await self.get(sift_id)).schema  # refresh

                await self.update(sift_id, {"processed_documents": idx + 1 - len(errors)})
                logger.info(
                    "document_processed",
                    sift_id=sift_id,
                    document=Path(file_path).name,
                    confidence=result.confidence,
                )
            except Exception as e:
                logger.error(
                    "document_processing_error",
                    sift_id=sift_id,
                    file=str(file_path),
                    error=str(e),
                )
                errors.append(f"{Path(file_path).name}: {e}")

        final_status = SiftStatus.ACTIVE
        error_msg = None
        non_discarded = total - discarded
        if errors and len(errors) == non_discarded:
            final_status = SiftStatus.ERROR
            error_msg = "; ".join(errors[:3])
        elif errors:
            error_msg = f"{len(errors)} document(s) failed: " + "; ".join(errors[:3])

        await self.update(
            sift_id,
            {
                "status": final_status,
                "error": error_msg,
                "processed_documents": total - len(errors) - discarded,
            },
        )
        logger.info(
            "sift_processing_complete",
            sift_id=sift_id,
            total=total,
            errors=len(errors),
            discarded=discarded,
        )

    async def process_single_document(
        self, sift_id: str, file_path: str, document_id: str | None = None
    ) -> list[SiftResult]:
        sift = await self.get(sift_id)
        if not sift:
            raise ValueError(f"Sift {sift_id} not found")

        from ..storage import local_path as storage_local_path
        async with storage_local_path(file_path) as local_file:
            result = await sift_agent.extract(
                file_path=local_file,
                instructions=sift.instructions,
                schema=sift.schema,
                multi_record=sift.multi_record,
            )

        if not result.matches_filter:
            # Increment counter so the sift can still transition to ACTIVE
            # when all documents (including discarded ones) have been processed
            discard_updated = await self.col.find_one_and_update(
                {"_id": ObjectId(sift_id)},
                {"$inc": {"processed_documents": 1}},
                return_document=True,
            )
            if discard_updated and discard_updated.get("processed_documents", 0) >= discard_updated.get("total_documents", 1):
                await self.update(sift_id, {"status": SiftStatus.ACTIVE})
            raise DocumentDiscardedError(reason=result.filter_reason or "")

        filename = Path(file_path).name
        doc_id = document_id or str(uuid4())
        stored: list[SiftResult] = []

        from .citation_resolver import resolve_citations

        for idx, record_data in enumerate(result.extracted_data):
            citations = None
            if result.page_blocks:
                try:
                    citations = resolve_citations(doc_id, record_data, result.page_blocks)
                except Exception as e:
                    logger.warning("citation_resolution_failed", error=str(e))

            s = await self.results_service.insert_result(
                sift_id=sift_id,
                document_id=doc_id,
                filename=filename,
                document_type=result.document_type,
                confidence=result.confidence,
                extracted_data=record_data,
                citations=citations,
                record_index=idx,
            )
            stored.append(s)

        if result.extracted_data:
            await self._update_schema_if_changed(sift, result.extracted_data[0])
            sift = await self.get(sift_id)  # refresh after schema update

        # Increment processed_documents atomically without overwriting total_documents
        updated = await self.col.find_one_and_update(
            {"_id": ObjectId(sift_id)},
            {"$inc": {"processed_documents": 1}},
            return_document=True,
        )
        # Transition to ACTIVE only when all enqueued documents are done
        if updated and updated.get("processed_documents", 0) >= updated.get("total_documents", 1):
            await self.update(sift_id, {"status": SiftStatus.ACTIVE})

        return stored

    async def mark_document_failed(self, sift_id: str, error_message: str) -> None:
        """Increment processed_documents after a permanent failure and transition the sift
        out of INDEXING once all documents are accounted for."""
        updated = await self.col.find_one_and_update(
            {"_id": ObjectId(sift_id)},
            {"$inc": {"processed_documents": 1}},
            return_document=True,
        )
        if not updated:
            return
        if updated.get("processed_documents", 0) >= updated.get("total_documents", 1):
            result_count = await self.results_service.col.count_documents({"sift_id": sift_id})
            new_status = SiftStatus.ACTIVE if result_count > 0 else SiftStatus.ERROR
            await self.update(sift_id, {"status": new_status, "error": error_message})

    async def _update_schema_if_changed(self, sift: Sift, extracted_data: dict) -> None:
        from .schema_service import infer_schema_fields
        from .webhook_service import WebhookService

        new_fields = infer_schema_fields(extracted_data)
        new_schema_text = _infer_schema(extracted_data)
        new_field_names = {f["name"]: f["type"] for f in new_fields}
        old_field_names = {f["name"]: f["type"] for f in (sift.schema_fields or [])}

        if new_field_names == old_field_names and sift.schema is not None:
            return  # no change

        old_version = sift.schema_version
        new_version = old_version + 1 if sift.schema is not None else 1

        await self.update(
            sift.id,
            {
                "schema": new_schema_text,
                "schema_fields": new_fields,
                "schema_version": new_version,
            },
        )

        # Emit webhook only on actual schema changes (not first-time set)
        if sift.schema is not None and new_field_names != old_field_names:
            old_keys = set(old_field_names)
            new_keys = set(new_field_names)
            added = [f for f in new_fields if f["name"] in (new_keys - old_keys)]
            removed = [{"name": n} for n in (old_keys - new_keys)]
            changed = [
                f for f in new_fields
                if f["name"] in (old_keys & new_keys) and old_field_names[f["name"]] != f["type"]
            ]
            payload = {
                "sift_id": sift.id,
                "old_version": old_version,
                "new_version": new_version,
                "added_fields": added,
                "removed_fields": removed,
                "changed_fields": changed,
            }
            try:
                wh_svc = WebhookService(self.db)
                await wh_svc.dispatch("sift.schema.changed", payload)
            except Exception as e:
                logger.error("schema_changed_webhook_failed", sift_id=sift.id, error=str(e))

    async def reindex(self, sift_id: str, file_paths: list[str]) -> None:
        """Delete all results and reprocess all documents."""
        await self.results_service.delete_by_sift_id(sift_id)
        await self.update(
            sift_id,
            {"schema": None, "processed_documents": 0, "total_documents": 0},
        )
        await self.process_documents(sift_id, file_paths)

    async def get_records(
        self,
        sift_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        results, total = await self.results_service.get_results(sift_id, skip=skip, limit=limit)
        return [
            {
                "id": r.id,
                "document_id": r.document_id,
                "filename": r.filename,
                "document_type": r.document_type,
                "confidence": r.confidence,
                "extracted_data": r.extracted_data,
                "record_index": r.record_index,
                "created_at": r.created_at.isoformat(),
            }
            for r in results
        ], total


def _infer_schema(extracted_data: dict[str, Any]) -> str:
    """
    Generate a schema string from extracted data.
    Example: "client (string), date (string), amount (number), vat_number (string)"
    """
    parts = []
    for field, value in extracted_data.items():
        if value is None:
            type_str = "string"
        elif isinstance(value, bool):
            type_str = "boolean"
        elif isinstance(value, int | float):
            type_str = "number"
        elif isinstance(value, list):
            type_str = "array"
        elif isinstance(value, dict):
            type_str = "object"
        else:
            type_str = "string"
        parts.append(f"{field} ({type_str})")
    return ", ".join(parts)
