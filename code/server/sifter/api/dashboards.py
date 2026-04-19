from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..services.dashboard_service import DashboardService
from ._pagination import paginated

logger = structlog.get_logger()
router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class CreateDashboardRequest(BaseModel):
    name: str
    description: str = ""
    spec: str = ""


class UpdateDashboardRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    spec: Optional[str] = None


class RegenerateDashboardRequest(BaseModel):
    spec: str


class AddTileRequest(BaseModel):
    sift_id: str
    kind: str
    title: str
    pipeline: list[dict[str, Any]] = []
    chart_x: Optional[str] = None
    chart_y: Optional[str] = None


class UpdateTileRequest(BaseModel):
    title: Optional[str] = None
    pipeline: Optional[list[dict[str, Any]]] = None
    chart_x: Optional[str] = None
    chart_y: Optional[str] = None


class GenerateTilesRequest(BaseModel):
    prompt: str
    sift_id: Optional[str] = None


class ReorderTilesRequest(BaseModel):
    tile_ids: list[str]


def _svc(db) -> DashboardService:
    return DashboardService(db)


@router.get("")
async def list_dashboards(
    limit: int = 50,
    offset: int = 0,
    skip: Optional[int] = None,  # deprecated alias for offset
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    effective_offset = skip if skip is not None else offset
    svc = _svc(db)
    items, total = await svc.list_all(skip=effective_offset, limit=limit)
    return paginated(items, total, limit, effective_offset)


@router.post("")
async def create_dashboard(
    body: CreateDashboardRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.create(
        name=body.name,
        description=body.description,
        spec=body.spec,
    )
    if body.spec and body.spec.strip():
        try:
            result = await svc.regenerate_from_spec(str(dashboard["_id"]), body.spec)
            return result["dashboard"]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error("create_dashboard_generate_error", error=str(e))
            raise HTTPException(status_code=500, detail=str(e))
    return dashboard


@router.get("/{dashboard_id}")
async def get_dashboard(
    dashboard_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.get(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.patch("/{dashboard_id}")
async def update_dashboard(
    dashboard_id: str,
    body: UpdateDashboardRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.update(
        dashboard_id,
        name=body.name,
        description=body.description,
        spec=body.spec,
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.delete("/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    deleted = await svc.delete(dashboard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"status": "deleted"}


@router.post("/{dashboard_id}/regenerate")
async def regenerate_dashboard(
    dashboard_id: str,
    body: RegenerateDashboardRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if not body.spec or not body.spec.strip():
        raise HTTPException(status_code=400, detail="spec is required")
    svc = _svc(db)
    try:
        result = await svc.regenerate_from_spec(dashboard_id, body.spec)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("regenerate_dashboard_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    return result


@router.post("/{dashboard_id}/tiles")
async def add_tile(
    dashboard_id: str,
    body: AddTileRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.add_tile(
        dashboard_id=dashboard_id,
        sift_id=body.sift_id,
        kind=body.kind,
        title=body.title,
        pipeline=body.pipeline,
        chart_x=body.chart_x,
        chart_y=body.chart_y,
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.patch("/{dashboard_id}/tiles/reorder")
async def reorder_tiles(
    dashboard_id: str,
    body: ReorderTilesRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.reorder_tiles(dashboard_id, body.tile_ids)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.patch("/{dashboard_id}/tiles/{tile_id}")
async def update_tile(
    dashboard_id: str,
    tile_id: str,
    body: UpdateTileRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    updates = body.model_dump(exclude_none=True)
    dashboard = await svc.update_tile(dashboard_id, tile_id, updates)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard or tile not found")
    return dashboard


@router.delete("/{dashboard_id}/tiles/{tile_id}")
async def delete_tile(
    dashboard_id: str,
    tile_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    dashboard = await svc.delete_tile(dashboard_id, tile_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.post("/{dashboard_id}/tiles/{tile_id}/refresh")
async def refresh_tile(
    dashboard_id: str,
    tile_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = _svc(db)
    try:
        snapshot = await svc.refresh_tile(dashboard_id, tile_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not snapshot:
        raise HTTPException(status_code=404, detail="Dashboard or tile not found")
    return snapshot


@router.post("/{dashboard_id}/generate")
async def generate_tiles(
    dashboard_id: str,
    body: GenerateTilesRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if not body.prompt or not body.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    svc = _svc(db)
    try:
        result = await svc.generate_tiles(
            dashboard_id=dashboard_id,
            prompt=body.prompt,
            sift_id=body.sift_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("generate_tiles_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    return result
