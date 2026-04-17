from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class AggregationStatus(str, Enum):
    GENERATING = "generating"
    READY = "ready"
    ERROR = "error"
    # Keep "active" as alias for backward compat
    ACTIVE = "active"


class Aggregation(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: str = ""
    sift_id: str
    aggregation_query: str
    pipeline: Optional[list[Any]] = None
    aggregation_error: Optional[str] = None
    status: AggregationStatus = AggregationStatus.GENERATING
    last_run_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "Aggregation":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        # Migrate old "active" status to "ready"
        if doc.get("status") == "active":
            doc["status"] = "ready"
        # Migrate old extraction_id field
        if "extraction_id" in doc and "sift_id" not in doc:
            doc["sift_id"] = doc.pop("extraction_id")
        return cls(**doc)
