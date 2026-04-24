from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..models.aggregation import Aggregation
from ..services.aggregation_service import AggregationService
from ..services.sift_service import SiftService
from ._pagination import paginated

logger = structlog.get_logger()
router = APIRouter(prefix="/api/aggregations", tags=["aggregations"])


class CreateAggregationRequest(BaseModel):
    name: str
    description: str = ""
    sift_id: str
    aggregation_query: str


@router.post("", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def create_aggregation(
    body: CreateAggregationRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    sift_svc = SiftService(db)
    if not await sift_svc.get(body.sift_id, org_id=principal.org_id):
        raise HTTPException(status_code=404, detail="Sift not found")
    svc = AggregationService(db)
    await svc.ensure_indexes()
    aggregation = await svc.create(
        name=body.name,
        description=body.description,
        sift_id=body.sift_id,
        query=body.aggregation_query,
    )
    return _agg_to_dict(aggregation)


@router.get("", response_model=dict)
async def list_aggregations(
    sift_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    sift_svc = SiftService(db)
    if sift_id:
        if not await sift_svc.get(sift_id, org_id=principal.org_id):
            raise HTTPException(status_code=404, detail="Sift not found")
        aggregations, total = await svc.list_all(sift_id=sift_id, skip=offset, limit=limit)
    else:
        org_sifts, _ = await sift_svc.list_all(org_id=principal.org_id, limit=1000)
        sift_ids = [s.id for s in org_sifts]
        aggregations, total = await svc.list_all(sift_ids=sift_ids, skip=offset, limit=limit)
    return paginated([_agg_to_dict(a) for a in aggregations], total, limit, offset)


@router.get("/{agg_id}", response_model=dict)
async def get_aggregation(
    agg_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    aggregation = await svc.get_for_org(agg_id, principal.org_id)
    if not aggregation:
        raise HTTPException(status_code=404, detail="Aggregation not found")
    return _agg_to_dict(aggregation)


@router.get("/{agg_id}/result")
async def get_aggregation_result(
    agg_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    aggregation = await svc.get_for_org(agg_id, principal.org_id)
    if not aggregation:
        raise HTTPException(status_code=404, detail="Aggregation not found")
    try:
        results, pipeline = await svc.execute(agg_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("aggregation_execute_error", agg_id=agg_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    return {"results": results, "pipeline": pipeline, "ran_at": datetime.now(timezone.utc).isoformat()}


@router.post("/{agg_id}/regenerate")
async def regenerate_aggregation(
    agg_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    if not await svc.get_for_org(agg_id, principal.org_id):
        raise HTTPException(status_code=404, detail="Aggregation not found")
    try:
        aggregation = await svc.regenerate(agg_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _agg_to_dict(aggregation)


@router.delete("/{agg_id}")
async def delete_aggregation(
    agg_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    deleted = await svc.delete(agg_id, org_id=principal.org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Aggregation not found")
    return {"deleted": True}


def _agg_to_dict(a: Aggregation) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "sift_id": a.sift_id,
        "aggregation_query": a.aggregation_query,
        "pipeline": a.pipeline,
        "aggregation_error": a.aggregation_error,
        "status": a.status,
        "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None,
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }
