import json
import os
from pydantic_settings import BaseSettings
from pydantic import Field


class SifterConfig(BaseSettings):
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "sifter"

    # AI Provider (via LiteLLM)
    llm_model: str = "openai/gpt-4o"
    llm_api_key: str = ""
    pipeline_model: str = "openai/gpt-4o-mini"

    # Sift defaults
    extraction_temperature: float = 0.2
    max_concurrent_extractions: int = 5

    # Auth — API key optional
    api_key: str = "sk-dev"  # Set SIFTER_API_KEY in production
    require_api_key: bool = False  # If True, requests without X-API-Key get 401

    # Google OAuth (optional — Google sign-in disabled when empty)
    google_client_id: str = ""

    # JWT (for frontend / cloud layer)
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expire_minutes: int = 60 * 24  # 24h

    # File storage
    upload_dir: str = "./uploads"
    storage_path: str = "./uploads"
    storage_backend: str = "filesystem"   # "filesystem" | "s3" | "gcs"
    max_file_size_mb: int = 50
    max_pdf_pages: int = 10                # reject PDFs with more pages; split to process

    # S3 storage (used when storage_backend="s3")
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_endpoint_url: str = ""             # empty = use AWS default; set for MinIO/R2

    # GCS storage (used when storage_backend="gcs")
    gcs_bucket: str = ""
    gcs_project: str = ""
    gcs_credentials_file: str = ""        # empty = use Application Default Credentials

    # Background workers
    max_workers: int = 4

    # Enterprise leads
    sales_email: str = ""  # if set, enterprise contact form sends a notification email

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://localhost:5173"])

    model_config = {"env_prefix": "SIFTER_"}


def _normalise_cors_env() -> None:
    """Ensure SIFTER_CORS_ORIGINS is a valid JSON array before pydantic-settings reads it.

    pydantic-settings v2 decodes complex fields (list[str]) via json.loads in its own
    source layer, before field validators run. A plain comma-separated string therefore
    raises SettingsError. We normalise the env var to a JSON array here, at import time.
    """
    raw = os.environ.get("SIFTER_CORS_ORIGINS")
    if raw is None:
        return
    try:
        json.loads(raw)  # already valid JSON — nothing to do
    except json.JSONDecodeError:
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        os.environ["SIFTER_CORS_ORIGINS"] = json.dumps(origins)


_normalise_cors_env()
config = SifterConfig()
