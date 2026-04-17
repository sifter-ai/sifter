from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..services.api_key_service import ApiKeyService

router = APIRouter(prefix="/api/keys", tags=["keys"])


class CreateKeyRequest(BaseModel):
    name: str


def _key_dict(key) -> dict:
    return {
        "id": key.id,
        "name": key.name,
        "key_prefix": key.key_prefix,
        "created_at": key.created_at.isoformat(),
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "is_active": key.is_active,
    }


@router.get("")
async def list_keys(
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = ApiKeyService(db)
    keys = await svc.list_api_keys()
    return [_key_dict(k) for k in keys]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_key(
    body: CreateKeyRequest,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = ApiKeyService(db)
    key, plaintext = await svc.create_api_key(body.name)
    return {"key": _key_dict(key), "plaintext": plaintext}


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(
    key_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = ApiKeyService(db)
    ok = await svc.revoke_api_key(key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Key not found")
