"""
Dev auth endpoints: register, login, me.

Provides minimal JWT auth for the frontend / local development.
The cloud layer replaces this with full org-aware auth via
dependency_overrides or by mounting its own router.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr

from sifter.auth import (
    Principal,
    create_access_token,
    get_current_principal,
    hash_password,
    verify_password,
)
from sifter.config import config
from sifter.db import get_db
from sifter.limiter import limiter
from sifter.storage import get_storage_backend

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---- Schemas ----

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: str
    auth_provider: str = "email"
    avatar_url: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


_AVATAR_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


def _user_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc.get("full_name", ""),
        created_at=doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else doc["created_at"],
        auth_provider=doc.get("auth_provider", "email"),
        avatar_url=doc.get("avatar_url"),
    )


# ---- Endpoints ----

@router.post("/register", response_model=AuthResponse)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db=Depends(get_db)):
    existing = await db["users"].find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    now = datetime.now(timezone.utc)
    result = await db["users"].insert_one({
        "email": req.email.lower(),
        "full_name": req.full_name,
        "hashed_password": hash_password(req.password),
        "created_at": now,
    })
    user_id = str(result.inserted_id)
    token = create_access_token(user_id)
    user_doc = await db["users"].find_one({"_id": result.inserted_id})
    return AuthResponse(access_token=token, user=_user_out(user_doc))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db=Depends(get_db)):
    doc = await db["users"].find_one({"email": req.email.lower()})
    if doc and doc.get("auth_provider") == "google" and not doc.get("hashed_password"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google sign-in. Please sign in with Google.",
        )
    if not doc or not verify_password(req.password, doc.get("hashed_password") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(str(doc["_id"]))
    return AuthResponse(access_token=token, user=_user_out(doc))


class GoogleAuthRequest(BaseModel):
    credential: str


@router.post("/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, req: GoogleAuthRequest, db=Depends(get_db)):
    if not config.google_client_id:
        raise HTTPException(status_code=404, detail="Google authentication is not configured")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        id_info = id_token.verify_oauth2_token(
            req.credential,
            google_requests.Request(),
            config.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )

    google_id = id_info["sub"]
    email = id_info["email"].lower()
    full_name = id_info.get("name", "")
    now = datetime.now(timezone.utc)

    doc = await db["users"].find_one({"google_id": google_id})
    if not doc:
        doc = await db["users"].find_one({"email": email})
        if doc:
            await db["users"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"google_id": google_id, "auth_provider": "google"}},
            )
            doc = await db["users"].find_one({"_id": doc["_id"]})
        else:
            result = await db["users"].insert_one({
                "email": email,
                "full_name": full_name,
                "hashed_password": None,
                "google_id": google_id,
                "auth_provider": "google",
                "created_at": now,
            })
            doc = await db["users"].find_one({"_id": result.inserted_id})

    token = create_access_token(str(doc["_id"]))
    return AuthResponse(access_token=token, user=_user_out(doc))


@router.get("/me", response_model=UserOut)
async def me(
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if principal.key_id in ("anonymous", "bootstrap"):
        raise HTTPException(status_code=401, detail="Not authenticated as a user")
    try:
        oid = ObjectId(principal.key_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    doc = await db["users"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return _user_out(doc)


@router.patch("/me", response_model=UserOut)
async def update_me(
    req: UpdateProfileRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if principal.key_id in ("anonymous", "bootstrap"):
        raise HTTPException(status_code=401, detail="Not authenticated as a user")
    try:
        oid = ObjectId(principal.key_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")

    updates: dict = {}
    if req.full_name is not None:
        updates["full_name"] = req.full_name
    if req.email is not None:
        doc = await db["users"].find_one({"_id": oid})
        if not doc:
            raise HTTPException(status_code=401, detail="User not found")
        if doc.get("auth_provider") == "google":
            raise HTTPException(status_code=400, detail="Email is managed by Google and cannot be changed here")
        new_email = req.email.lower()
        if new_email != doc["email"]:
            conflict = await db["users"].find_one({"email": new_email, "_id": {"$ne": oid}})
            if conflict:
                raise HTTPException(status_code=409, detail="Email already in use")
            updates["email"] = new_email

    if updates:
        await db["users"].update_one({"_id": oid}, {"$set": updates})
    doc = await db["users"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return _user_out(doc)


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if principal.key_id in ("anonymous", "bootstrap"):
        raise HTTPException(status_code=401, detail="Not authenticated as a user")
    try:
        oid = ObjectId(principal.key_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    doc = await db["users"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    if doc.get("auth_provider") == "google" and not doc.get("hashed_password"):
        raise HTTPException(status_code=400, detail="This account uses Google sign-in and has no password")
    if not verify_password(req.current_password, doc.get("hashed_password") or ""):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db["users"].update_one({"_id": oid}, {"$set": {"hashed_password": hash_password(req.new_password)}})
    return {"ok": True}


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if principal.key_id in ("anonymous", "bootstrap"):
        raise HTTPException(status_code=401, detail="Not authenticated as a user")
    try:
        oid = ObjectId(principal.key_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    if file.content_type not in _AVATAR_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Avatar must be JPEG, PNG, or WebP")
    data = await file.read()
    if len(data) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Avatar must be 2 MB or smaller")

    user_id = str(oid)
    storage = get_storage_backend()
    storage_path = await storage.save("_avatars", user_id, data)
    avatar_url = f"/api/auth/avatar/{user_id}"
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {
            "avatar_url": avatar_url,
            "avatar_storage_path": storage_path,
            "avatar_content_type": file.content_type,
        }},
    )
    doc = await db["users"].find_one({"_id": oid})
    return _user_out(doc)


@router.get("/avatar/{user_id}")
async def get_avatar(user_id: str, db=Depends(get_db)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db["users"].find_one({"_id": oid}, {"avatar_storage_path": 1, "avatar_content_type": 1, "avatar_url": 1})
    if not doc or not doc.get("avatar_storage_path"):
        raise HTTPException(status_code=404, detail="Avatar not set")
    storage = get_storage_backend()
    try:
        data = await storage.load(doc["avatar_storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Avatar not found")
    content_type = doc.get("avatar_content_type", "image/jpeg")
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=3600"})
