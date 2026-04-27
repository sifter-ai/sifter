"""Tests for pipeline_validator — pure functions, no mocks needed."""
import pytest
from fastapi import HTTPException
from sifter.services.pipeline_validator import cap_limit, validate_pipeline, _MAX_LIMIT


# ── cap_limit ─────────────────────────────────────────────────────────────────

def test_cap_limit_below_max():
    assert cap_limit(100) == 100

def test_cap_limit_at_max():
    assert cap_limit(_MAX_LIMIT) == _MAX_LIMIT

def test_cap_limit_above_max():
    assert cap_limit(_MAX_LIMIT + 1) == _MAX_LIMIT

def test_cap_limit_zero():
    assert cap_limit(0) == 0


# ── validate_pipeline — valid ─────────────────────────────────────────────────

def test_validate_empty_pipeline():
    result = validate_pipeline([])
    assert result == []

def test_validate_single_group():
    pipeline = [{"$group": {"_id": "$client", "total": {"$sum": "$amount"}}}]
    assert validate_pipeline(pipeline) == pipeline

def test_validate_multiple_allowed_stages():
    pipeline = [
        {"$match": {"amount": {"$gt": 0}}},
        {"$group": {"_id": "$client", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    assert validate_pipeline(pipeline) == pipeline

def test_validate_all_allowed_stages():
    for stage in ("$group", "$sort", "$project", "$match", "$unwind", "$limit", "$skip", "$count"):
        validate_pipeline([{stage: {}}])


# ── validate_pipeline — errors ────────────────────────────────────────────────

def test_validate_not_a_list():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline({"$group": {}})
    assert exc.value.status_code == 400
    assert "list" in exc.value.detail

def test_validate_stage_not_a_dict():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline(["not_a_dict"])
    assert exc.value.status_code == 400

def test_validate_stage_multi_key():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline([{"$group": {}, "$sort": {}}])
    assert exc.value.status_code == 400

def test_validate_rejected_stage_lookup():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline([{"$lookup": {}}])
    assert exc.value.status_code == 400
    assert "$lookup" in exc.value.detail

def test_validate_rejected_stage_out():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline([{"$out": "collection"}])
    assert exc.value.status_code == 400

def test_validate_rejected_stage_merge():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline([{"$merge": {}}])
    assert exc.value.status_code == 400

def test_validate_unknown_stage():
    with pytest.raises(HTTPException) as exc:
        validate_pipeline([{"$bucket": {}}])
    assert exc.value.status_code == 400
    assert "unknown" in exc.value.detail.lower()
