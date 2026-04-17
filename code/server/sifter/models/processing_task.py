from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class ProcessingTask(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    document_id: str
    sift_id: str
    storage_path: str
    status: str = "pending"   # pending | processing | done | error
    attempts: int = 0
    max_attempts: int = 3
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d
