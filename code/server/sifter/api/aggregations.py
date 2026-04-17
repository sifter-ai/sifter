from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..models.aggregation import Aggregation
from ..services.aggregation_service import AggregationService

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
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
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
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    aggregations, total = await svc.list_all(sift_id=sift_id, skip=offset, limit=limit)
    return {"items": [_agg_to_dict(a) for a in aggregations], "total": total, "limit": limit, "offset": offset}


@router.get("/{agg_id}", response_model=dict)
async def get_aggregation(
    agg_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    aggregation = await svc.get(agg_id)
    if not aggregation:
        raise HTTPException(status_code=404, detail="Aggregation not found")
    return _agg_to_dict(aggregation)


@router.get("/{agg_id}/result")
async def get_aggregation_result(
    agg_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    aggregation = await svc.get(agg_id)
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
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    try:
        aggregation = await svc.regenerate(agg_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _agg_to_dict(aggregation)


@router.delete("/{agg_id}")
async def delete_aggregation(
    agg_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = AggregationService(db)
    deleted = await svc.delete(agg_id)
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
