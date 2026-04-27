"""
Integration tests for /api/chat/sessions — CRUD and message flow.
Uses real MongoDB (sifter_test) with LLM mocked.
"""
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal


async def _mock_principal() -> Principal:
    return Principal(key_id="testuser", user_id="testuser")


app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_sessions(client):
    from sifter.db import get_db
    db = get_db()
    await db["chat_sessions"].delete_many({})
    await db["chat_messages"].delete_many({})
    yield


# ── create session ────────────────────────────────────────────────────────────

async def test_create_session(client):
    r = await client.post("/api/chat/sessions")
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["title"] == ""


# ── list sessions ─────────────────────────────────────────────────────────────

async def test_list_sessions_empty(client):
    r = await client.get("/api/chat/sessions")
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_list_sessions_after_create(client):
    await client.post("/api/chat/sessions")
    await client.post("/api/chat/sessions")
    r = await client.get("/api/chat/sessions")
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 2


# ── get session ───────────────────────────────────────────────────────────────

async def test_get_session(client):
    r = await client.post("/api/chat/sessions")
    sid = r.json()["id"]

    r2 = await client.get(f"/api/chat/sessions/{sid}")
    assert r2.status_code == 200
    data = r2.json()
    assert data["session"]["id"] == sid
    assert data["messages"] == []


async def test_get_session_not_found(client):
    r = await client.get("/api/chat/sessions/000000000000000000000000")
    assert r.status_code == 404


# ── delete session ────────────────────────────────────────────────────────────

async def test_delete_session(client):
    r = await client.post("/api/chat/sessions")
    sid = r.json()["id"]

    r2 = await client.delete(f"/api/chat/sessions/{sid}")
    assert r2.status_code == 200

    r3 = await client.get(f"/api/chat/sessions/{sid}")
    assert r3.status_code == 404


# ── send message ──────────────────────────────────────────────────────────────

async def test_send_message(client):
    r = await client.post("/api/chat/sessions")
    sid = r.json()["id"]

    llm_resp = MagicMock()
    llm_resp.choices = [MagicMock()]
    llm_resp.choices[0].message.content = "Hello! I can help you."
    llm_resp.choices[0].message.tool_calls = None

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner"):
        mock_llm.return_value = llm_resp
        r2 = await client.post(
            f"/api/chat/sessions/{sid}/messages",
            json={"content": "Hello!"},
        )

    assert r2.status_code == 200
    data = r2.json()
    assert data["role"] == "assistant"
    assert "Hello" in data["content"]


async def test_send_message_session_not_found(client):
    r = await client.post(
        "/api/chat/sessions/000000000000000000000000/messages",
        json={"content": "Hi"},
    )
    assert r.status_code == 404


async def test_session_persists_messages(client):
    r = await client.post("/api/chat/sessions")
    sid = r.json()["id"]

    llm_resp = MagicMock()
    llm_resp.choices = [MagicMock()]
    llm_resp.choices[0].message.content = "Reply"
    llm_resp.choices[0].message.tool_calls = None

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner"):
        mock_llm.return_value = llm_resp
        await client.post(f"/api/chat/sessions/{sid}/messages", json={"content": "Q"})

    r2 = await client.get(f"/api/chat/sessions/{sid}")
    messages = r2.json()["messages"]
    assert len(messages) == 2  # user + assistant
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
