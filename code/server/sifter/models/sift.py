from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class SiftStatus(str, Enum):
    ACTIVE = "active"
    INDEXING = "indexing"
    PAUSED = "paused"
    ERROR = "error"


class Sift(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: str = ""
    instructions: str
    schema: Optional[str] = None
    schema_version: int = 1
    schema_fields: Optional[list[dict[str, Any]]] = None
    status: SiftStatus = SiftStatus.INDEXING
    error: Optional[str] = None
    processed_documents: int = 0
    total_documents: int = 0
    default_folder_id: Optional[str] = None
    multi_record: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "Sift":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)
