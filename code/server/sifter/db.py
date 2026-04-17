from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import config

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(config.mongodb_uri)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[config.mongodb_database]


async def close():
    global _client
    if _client:
        _client.close()
        _client = None
