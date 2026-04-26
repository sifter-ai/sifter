import json
import os
from pydantic_settings import BaseSettings
from pydantic import Field


class SifterConfig(BaseSettings):
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "sifter"

    # AI Provider (via LiteLLM)
    # `default_model` is the fallback when a task-specific model is not set.
    # `default_api_key` / `default_base_url` are the fallbacks when a task-specific
    # api_key / base_url is not set.
    default_model: str = "vertex_ai/gemini-2.5-flash"
    default_api_key: str = ""
    default_base_url: str = ""   # e.g. https://api.fireworks.ai/inference/v1

    # Per-task overrides. Empty string ⇒ fall back to the corresponding default_*.
    extractor_model: str = ""        # extraction (PDFs/images → structured data)
    extractor_api_key: str = ""
    extractor_base_url: str = ""

    pipeline_model: str = ""         # NL query → MongoDB aggregation pipeline
    pipeline_api_key: str = ""
    pipeline_base_url: str = ""

    chat_model: str = ""             # conversational Q&A agent
    chat_api_key: str = ""
    chat_base_url: str = ""

    dashboard_model: str = ""        # dashboard widget-generation agent
    dashboard_api_key: str = ""
    dashboard_base_url: str = ""

    def model_post_init(self, __context) -> None:
        # Resolve empty task models to the default, so call sites can just read them.
        for name in ("extractor_model", "pipeline_model", "chat_model", "dashboard_model"):
            if not getattr(self, name):
                object.__setattr__(self, name, self.default_model)

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
    app_url: str = "http://localhost:3000"

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

    # SMTP (optional — email sending disabled when smtp_host is empty)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@localhost"
    smtp_tls: bool = True  # STARTTLS; set False for plain or SSL-only on port 465

    # Enterprise leads
    sales_email: str = ""  # if set, enterprise contact form sends a notification email

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://localhost:5173", "http://localhost:6274"])

    # Debug
    debug_llm: bool = False  # set SIFTER_DEBUG_LLM=true to log full LLM exchanges

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


_NATIVE_CREDENTIAL_PREFIXES = ("vertex_ai/", "gemini/", "bedrock/", "sagemaker/")


def _uses_native_credentials(model: str) -> bool:
    return any(model.startswith(p) for p in _NATIVE_CREDENTIAL_PREFIXES)


def api_kwargs_for(task: str) -> dict:
    """Return api_key / api_base kwargs for litellm for the given task.

    Resolves: task-specific value → default value → omit (native credentials).
    Tasks: extractor, pipeline, chat, dashboard.
    """
    model: str = getattr(config, f"{task}_model")
    if _uses_native_credentials(model):
        return {}
    api_key = getattr(config, f"{task}_api_key") or config.default_api_key or None
    base_url = getattr(config, f"{task}_base_url") or config.default_base_url or None
    return {k: v for k, v in {"api_key": api_key, "api_base": base_url}.items() if v is not None}


_normalise_cors_env()
config = SifterConfig()
