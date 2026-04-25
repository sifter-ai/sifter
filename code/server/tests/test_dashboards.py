"""
Integration + unit tests for the dashboard API and DashboardService.

Covers: CRUD, tiles, reorder, refresh, 404 paths, spec-driven generation (mocked LLM).
"""
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

os.environ.setdefault("SIFTER_MONGODB_DATABASE", "sifter_test")
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal


async def _mock_principal() -> Principal:
    return Principal(key_id="test-key")


app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_dashboards(client):
    from sifter.db import get_db
    db = get_db()
    await db["dashboards"].delete_many({})
    yield


# ── list ─────────────────────────────────────────────────────────────────────

async def test_list_dashboards_empty(client):
    r = await client.get("/api/dashboards")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0


# ── create + get ─────────────────────────────────────────────────────────────

async def test_create_dashboard_no_spec(client):
    r = await client.post("/api/dashboards", json={"name": "Sales", "description": "Q1 sales"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Sales"
    assert data["description"] == "Q1 sales"
    assert data["tiles"] == []
    assert "_id" in data


async def test_create_and_get_dashboard(client):
    r = await client.post("/api/dashboards", json={"name": "Ops"})
    assert r.status_code == 200
    dash_id = r.json()["_id"]

    r2 = await client.get(f"/api/dashboards/{dash_id}")
    assert r2.status_code == 200
    assert r2.json()["name"] == "Ops"


async def test_get_dashboard_not_found(client):
    r = await client.get("/api/dashboards/000000000000000000000000")
    assert r.status_code == 404


async def test_create_dashboard_with_spec_mocked(client):
    from sifter.services.widget_agent import WidgetAgentResult

    mock_widgets = [
        {"sift_id": None, "kind": "kpi", "title": "Total Revenue", "pipeline": [], "chart_x": None, "chart_y": None}
    ]

    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new=AsyncMock(return_value=WidgetAgentResult(widgets=mock_widgets)),
    ), patch(
        "sifter.services.dashboard_service.DashboardService.refresh_tile",
        new=AsyncMock(return_value=None),
    ):
        r = await client.post(
            "/api/dashboards",
            json={"name": "AI Board", "spec": "Show revenue KPI"},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "AI Board"
    assert len(data["tiles"]) == 1
    assert data["tiles"][0]["title"] == "Total Revenue"


# ── update ─────────────────────────────────────────────────────────────────

async def test_update_dashboard_name(client):
    r = await client.post("/api/dashboards", json={"name": "Old Name"})
    dash_id = r.json()["_id"]

    r2 = await client.patch(f"/api/dashboards/{dash_id}", json={"name": "New Name"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "New Name"


async def test_update_dashboard_not_found(client):
    r = await client.patch(
        "/api/dashboards/000000000000000000000000",
        json={"name": "Phantom"},
    )
    assert r.status_code == 404


# ── delete ─────────────────────────────────────────────────────────────────

async def test_delete_dashboard(client):
    r = await client.post("/api/dashboards", json={"name": "Temp"})
    dash_id = r.json()["_id"]

    r2 = await client.delete(f"/api/dashboards/{dash_id}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "deleted"

    r3 = await client.get(f"/api/dashboards/{dash_id}")
    assert r3.status_code == 404


async def test_delete_dashboard_not_found(client):
    r = await client.delete("/api/dashboards/000000000000000000000000")
    assert r.status_code == 404


# ── tiles ─────────────────────────────────────────────────────────────────

async def test_add_tile_to_dashboard(client):
    r = await client.post("/api/dashboards", json={"name": "Tiled Board"})
    dash_id = r.json()["_id"]

    r2 = await client.post(
        f"/api/dashboards/{dash_id}/tiles",
        json={"sift_id": "sift-1", "kind": "kpi", "title": "Count", "pipeline": []},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["tiles"]) == 1
    tile_id = data["tiles"][0]["id"]
    assert data["tiles"][0]["title"] == "Count"
    return dash_id, tile_id


async def test_add_tile_not_found(client):
    r = await client.post(
        "/api/dashboards/000000000000000000000000/tiles",
        json={"sift_id": "s", "kind": "kpi", "title": "T", "pipeline": []},
    )
    assert r.status_code == 404


async def test_update_tile(client):
    r = await client.post("/api/dashboards", json={"name": "Tile Update Board"})
    dash_id = r.json()["_id"]
    r2 = await client.post(
        f"/api/dashboards/{dash_id}/tiles",
        json={"sift_id": "s1", "kind": "kpi", "title": "Old Title", "pipeline": []},
    )
    tile_id = r2.json()["tiles"][0]["id"]

    r3 = await client.patch(
        f"/api/dashboards/{dash_id}/tiles/{tile_id}",
        json={"title": "New Title"},
    )
    assert r3.status_code == 200
    tile = next(t for t in r3.json()["tiles"] if t["id"] == tile_id)
    assert tile["title"] == "New Title"


async def test_delete_tile(client):
    r = await client.post("/api/dashboards", json={"name": "Tile Delete Board"})
    dash_id = r.json()["_id"]
    r2 = await client.post(
        f"/api/dashboards/{dash_id}/tiles",
        json={"sift_id": "s1", "kind": "kpi", "title": "To Delete", "pipeline": []},
    )
    tile_id = r2.json()["tiles"][0]["id"]

    r3 = await client.delete(f"/api/dashboards/{dash_id}/tiles/{tile_id}")
    assert r3.status_code == 200
    assert r3.json()["tiles"] == []


async def test_reorder_tiles(client):
    r = await client.post("/api/dashboards", json={"name": "Reorder Board"})
    dash_id = r.json()["_id"]

    # Add two tiles
    r2 = await client.post(
        f"/api/dashboards/{dash_id}/tiles",
        json={"sift_id": "s", "kind": "kpi", "title": "A", "pipeline": []},
    )
    tile_a = r2.json()["tiles"][0]["id"]
    r3 = await client.post(
        f"/api/dashboards/{dash_id}/tiles",
        json={"sift_id": "s", "kind": "kpi", "title": "B", "pipeline": []},
    )
    tile_b = r3.json()["tiles"][-1]["id"]

    # Reverse order
    r4 = await client.patch(
        f"/api/dashboards/{dash_id}/tiles/reorder",
        json={"tile_ids": [tile_b, tile_a]},
    )
    assert r4.status_code == 200
    tiles = r4.json()["tiles"]
    assert tiles[0]["id"] == tile_b
    assert tiles[1]["id"] == tile_a


# ── regenerate ────────────────────────────────────────────────────────────

async def test_regenerate_requires_spec(client):
    r = await client.post("/api/dashboards", json={"name": "Regen Board"})
    dash_id = r.json()["_id"]

    r2 = await client.post(f"/api/dashboards/{dash_id}/regenerate", json={"spec": ""})
    assert r2.status_code == 400


async def test_regenerate_with_spec(client):
    from sifter.services.widget_agent import WidgetAgentResult

    r = await client.post("/api/dashboards", json={"name": "Regen Board 2"})
    dash_id = r.json()["_id"]

    mock_widget = {"sift_id": None, "kind": "table", "title": "Documents", "pipeline": [], "chart_x": None, "chart_y": None}
    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new=AsyncMock(return_value=WidgetAgentResult(widgets=[mock_widget])),
    ):
        r2 = await client.post(
            f"/api/dashboards/{dash_id}/regenerate",
            json={"spec": "Show document table"},
        )
    assert r2.status_code == 200


# ── generate tiles ────────────────────────────────────────────────────────

async def test_generate_tiles_requires_prompt(client):
    r = await client.post("/api/dashboards", json={"name": "Gen Board"})
    dash_id = r.json()["_id"]
    r2 = await client.post(
        f"/api/dashboards/{dash_id}/generate",
        json={"prompt": ""},
    )
    assert r2.status_code == 400


async def test_generate_tiles_mocked(client):
    from sifter.services.widget_agent import WidgetAgentResult

    r = await client.post("/api/dashboards", json={"name": "Gen Board 2"})
    dash_id = r.json()["_id"]

    mock_widget = {"sift_id": None, "kind": "kpi", "title": "Revenue", "pipeline": [], "chart_x": None, "chart_y": None}
    with patch(
        "sifter.services.dashboard_service.generate_widgets",
        new=AsyncMock(return_value=WidgetAgentResult(widgets=[mock_widget])),
    ), patch(
        "sifter.services.dashboard_service.DashboardService.refresh_tile",
        new=AsyncMock(return_value=None),
    ):
        r2 = await client.post(
            f"/api/dashboards/{dash_id}/generate",
            json={"prompt": "Add a revenue KPI"},
        )
    assert r2.status_code == 200


# ── list pagination ────────────────────────────────────────────────────────

async def test_list_dashboards_pagination(client):
    from sifter.db import get_db
    db = get_db()
    await db["dashboards"].delete_many({})

    for i in range(5):
        await client.post("/api/dashboards", json={"name": f"Board {i}"})

    r = await client.get("/api/dashboards?skip=0&limit=3")
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3

    r2 = await client.get("/api/dashboards?skip=3&limit=3")
    data2 = r2.json()
    assert len(data2["items"]) == 2


# ── DashboardService unit tests ────────────────────────────────────────────

async def test_dashboard_service_create_and_get():
    from sifter.db import get_db
    from sifter.services.dashboard_service import DashboardService

    db = get_db()
    await db["dashboards"].delete_many({})
    svc = DashboardService(db)

    created = await svc.create(name="Unit Test Board", description="desc")
    assert created["name"] == "Unit Test Board"
    assert created["tiles"] == []

    fetched = await svc.get(created["_id"])
    assert fetched is not None
    assert fetched["name"] == "Unit Test Board"


async def test_dashboard_service_get_nonexistent():
    from sifter.db import get_db
    from sifter.services.dashboard_service import DashboardService

    db = get_db()
    svc = DashboardService(db)
    result = await svc.get("000000000000000000000000")
    assert result is None


async def test_dashboard_service_reorder_preserves_unknown_tiles():
    from sifter.db import get_db
    from sifter.services.dashboard_service import DashboardService

    db = get_db()
    await db["dashboards"].delete_many({})
    svc = DashboardService(db)

    dash = await svc.create("Reorder Unit")
    dash = await svc.add_tile(dash["_id"], "s", "kpi", "A", [])
    dash = await svc.add_tile(dash["_id"], "s", "kpi", "B", [])
    dash = await svc.add_tile(dash["_id"], "s", "kpi", "C", [])

    tile_ids = [t["id"] for t in dash["tiles"]]
    a, b, c = tile_ids

    # Reorder with only 2 of 3 — C should be preserved at end
    result = await svc.reorder_tiles(dash["_id"], [c, a])
    ids_after = [t["id"] for t in result["tiles"]]
    assert ids_after[0] == c
    assert ids_after[1] == a
    assert b in ids_after
