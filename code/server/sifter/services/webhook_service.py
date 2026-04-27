"""
Webhook service: CRUD and server-side delivery.
"""
from typing import Optional

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.webhook import Webhook

logger = structlog.get_logger()


def _matches_pattern(pattern: str, event: str) -> bool:
    """
    Match event against a wildcard pattern.
    - '*' alone or '**' — matches any event (catch-all)
    - '*'  within a path matches any single segment (e.g. 'sift.*')
    - '**' within a path matches any number of segments
    """
    if pattern in ("*", "**"):
        return True

    def _match(pp: list[str], ep: list[str]) -> bool:
        if not pp and not ep:
            return True
        if not pp:
            return False
        if pp[0] == "**":
            for i in range(len(ep) + 1):
                if _match(pp[1:], ep[i:]):
                    return True
            return False
        if not ep:
            return False
        if pp[0] == "*" or pp[0] == ep[0]:
            return _match(pp[1:], ep[1:])
        return False

    return _match(pattern.split("."), event.split("."))


class WebhookService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def ensure_indexes(self) -> None:
        await self.db["webhooks"].create_index("created_at")

    async def create(
        self,
        events: list[str],
        url: str,
        sift_id: Optional[str] = None,
        org_id: str = "default",
    ) -> Webhook:
        wh = Webhook(events=events, url=url, sift_id=sift_id, org_id=org_id)
        doc = wh.to_mongo()
        result = await self.db["webhooks"].insert_one(doc)
        wh.id = str(result.inserted_id)
        return wh

    async def list_all(self, skip: int = 0, limit: int = 50, org_id: str = "default") -> tuple[list[Webhook], int]:
        q = {"org_id": org_id}
        total = await self.db["webhooks"].count_documents(q)
        cursor = self.db["webhooks"].find(q).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [Webhook.from_mongo(d) for d in docs], total

    async def delete(self, hook_id: str, org_id: str = "default") -> bool:
        result = await self.db["webhooks"].delete_one({"_id": ObjectId(hook_id), "org_id": org_id})
        return result.deleted_count > 0

    async def dispatch(
        self,
        event: str,
        payload: dict,
        sift_id: Optional[str] = None,
        org_id: str = "default",
    ) -> None:
        """
        Fan out event to all matching webhooks. Fires-and-forgets HTTP POST.
        Called from background workers — failures are logged but not raised.
        """
        import asyncio
        import httpx

        cursor = self.db["webhooks"].find({"org_id": org_id})
        hooks = await cursor.to_list(length=None)

        matching = []
        for raw in hooks:
            wh = Webhook.from_mongo(raw)
            if wh.sift_id and sift_id and wh.sift_id != sift_id:
                continue
            if any(_matches_pattern(p, event) for p in wh.events):
                matching.append(wh)

        if not matching:
            return

        body = {"event": event, "payload": payload}
        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [client.post(wh.url, json=body) for wh in matching]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for wh, res in zip(matching, results):
                if isinstance(res, Exception):
                    logger.warning("webhook_delivery_failed", url=wh.url, webhook_event=event, error=str(res))
                else:
                    logger.info("webhook_delivered", url=wh.url, webhook_event=event, status=res.status_code)
