"""
Unit tests for DashboardService — covers missing lines in dashboard_service.py.
Uses real MongoDB (sifter_test) for CRUD and patches for AI methods.
"""
import os
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

os.environ.setdefault("SIFTER_MONGODB_DATABASE", "sifter_test")
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session")
async def db():
    from sifter.db import get_db
    d = get_db()
    yield d


@pytest_asyncio.fixture(autouse=True, scope="session")
async def clean(db):
    await db["dashboards"].delete_many({})
    yield


# ── ensure_indexes (line 51) ──────────────────────────────────────────────────

async def test_ensure_indexes(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    await svc.ensure_indexes()  # just must not raise


# ── get() invalid ObjectId → exception handler (lines 80-81) ─────────────────

async def test_get_invalid_id_returns_none(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.get("not-a-valid-objectid")
    assert result is None


# ── _hydrate_snapshots exception path (lines 104-107) ────────────────────────

async def test_hydrate_snapshots_execute_fails_returns_fallback(db):
    """When execute_aggregation raises, the fallback snapshot is used."""
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)

    dash = await svc.create("Hydrate Fail Dash")
    dash_id = dash["_id"]
    # Add a tile manually
    await db["dashboards"].update_one(
        {"_id": ObjectId(dash_id)},
        {"$push": {"tiles": {
            "id": "t1", "sift_id": "s1", "kind": "kpi",
            "title": "T", "pipeline": [], "chart_x": None, "chart_y": None,
        }}}
    )

    with patch(
        "sifter.services.dashboard_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        side_effect=Exception("no collection"),
    ):
        result = await svc.get(dash_id)

    # Snapshot should exist but be empty fallback
    assert result is not None
    assert "snapshots" in result


# ── update() with description and spec (lines 123, 125) ──────────────────────

async def test_update_description_and_spec(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    dash = await svc.create("UpdateDescSpec")
    result = await svc.update(dash["_id"], description="new desc", spec="total by client")
    assert result is not None


# ── reorder_tiles() invalid ObjectId and not-found (lines 179-180, 182) ──────

async def test_reorder_tiles_invalid_id(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.reorder_tiles("not-valid", ["a", "b"])
    assert result is None


async def test_reorder_tiles_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.reorder_tiles(str(ObjectId()), ["a"])
    assert result is None


# ── update_layout() invalid ObjectId and full path (lines 207-208, 212-231) ──

async def test_update_layout_invalid_id(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.update_layout("not-valid", [])
    assert result is None


async def test_update_layout_with_tiles(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    dash = await svc.create("LayoutDash")
    dash_id = dash["_id"]

    # Add a tile
    dash = await svc.add_tile(dash_id, "s1", "kpi", "Revenue", [])
    tile_id = dash["tiles"][0]["id"]

    with patch(
        "sifter.services.dashboard_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        return_value=[],
    ):
        result = await svc.update_layout(dash_id, [
            {"tile_id": tile_id, "x": 0, "y": 0, "w": 6, "h": 3}
        ])
    assert result is not None
    tile = next(t for t in result["tiles"] if t["id"] == tile_id)
    assert tile["layout"]["w"] == 6


async def test_update_layout_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.update_layout(str(ObjectId()), [])
    assert result is None


# ── refresh_tile() paths (lines 249, 252, 256-258) ───────────────────────────

async def test_refresh_tile_dashboard_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    result = await svc.refresh_tile(str(ObjectId()), "any-tile")
    assert result is None


async def test_refresh_tile_tile_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    dash = await svc.create("RefreshMiss")
    result = await svc.refresh_tile(dash["_id"], "nonexistent-tile-id")
    assert result is None


async def test_refresh_tile_execute_fails_reraises(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    dash = await svc.create("RefreshFail")
    dash_id = dash["_id"]
    await db["dashboards"].update_one(
        {"_id": ObjectId(dash_id)},
        {"$push": {"tiles": {
            "id": "t_fail", "sift_id": "s1", "kind": "kpi",
            "title": "T", "pipeline": [], "chart_x": None, "chart_y": None,
        }}}
    )
    with patch(
        "sifter.services.dashboard_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        side_effect=Exception("db down"),
    ):
        with pytest.raises(Exception, match="db down"):
            await svc.refresh_tile(dash_id, "t_fail")


# ── generate_tiles() not-found and no-widgets (lines 288, 291-293, 302-306) ──

async def test_generate_tiles_dashboard_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    with pytest.raises(ValueError, match="not found"):
        await svc.generate_tiles(str(ObjectId()), "some prompt")


async def test_generate_tiles_sift_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    dash = await svc.create("GenTilesSiftMiss")
    with pytest.raises(ValueError, match="not found"):
        await svc.generate_tiles(dash["_id"], "prompt", sift_id=str(ObjectId()))


async def test_generate_tiles_no_widgets_raises(db):
    from sifter.services.dashboard_service import DashboardService
    from sifter.services.widget_agent import WidgetAgentResult
    svc = DashboardService(db)
    dash = await svc.create("GenNoWidgets")
    empty_result = WidgetAgentResult(widgets=[], trace=[])
    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new_callable=AsyncMock,
        return_value=empty_result,
    ):
        with pytest.raises(ValueError, match="could not produce any widgets"):
            await svc.generate_tiles(dash["_id"], "unparseable prompt")


async def test_generate_tiles_refresh_error_swallowed(db):
    """Tile is added but refresh fails — error is recorded but no exception raised."""
    from sifter.services.dashboard_service import DashboardService
    from sifter.services.widget_agent import WidgetAgentResult
    svc = DashboardService(db)
    dash = await svc.create("GenRefreshErr")
    dash_id = dash["_id"]

    widget = {
        "sift_id": "s1", "kind": "kpi", "title": "Rev",
        "pipeline": [], "chart_x": None, "chart_y": None,
    }
    agent_result = WidgetAgentResult(widgets=[widget], trace=[])

    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new_callable=AsyncMock,
        return_value=agent_result,
    ), patch(
        "sifter.services.dashboard_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        side_effect=Exception("no collection"),
    ):
        result = await svc.generate_tiles(dash_id, "some prompt")

    assert result["added"] == 1
    assert len(result["refresh_errors"]) == 1


# ── regenerate_from_spec() paths (lines 354, 363-367, 397-399) ───────────────

async def test_regenerate_from_spec_dashboard_not_found(db):
    from sifter.services.dashboard_service import DashboardService
    svc = DashboardService(db)
    with pytest.raises(ValueError, match="not found"):
        await svc.regenerate_from_spec(str(ObjectId()), "spec")


async def test_regenerate_from_spec_no_widgets_raises(db):
    from sifter.services.dashboard_service import DashboardService
    from sifter.services.widget_agent import WidgetAgentResult
    svc = DashboardService(db)
    dash = await svc.create("RegenNoWidgets")
    empty_result = WidgetAgentResult(widgets=[], trace=[])
    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new_callable=AsyncMock,
        return_value=empty_result,
    ):
        with pytest.raises(ValueError, match="could not produce any widgets"):
            await svc.regenerate_from_spec(dash["_id"], "spec")


async def test_regenerate_from_spec_refresh_error_swallowed(db):
    from sifter.services.dashboard_service import DashboardService
    from sifter.services.widget_agent import WidgetAgentResult
    svc = DashboardService(db)
    dash = await svc.create("RegenRefreshErr")

    widget = {
        "sift_id": "s1", "kind": "bar", "title": "Chart",
        "pipeline": [], "chart_x": "x", "chart_y": "y",
    }
    agent_result = WidgetAgentResult(widgets=[widget], trace=[])

    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new_callable=AsyncMock,
        return_value=agent_result,
    ), patch(
        "sifter.services.dashboard_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        side_effect=Exception("db unreachable"),
    ):
        result = await svc.regenerate_from_spec(dash["_id"], "spec text")

    assert result["added"] == 1
    assert len(result["refresh_errors"]) == 1
