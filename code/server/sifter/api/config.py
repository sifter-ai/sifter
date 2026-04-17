from fastapi import APIRouter
from sifter.config import config

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config")
async def get_config():
    """Deployment configuration — no auth required.

    Returns the deployment mode so the frontend can adapt its UI.
    sifter-cloud overrides this endpoint to return {"mode": "cloud"}.
    """
    return {
        "mode": "oss",
        "googleAuthEnabled": bool(config.google_client_id),
        "googleClientId": config.google_client_id if config.google_client_id else None,
    }
