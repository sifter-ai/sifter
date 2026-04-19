"""
API key management service. No users, no orgs — single-tenant.
"""
import hashlib
import secrets
from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.user import APIKey


def _generate_api_key() -> tuple[str, str, str]:
    """
    Returns (plaintext_key, key_hash, key_prefix).
    plaintext_key = "sk-" + URL-safe random string
    """
    random_part = secrets.token_urlsafe(36)
    plaintext = f"sk-{random_part}"
    key_hash = hashlib.sha256(random_part.encode()).hexdigest()
    key_prefix = plaintext[:12]
    return plaintext, key_hash, key_prefix


class ApiKeyService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def ensure_indexes(self):
        # Drop and recreate if options changed (e.g. unique flag added)
        try:
            await self.db["api_keys"].create_index("key_hash", unique=True, sparse=True)
        except Exception:
            await self.db["api_keys"].drop_index("key_hash_1")
            await self.db["api_keys"].create_index("key_hash", unique=True, sparse=True)
        await self.db["api_keys"].create_index("is_active")

    async def create_api_key(self, name: str, org_id: str = "default") -> tuple[APIKey, str]:
        """Create a new API key. Returns (APIKey metadata, plaintext_key)."""
        plaintext, key_hash, key_prefix = _generate_api_key()
        api_key = APIKey(
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            org_id=org_id,
        )
        result = await self.db["api_keys"].insert_one(api_key.to_mongo())
        api_key.id = str(result.inserted_id)
        return api_key, plaintext

    async def list_api_keys(self, org_id: str = "default") -> list[APIKey]:
        docs = await self.db["api_keys"].find({"is_active": True, "org_id": org_id}).to_list(length=200)
        return [APIKey.from_mongo(d) for d in docs]

    async def revoke_api_key(self, key_id: str, org_id: str = "default") -> bool:
        result = await self.db["api_keys"].update_one(
            {"_id": ObjectId(key_id), "org_id": org_id},
            {"$set": {"is_active": False}},
        )
        return result.modified_count > 0
