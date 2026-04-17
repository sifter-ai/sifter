import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.sift_result import SiftResult

logger = structlog.get_logger()

COLLECTION = "sift_results"


class SiftResultsService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[COLLECTION]

    async def ensure_indexes(self):
        # Drop stale indexes from before extraction_id → sift_id rename
        for stale in ("extraction_document_unique", "sift_document_unique"):
            try:
                await self.col.drop_index(stale)
            except Exception:
                pass  # index doesn't exist — fine

        # Also drop old sift_filename_unique before recreating — needed for
        # migration to the new (sift_id, filename, record_index) index.
        for stale_name in ("sift_filename_unique",):
            try:
                await self.col.drop_index(stale_name)
            except Exception:
                pass

        # Remove rows that predate the document_id/filename split (filename: null).
        # These are invalid stale records that cannot satisfy the new unique constraint.
        result = await self.col.delete_many({"filename": None})
        if result.deleted_count:
            logger.warning(
                "sift_results_stale_rows_removed",
                count=result.deleted_count,
                reason="filename_null_pre_migration",
            )

        # Idempotency: one result per (sift, filename, record_index).
        # record_index=0 for single-record sifts; multi-record sifts use 0,1,2,...
        await self.col.create_index(
            [("sift_id", 1), ("filename", 1), ("record_index", 1)],
            unique=True,
            name="sift_filename_record_unique",
        )
        await self.col.create_index("sift_id", name="sift_id_idx")

    async def insert_result(
        self,
        sift_id: str,
        document_id: str,
        filename: str,
        document_type: str,
        confidence: float,
        extracted_data: dict[str, Any],
        record_index: int = 0,
        citations: Optional[dict[str, Any]] = None,
    ) -> SiftResult:
        result = SiftResult(
            sift_id=sift_id,
            document_id=document_id,
            filename=filename,
            document_type=document_type,
            confidence=confidence,
            extracted_data=extracted_data,
            citations=citations,
            record_index=record_index,
            created_at=datetime.now(timezone.utc),
        )
        doc = result.to_mongo()
        # Upsert by (sift_id, filename, record_index) for idempotency
        await self.col.replace_one(
            {"sift_id": sift_id, "filename": filename, "record_index": record_index},
            doc,
            upsert=True,
        )
        logger.info("result_inserted", sift_id=sift_id, document_id=document_id, filename=filename, record_index=record_index)
        return result

    async def get_results(
        self,
        sift_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[SiftResult], int]:
        query: dict = {"sift_id": sift_id}
        total = await self.col.count_documents(query)
        cursor = self.col.find(query).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [SiftResult.from_mongo(d) for d in docs], total

    async def get_result(self, result_id: str) -> SiftResult | None:
        doc = await self.col.find_one({"_id": ObjectId(result_id)})
        return SiftResult.from_mongo(doc) if doc else None

    async def delete_by_sift_id(self, sift_id: str) -> int:
        result = await self.col.delete_many({"sift_id": sift_id})
        logger.info("results_deleted", sift_id=sift_id, count=result.deleted_count)
        return result.deleted_count

    async def count(self, sift_id: str) -> int:
        return await self.col.count_documents({"sift_id": sift_id})

    async def execute_aggregation(
        self, sift_id: str, pipeline_input: Any
    ) -> list[dict[str, Any]]:
        """
        Execute a MongoDB aggregation pipeline against sift results.
        Automatically injects sift_id match as the first stage.
        """
        if isinstance(pipeline_input, str):
            pipeline: list[dict] = json.loads(pipeline_input)
        else:
            pipeline = list(pipeline_input)

        match_filter: dict = {"sift_id": sift_id}

        # Inject filter as first stage if not already present
        has_sift_match = False
        if pipeline and isinstance(pipeline[0], dict):
            match = pipeline[0].get("$match", {})
            if "sift_id" in match:
                has_sift_match = True

        if not has_sift_match:
            pipeline.insert(0, {"$match": match_filter})

        logger.info("aggregation_execute", sift_id=sift_id, stages=len(pipeline))

        cursor = self.col.aggregate(pipeline)
        results = await cursor.to_list(length=None)
        return [_serialize_doc(r) for r in results]

    async def export_csv(self, sift_id: str) -> str:
        results, _ = await self.get_results(sift_id, skip=0, limit=100_000)
        if not results:
            return ""

        all_fields: list[str] = []
        seen = set()
        for result in results:
            for key in result.extracted_data:
                if key not in seen:
                    all_fields.append(key)
                    seen.add(key)

        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["document_id", "filename", "document_type", "confidence"] + all_fields,
            extrasaction="ignore",
        )
        writer.writeheader()

        for result in results:
            row = {
                "document_id": result.document_id,
                "filename": result.filename,
                "document_type": result.document_type,
                "confidence": result.confidence,
                **result.extracted_data,
            }
            writer.writerow(row)

        return output.getvalue()

    async def get_sample_records(
        self, sift_id: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        query: dict = {"sift_id": sift_id}
        cursor = self.col.find(query).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [_serialize_doc(d) for d in docs]


def _serialize_doc(doc: dict) -> dict:
    """Recursively convert non-JSON-serializable types."""
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, dict):
            result[k] = _serialize_doc(v)
        elif isinstance(v, list):
            result[k] = [_serialize_doc(i) if isinstance(i, dict) else i for i in v]
        else:
            result[k] = v
    return result
