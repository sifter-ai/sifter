from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..services.webhook_service import WebhookService
from ._pagination import paginated

logger = structlog.get_logger()
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class CreateWebhookRequest(BaseModel):
    events: list[str]
    url: str
    sift_id: Optional[str] = None


def _wh_dict(wh) -> dict:
    return {
        "id": wh.id,
        "events": wh.events,
        "url": wh.url,
        "sift_id": wh.sift_id,
        "created_at": wh.created_at.isoformat(),
    }


@router.get("")
async def list_webhooks(
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = WebhookService(db)
    hooks, total = await svc.list_all(skip=offset, limit=limit, org_id=principal.org_id)
    return paginated([_wh_dict(h) for h in hooks], total, limit, offset)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: CreateWebhookRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = WebhookService(db)
    await svc.ensure_indexes()
    hook = await svc.create(events=body.events, url=body.url, sift_id=body.sift_id, org_id=principal.org_id)
    return _wh_dict(hook)


@router.delete("/{hook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    hook_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = WebhookService(db)
    ok = await svc.delete(hook_id, org_id=principal.org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Webhook not found")
