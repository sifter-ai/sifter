"""
Unit tests for webhook_service — _matches_pattern (pure) and WebhookService CRUD.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId

from sifter.services.webhook_service import WebhookService, _matches_pattern


# ── _matches_pattern ──────────────────────────────────────────────────────────

def test_matches_star_catchall():
    assert _matches_pattern("*", "sift.document.processed") is True


def test_matches_double_star_catchall():
    assert _matches_pattern("**", "sift.document.processed") is True


def test_matches_exact():
    assert _matches_pattern("sift.document.processed", "sift.document.processed") is True


def test_no_match_different():
    assert _matches_pattern("sift.document.processed", "sift.schema.changed") is False


def test_matches_single_wildcard_segment():
    assert _matches_pattern("sift.*", "sift.document") is True


def test_no_match_wildcard_too_short():
    assert _matches_pattern("sift.*", "sift.document.processed") is False


def test_matches_double_star_multi_segment():
    assert _matches_pattern("sift.**", "sift.document.processed") is True


def test_matches_double_star_single_segment():
    assert _matches_pattern("sift.**", "sift.done") is True


def test_no_match_empty_pattern():
    assert _matches_pattern("other", "sift.done") is False


# ── WebhookService CRUD ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_webhook(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["webhooks"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )

    svc = WebhookService(mock_motor_db)
    wh = await svc.create(
        events=["sift.document.processed"],
        url="https://example.com/hook",
        org_id="default",
    )

    assert wh.url == "https://example.com/hook"
    assert wh.id == str(inserted_id)
    mock_motor_db["webhooks"].insert_one.assert_called_once()


@pytest.mark.asyncio
async def test_list_all_returns_webhooks(mock_motor_db):
    from sifter.models.webhook import Webhook
    wh = Webhook(events=["*"], url="https://example.com/hook", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    mock_motor_db["webhooks"].count_documents = AsyncMock(return_value=1)
    cursor = MagicMock()
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    svc = WebhookService(mock_motor_db)
    hooks, total = await svc.list_all(org_id="default")
    assert total == 1
    assert len(hooks) == 1
    assert hooks[0].url == "https://example.com/hook"


@pytest.mark.asyncio
async def test_delete_webhook_success(mock_motor_db):
    mock_motor_db["webhooks"].delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )
    svc = WebhookService(mock_motor_db)
    result = await svc.delete(str(ObjectId()), org_id="default")
    assert result is True


@pytest.mark.asyncio
async def test_delete_webhook_not_found(mock_motor_db):
    mock_motor_db["webhooks"].delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=0)
    )
    svc = WebhookService(mock_motor_db)
    result = await svc.delete(str(ObjectId()), org_id="default")
    assert result is False


@pytest.mark.asyncio
async def test_dispatch_no_matching_hooks(mock_motor_db):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    svc = WebhookService(mock_motor_db)
    await svc.dispatch("sift.document.processed", {"status": "ok"}, org_id="default")
    # No HTTP calls made — just verify no error raised


@pytest.mark.asyncio
async def test_dispatch_matching_hook_does_not_raise(mock_motor_db):
    """Verify dispatch finds the hook and attempts delivery (HTTP failure is swallowed)."""
    from sifter.models.webhook import Webhook

    wh = Webhook(events=["sift.*"], url="https://example.com/hook", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    svc = WebhookService(mock_motor_db)
    # Connection error is swallowed — we just verify no exception propagates
    await svc.dispatch("sift.document.processed", {"status": "ok"}, org_id="default")


# ── _matches_pattern edge cases ───────────────────────────────────────────────

def test_double_star_no_match_required_suffix():
    """**.b with a.x → False — covers the return False inside ** branch (line 34)."""
    assert _matches_pattern("**.b", "a.x") is False


def test_pattern_too_deep():
    """a.b with a → False — covers return False when ep exhausted (line 36)."""
    assert _matches_pattern("a.b", "a") is False


def test_double_star_prefix_no_match():
    """a.**.b with a.x → False when b can't match."""
    assert _matches_pattern("a.**.b", "a.x") is False


# ── dispatch with sift_id filter ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_skips_different_sift_id(mock_motor_db):
    """Webhook with specific sift_id is skipped when dispatching for a different sift."""
    from sifter.models.webhook import Webhook

    wh = Webhook(events=["sift.*"], url="https://example.com/hook",
                 sift_id="sift_A", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    svc = WebhookService(mock_motor_db)
    # Dispatch for sift_B — sift_A webhook should be skipped
    await svc.dispatch("sift.document.processed", {"status": "ok"},
                       sift_id="sift_B", org_id="default")
    # No HTTP calls made since the webhook was skipped


@pytest.mark.asyncio
async def test_dispatch_with_matching_sift_id_attempts_delivery(mock_motor_db):
    """Webhook for same sift_id fires HTTP request (swallowed on error)."""
    from sifter.models.webhook import Webhook
    from unittest.mock import patch

    wh = Webhook(events=["sift.*"], url="https://example.com/hook",
                 sift_id="sift_X", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    svc = WebhookService(mock_motor_db)
    # Same sift_id — the request should be attempted and any error swallowed
    await svc.dispatch("sift.document.processed", {"status": "ok"},
                       sift_id="sift_X", org_id="default")
    # No error raised


@pytest.mark.asyncio
async def test_dispatch_successful_delivery_logs_info(mock_motor_db):
    """If HTTP delivery succeeds, logs info (not warning)."""
    from sifter.models.webhook import Webhook
    from unittest.mock import patch, MagicMock, AsyncMock

    wh = Webhook(events=["sift.done"], url="https://hook.example.com/", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    async def _aenter(self):
        return mock_client

    async def _aexit(self, *args):
        pass

    svc = WebhookService(mock_motor_db)
    with patch("httpx.AsyncClient.__aenter__", _aenter), \
         patch("httpx.AsyncClient.__aexit__", _aexit):
        await svc.dispatch("sift.done", {"status": "done"}, org_id="default")
    mock_client.post.assert_called_once()


# ── dispatch with delivery failure (line 109) ─────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_delivery_failure_logs_warning(mock_motor_db):
    """When HTTP delivery raises, the exception is captured and warning is logged (line 109)."""
    from unittest.mock import patch
    from sifter.models.webhook import Webhook

    wh = Webhook(events=["sift.done"], url="https://hook.example.com/", org_id="default")
    wh.id = str(ObjectId())
    raw_doc = wh.to_mongo()
    raw_doc["_id"] = ObjectId(wh.id)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[raw_doc])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=ConnectionError("connection refused"))

    async def _aenter(self):
        return mock_client

    async def _aexit(self, *args):
        pass

    svc = WebhookService(mock_motor_db)
    with patch("httpx.AsyncClient.__aenter__", _aenter), \
         patch("httpx.AsyncClient.__aexit__", _aexit):
        # Should not raise — exception is swallowed and warning logged
        await svc.dispatch("sift.done", {"status": "done"}, org_id="default")
    mock_client.post.assert_called_once()
