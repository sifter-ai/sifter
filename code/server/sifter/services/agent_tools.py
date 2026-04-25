"""
Agent tools for the chat agent loop.
Wraps the same business logic used by the MCP server but executes
directly against the database (no HTTP round-trip).
"""
import time
from dataclasses import dataclass
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from .aggregation_service import AggregationService
from .sift_results import SiftResultsService
from .sift_service import SiftService

AGENT_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "list_sifts",
            "description": "List all sifts available to the user with their name, status, and record counts.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sift",
            "description": "Get metadata and inferred extraction schema for a specific sift.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sift_id": {"type": "string", "description": "The sift identifier"}
                },
                "required": ["sift_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_records",
            "description": "Get a paginated list of extracted records from a sift.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sift_id": {"type": "string", "description": "The sift identifier"},
                    "limit": {"type": "integer", "description": "Max records to return (default 20, max 100)"},
                    "offset": {"type": "integer", "description": "Records to skip for pagination"},
                },
                "required": ["sift_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_sift",
            "description": "Run a natural language query against a sift's extracted records. The query is translated to a MongoDB aggregation pipeline automatically. Use this for most questions about data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sift_id": {"type": "string", "description": "The sift identifier"},
                    "natural_language": {
                        "type": "string",
                        "description": "The question to answer, e.g. 'What is the total revenue by client?'",
                    },
                },
                "required": ["sift_id", "natural_language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "aggregate_sift",
            "description": "Run a raw MongoDB aggregation pipeline against a sift's records. Use when you need precise control over the aggregation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sift_id": {"type": "string", "description": "The sift identifier"},
                    "pipeline": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": 'MongoDB aggregation stages, e.g. [{"$group": {"_id": "$client", "total": {"$sum": "$amount"}}}]',
                    },
                },
                "required": ["sift_id", "pipeline"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_records",
            "description": "Filter records in a sift using structured criteria (no LLM round-trip). Field names map to extracted_data keys.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sift_id": {"type": "string", "description": "The sift identifier"},
                    "filter": {
                        "type": "object",
                        "description": 'MongoDB-style filter on extracted fields, e.g. {"amount": {"$gt": 1000}}',
                    },
                    "limit": {"type": "integer", "description": "Max records (default 50, max 200)"},
                },
                "required": ["sift_id", "filter"],
            },
        },
    },
]


@dataclass
class ToolCallTrace:
    tool: str
    args: dict[str, Any]
    result_preview: str
    duration_ms: int


class AgentToolRunner:
    """Executes tool calls from the agent loop directly against services."""

    def __init__(self, db: AsyncIOMotorDatabase, org_id: str = "default"):
        self.org_id = org_id
        self.sift_svc = SiftService(db)
        self.results_svc = SiftResultsService(db)
        self.agg_svc = AggregationService(db)

    async def call(self, name: str, args: dict) -> tuple[Any, ToolCallTrace]:
        t0 = time.monotonic_ns()
        result = await self._dispatch(name, args)
        duration_ms = (time.monotonic_ns() - t0) // 1_000_000
        preview = _make_preview(name, result)
        return result, ToolCallTrace(tool=name, args=args, result_preview=preview, duration_ms=duration_ms)

    async def _dispatch(self, name: str, args: dict) -> Any:
        if name == "list_sifts":
            sifts, _ = await self.sift_svc.list_all(limit=50, org_id=self.org_id)
            return [
                {
                    "id": s.id,
                    "name": s.name,
                    "description": s.description,
                    "status": s.status,
                    "processed_documents": s.processed_documents,
                    "total_documents": s.total_documents,
                }
                for s in sifts
            ]

        if name == "get_sift":
            sift = await self.sift_svc.get(args["sift_id"])
            if not sift:
                return {"error": f"Sift {args['sift_id']} not found"}
            count = await self.results_svc.count(args["sift_id"])
            return {
                "id": sift.id,
                "name": sift.name,
                "description": sift.description,
                "instructions": sift.instructions,
                "schema": sift.schema,
                "schema_fields": sift.schema_fields,
                "status": sift.status,
                "record_count": count,
            }

        if name == "list_records":
            limit = min(args.get("limit", 20), 100)
            offset = args.get("offset", 0)
            results, total = await self.results_svc.get_results(args["sift_id"], skip=offset, limit=limit)
            return {
                "total": total,
                "records": [{"id": r.id, "filename": r.filename, **r.extracted_data} for r in results],
            }

        if name == "query_sift":
            results, pipeline = await self.agg_svc.live_query(
                args["sift_id"], args["natural_language"]
            )
            return {"results": results, "pipeline": pipeline, "count": len(results)}

        if name == "aggregate_sift":
            pipeline = args.get("pipeline")
            if pipeline is None:
                return {"error": "Missing required argument: pipeline. Provide a list of MongoDB aggregation stages."}
            results = await self.results_svc.execute_aggregation(args["sift_id"], pipeline)
            return {"results": results, "count": len(results)}

        if name == "find_records":
            limit = min(args.get("limit", 50), 200)
            raw_filter = args.get("filter", {})
            mongo_filter = {f"extracted_data.{k}": v for k, v in raw_filter.items()}
            pipeline = [{"$match": mongo_filter}, {"$limit": limit}]
            results = await self.results_svc.execute_aggregation(args["sift_id"], pipeline)
            return {"results": results, "count": len(results)}

        raise ValueError(f"Unknown tool: {name}")


def _make_preview(tool_name: str, result: Any) -> str:
    if isinstance(result, list):
        return f"{len(result)} items"
    if isinstance(result, dict):
        if "error" in result:
            return f"error: {result['error']}"
        if "count" in result:
            return f"{result['count']} results"
        if "total" in result:
            return f"{result['total']} records"
        keys = list(result.keys())[:3]
        return ", ".join(keys)
    return str(result)[:80]
