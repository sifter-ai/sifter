from fastapi import HTTPException

_ALLOWED_STAGES = {"$group", "$sort", "$project", "$match", "$unwind", "$limit", "$skip", "$count"}
_REJECTED_STAGES = {"$lookup", "$out", "$merge", "$expr", "$unionWith", "$graphLookup"}
_MAX_LIMIT = 10_000


def validate_pipeline(pipeline: list[dict]) -> list[dict]:
    if not isinstance(pipeline, list):
        raise HTTPException(status_code=400, detail="pipeline must be a list")
    for stage in pipeline:
        if not isinstance(stage, dict) or len(stage) != 1:
            raise HTTPException(status_code=400, detail=f"each pipeline stage must be a single-key dict, got {stage!r}")
        key = next(iter(stage))
        if key in _REJECTED_STAGES:
            raise HTTPException(status_code=400, detail=f"pipeline stage '{key}' is not allowed")
        if key not in _ALLOWED_STAGES:
            raise HTTPException(status_code=400, detail=f"unknown pipeline stage '{key}'")
    return pipeline


def cap_limit(limit: int) -> int:
    return min(limit, _MAX_LIMIT)
