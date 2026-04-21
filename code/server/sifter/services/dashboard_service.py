"""Dashboard CRUD + tile execution + AI generation."""
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..config import config
from .aggregation_service import AggregationService
from .sift_results import SiftResultsService
from .sift_service import SiftService
from .widget_agent import WidgetAgentResult, generate_widgets

logger = structlog.get_logger()
COLLECTION = "dashboards"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(doc: dict) -> dict:
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, dict):
            result[k] = _serialize(v)
        elif isinstance(v, list):
            result[k] = [_serialize(i) if isinstance(i, dict) else i for i in v]
        else:
            result[k] = v
    return result


class DashboardService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[COLLECTION]
        self.results_svc = SiftResultsService(db)
        self.agg_svc = AggregationService(db)
        self.sift_svc = SiftService(db)

    async def ensure_indexes(self):
        await self.col.create_index("created_at", name="created_at_idx")

    # ---- CRUD ----

    async def list_all(self, skip: int = 0, limit: int = 50, org_id: str = "default") -> tuple[list[dict], int]:
        q = {"org_id": org_id}
        total = await self.col.count_documents(q)
        cursor = self.col.find(q).sort("created_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [_serialize(d) for d in docs], total

    async def create(self, name: str, description: str = "", spec: str = "", org_id: str = "default") -> dict:
        doc = {
            "name": name,
            "description": description,
            "spec": spec,
            "org_id": org_id,
            "tiles": [],
            "snapshots": {},
            "created_at": _now(),
            "updated_at": _now(),
        }
        result = await self.col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return _serialize(doc)

    async def get(self, dashboard_id: str) -> Optional[dict]:
        try:
            doc = await self.col.find_one({"_id": ObjectId(dashboard_id)})
        except Exception:
            return None
        if not doc:
            return None
        serialized = _serialize(doc)
        await self._hydrate_snapshots(serialized)
        return serialized

    async def _hydrate_snapshots(self, dashboard: dict) -> None:
        """Run every tile's pipeline concurrently and replace stored snapshots with live results."""
        tiles = dashboard.get("tiles") or []
        if not tiles:
            return

        async def _run(tile: dict) -> tuple[str, dict]:
            tile_id = tile["id"]
            try:
                results = await self.results_svc.execute_aggregation(tile["sift_id"], tile["pipeline"])
                return tile_id, {
                    "tile_id": tile_id,
                    "sift_id": tile["sift_id"],
                    "result": results,
                    "ran_at": _now().isoformat(),
                }
            except Exception as e:
                logger.warning("tile_live_query_failed", tile_id=tile_id, error=str(e))
                existing = (dashboard.get("snapshots") or {}).get(tile_id)
                return tile_id, existing or {}

        results = await asyncio.gather(*[_run(t) for t in tiles])
        dashboard["snapshots"] = {tile_id: snap for tile_id, snap in results}

    async def update(
        self,
        dashboard_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        spec: Optional[str] = None,
    ) -> Optional[dict]:
        updates: dict = {"updated_at": _now()}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if spec is not None:
            updates["spec"] = spec
        await self.col.update_one({"_id": ObjectId(dashboard_id)}, {"$set": updates})
        return await self.get(dashboard_id)

    async def delete(self, dashboard_id: str) -> bool:
        result = await self.col.delete_one({"_id": ObjectId(dashboard_id)})
        return result.deleted_count > 0

    # ---- Tiles ----

    async def add_tile(
        self,
        dashboard_id: str,
        sift_id: str,
        kind: str,
        title: str,
        pipeline: list,
        chart_x: Optional[str] = None,
        chart_y: Optional[str] = None,
    ) -> Optional[dict]:
        tile = {
            "id": str(uuid4()),
            "sift_id": sift_id,
            "kind": kind,
            "title": title,
            "pipeline": pipeline,
            "chart_x": chart_x,
            "chart_y": chart_y,
            "is_auto_generated": False,
            "created_at": _now().isoformat(),
        }
        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$push": {"tiles": tile}, "$set": {"updated_at": _now()}},
        )
        return await self.get(dashboard_id)

    async def update_tile(self, dashboard_id: str, tile_id: str, updates: dict) -> Optional[dict]:
        set_updates = {f"tiles.$.{k}": v for k, v in updates.items() if k not in ("id", "sift_id")}
        set_updates["updated_at"] = _now()
        await self.col.update_one(
            {"_id": ObjectId(dashboard_id), "tiles.id": tile_id},
            {"$set": set_updates},
        )
        return await self.get(dashboard_id)

    async def reorder_tiles(self, dashboard_id: str, tile_ids: list[str]) -> Optional[dict]:
        """Rearrange the tiles array to match the order of `tile_ids`.

        Unknown IDs are ignored; tiles not mentioned are appended in their
        current relative order (defensive — clients should always send the full list).
        """
        try:
            doc = await self.col.find_one({"_id": ObjectId(dashboard_id)})
        except Exception:
            return None
        if not doc:
            return None

        tiles = doc.get("tiles", [])
        by_id = {t["id"]: t for t in tiles}
        ordered: list[dict] = []
        seen: set[str] = set()
        for tid in tile_ids:
            if tid in by_id and tid not in seen:
                ordered.append(by_id[tid])
                seen.add(tid)
        # Preserve any tiles the client forgot about
        for t in tiles:
            if t["id"] not in seen:
                ordered.append(t)

        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$set": {"tiles": ordered, "updated_at": _now()}},
        )
        return await self.get(dashboard_id)

    async def update_layout(self, dashboard_id: str, layouts: list[dict]) -> Optional[dict]:
        """Batch-update the layout (x, y, w, h) for a list of tiles."""
        try:
            doc = await self.col.find_one({"_id": ObjectId(dashboard_id)})
        except Exception:
            return None
        if not doc:
            return None

        layout_by_id = {item["tile_id"]: item for item in layouts}
        tiles = doc.get("tiles", [])
        updated_tiles = []
        for tile in tiles:
            if tile["id"] in layout_by_id:
                lay = layout_by_id[tile["id"]]
                tile = dict(tile)
                tile["layout"] = {
                    "x": lay.get("x", 0),
                    "y": lay.get("y", 0),
                    "w": lay.get("w", 4),
                    "h": lay.get("h", 4),
                }
            updated_tiles.append(tile)

        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$set": {"tiles": updated_tiles, "updated_at": _now()}},
        )
        return await self.get(dashboard_id)

    async def delete_tile(self, dashboard_id: str, tile_id: str) -> Optional[dict]:
        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {
                "$pull": {"tiles": {"id": tile_id}},
                "$unset": {f"snapshots.{tile_id}": ""},
                "$set": {"updated_at": _now()},
            },
        )
        return await self.get(dashboard_id)

    # ---- Snapshot / refresh ----

    async def refresh_tile(self, dashboard_id: str, tile_id: str) -> Optional[dict]:
        dashboard = await self.get(dashboard_id)
        if not dashboard:
            return None
        tile = next((t for t in dashboard.get("tiles", []) if t["id"] == tile_id), None)
        if not tile:
            return None

        try:
            results = await self.results_svc.execute_aggregation(tile["sift_id"], tile["pipeline"])
        except Exception as e:
            logger.warning("tile_refresh_failed", tile_id=tile_id, error=str(e))
            raise

        snapshot = {
            "tile_id": tile_id,
            "sift_id": tile["sift_id"],
            "result": results,
            "ran_at": _now().isoformat(),
        }
        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$set": {f"snapshots.{tile_id}": snapshot, "updated_at": _now()}},
        )
        return snapshot

    # ---- AI generate ----

    async def generate_tiles(
        self,
        dashboard_id: str,
        prompt: str,
        sift_id: Optional[str] = None,
    ) -> dict:
        """Use the widget agent to propose tiles from a natural-language prompt,
        then persist them on the dashboard with an initial snapshot each.

        Returns {"dashboard": ..., "added": int, "trace": [...]}
        """
        dashboard = await self.get(dashboard_id)
        if not dashboard:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        if sift_id:
            sift = await self.sift_svc.get(sift_id)
            if not sift:
                raise ValueError(f"Sift {sift_id} not found")

        agent_result: WidgetAgentResult = await generate_widgets(
            prompt=prompt,
            sift_hint=sift_id,
            db=self.db,
        )

        if not agent_result.widgets:
            raise ValueError(
                "The widget agent could not produce any widgets for this prompt. "
                "Try rephrasing or pick a specific sift."
            )

        added_ids: list[str] = []
        for spec in agent_result.widgets:
            dash = await self.add_tile(
                dashboard_id=dashboard_id,
                sift_id=spec["sift_id"],
                kind=spec["kind"],
                title=spec["title"],
                pipeline=spec["pipeline"],
                chart_x=spec.get("chart_x"),
                chart_y=spec.get("chart_y"),
            )
            tiles = (dash or {}).get("tiles", [])
            if tiles:
                added_ids.append(tiles[-1]["id"])

        refresh_errors: list[dict] = []
        for tid in added_ids:
            try:
                await self.refresh_tile(dashboard_id, tid)
            except Exception as e:
                logger.warning("generated_tile_refresh_failed", tile_id=tid, error=str(e))
                refresh_errors.append({"tile_id": tid, "error": str(e)})

        return {
            "dashboard": await self.get(dashboard_id),
            "added": len(added_ids),
            "trace": [
                {
                    "tool": t.tool,
                    "args": t.args,
                    "result_preview": t.result_preview,
                    "duration_ms": t.duration_ms,
                }
                for t in agent_result.trace
            ],
            "refresh_errors": refresh_errors,
        }

    async def regenerate_from_spec(self, dashboard_id: str, spec: str) -> dict:
        """Replace all tiles with a fresh set generated from `spec`.

        The natural-language spec is persisted on the dashboard as its source
        of truth. Existing tiles and their snapshots are discarded.
        """
        dashboard = await self.get(dashboard_id)
        if not dashboard:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        agent_result: WidgetAgentResult = await generate_widgets(
            prompt=spec,
            sift_hint=None,
            db=self.db,
        )

        if not agent_result.widgets:
            raise ValueError(
                "The widget agent could not produce any widgets for this spec. "
                "Try rephrasing it."
            )

        new_tiles: list[dict] = []
        for w in agent_result.widgets:
            new_tiles.append({
                "id": str(uuid4()),
                "sift_id": w["sift_id"],
                "kind": w["kind"],
                "title": w["title"],
                "pipeline": w["pipeline"],
                "chart_x": w.get("chart_x"),
                "chart_y": w.get("chart_y"),
                "is_auto_generated": True,
                "created_at": _now().isoformat(),
            })

        await self.col.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$set": {
                "spec": spec,
                "tiles": new_tiles,
                "snapshots": {},
                "updated_at": _now(),
            }},
        )

        refresh_errors: list[dict] = []
        for t in new_tiles:
            try:
                await self.refresh_tile(dashboard_id, t["id"])
            except Exception as e:
                logger.warning("regenerated_tile_refresh_failed", tile_id=t["id"], error=str(e))
                refresh_errors.append({"tile_id": t["id"], "error": str(e)})

        return {
            "dashboard": await self.get(dashboard_id),
            "added": len(new_tiles),
            "trace": [
                {
                    "tool": t.tool,
                    "args": t.args,
                    "result_preview": t.result_preview,
                    "duration_ms": t.duration_ms,
                }
                for t in agent_result.trace
            ],
            "refresh_errors": refresh_errors,
        }
