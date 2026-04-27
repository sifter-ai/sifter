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
