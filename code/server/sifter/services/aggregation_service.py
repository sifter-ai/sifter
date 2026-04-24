import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.aggregation import Aggregation, AggregationStatus
from . import pipeline_agent
from .sift_results import SiftResultsService

logger = structlog.get_logger()

COLLECTION = "aggregations"


class AggregationService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[COLLECTION]
        self.results_service = SiftResultsService(db)

    async def ensure_indexes(self):
        await self.col.create_index("sift_id", name="sift_id_idx")
        await self.col.create_index("created_at", name="created_at_idx")

    async def create(
        self,
        name: str,
        description: str,
        sift_id: str,
        query: str,
    ) -> Aggregation:
        aggregation = Aggregation(
            name=name,
            description=description,
            sift_id=sift_id,
            aggregation_query=query,
            status=AggregationStatus.GENERATING,
        )
        doc = aggregation.to_mongo()
        result = await self.col.insert_one(doc)
        aggregation.id = str(result.inserted_id)

        asyncio.create_task(
            self._generate_and_store_pipeline(aggregation.id, sift_id, query)
        )

        return aggregation

    async def _generate_and_store_pipeline(
        self, agg_id: str, sift_id: str, query: str
    ) -> None:
        try:
            samples = await self.results_service.get_sample_records(sift_id, limit=10)
            pipeline_json = await pipeline_agent.generate_pipeline(query, samples)
            pipeline_list = json.loads(pipeline_json)
            await self._update(
                agg_id,
                {
                    "pipeline": pipeline_list,
                    "status": AggregationStatus.READY,
                    "aggregation_error": None,
                },
            )
        except Exception as e:
            logger.error("pipeline_generation_failed", agg_id=agg_id, error=str(e))
            await self._update(
                agg_id,
                {"status": AggregationStatus.ERROR, "aggregation_error": str(e)},
            )

    async def get(self, agg_id: str) -> Optional[Aggregation]:
        doc = await self.col.find_one({"_id": ObjectId(agg_id)})
        return Aggregation.from_mongo(doc) if doc else None

    async def get_for_org(self, agg_id: str, org_id: str) -> Optional[Aggregation]:
        """Fetch aggregation only if its parent sift belongs to org_id."""
        agg = await self.get(agg_id)
        if not agg:
            return None
        from .sift_service import SiftService
        sift = await SiftService(self.db).get(agg.sift_id, org_id=org_id)
        return agg if sift else None

    async def list_all(
        self,
        sift_id: Optional[str] = None,
        sift_ids: Optional[list[str]] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Aggregation], int]:
        query: dict = {}
        if sift_id:
            query["sift_id"] = sift_id
        elif sift_ids is not None:
            query["sift_id"] = {"$in": sift_ids}
        total = await self.col.count_documents(query)
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [Aggregation.from_mongo(d) for d in docs], total

    async def delete(self, agg_id: str, org_id: Optional[str] = None) -> bool:
        if org_id is not None:
            agg = await self.get_for_org(agg_id, org_id)
            if not agg:
                return False
        result = await self.col.delete_one({"_id": ObjectId(agg_id)})
        return result.deleted_count > 0

    async def execute(self, agg_id: str) -> tuple[list[dict[str, Any]], list]:
        """Execute stored pipeline. Returns (results, pipeline_list)."""
        aggregation = await self.get(agg_id)
        if not aggregation:
            raise ValueError(f"Aggregation {agg_id} not found")
        if aggregation.status == AggregationStatus.ERROR:
            raise ValueError(f"Aggregation in error state: {aggregation.aggregation_error}")
        if aggregation.status == AggregationStatus.GENERATING:
            raise ValueError("Aggregation pipeline is still being generated")
        if not aggregation.pipeline:
            raise ValueError("Aggregation pipeline not yet generated")

        results = await self.results_service.execute_aggregation(
            aggregation.sift_id,
            aggregation.pipeline,
        )
        await self._update(agg_id, {"last_run_at": datetime.now(timezone.utc)})
        return results, aggregation.pipeline

    async def regenerate(self, agg_id: str) -> Aggregation:
        """Reset to generating and kick off pipeline re-generation."""
        aggregation = await self.get(agg_id)
        if not aggregation:
            raise ValueError(f"Aggregation {agg_id} not found")

        await self._update(
            agg_id,
            {"status": AggregationStatus.GENERATING, "aggregation_error": None, "pipeline": None},
        )

        asyncio.create_task(
            self._generate_and_store_pipeline(
                agg_id, aggregation.sift_id, aggregation.aggregation_query
            )
        )

        return await self.get(agg_id)

    async def live_query(
        self, sift_id: str, query: str
    ) -> tuple[list[dict[str, Any]], list]:
        """Run a one-off NL query against a sift's results."""
        samples = await self.results_service.get_sample_records(sift_id, limit=10)
        pipeline_json = await pipeline_agent.generate_pipeline(query, samples)
        pipeline_list = json.loads(pipeline_json)
        results = await self.results_service.execute_aggregation(sift_id, pipeline_list)
        return results, pipeline_list

    async def _update(self, agg_id: str, updates: dict) -> None:
        updates["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": ObjectId(agg_id)}, {"$set": updates})
