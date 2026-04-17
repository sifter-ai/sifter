import os
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .api import aggregations, auth, chat, config as config_api, dashboards, documents, enterprise, sifts, folders, keys, webhooks
from .config import config
from .db import close as close_db, get_db
from .limiter import limiter
from .services.aggregation_service import AggregationService
from .services.api_key_service import ApiKeyService
from .services.dashboard_service import DashboardService
from .services.document_processor import ensure_indexes as ensure_queue_indexes, start_workers
from .services.document_service import DocumentService
from .services.sift_service import SiftService
from .services.webhook_service import WebhookService

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
)

logger = structlog.get_logger()

_worker_tasks = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_tasks
    # Startup
    if config.api_key == "sk-dev":
        logger.warning(
            "using_default_api_key",
            message="SIFTER_API_KEY is not set. Using insecure default 'sk-dev'. Set SIFTER_API_KEY in production.",
        )

    logger.info("sifter_starting", mongodb_uri=config.mongodb_uri, model=config.llm_model)
    os.makedirs(config.upload_dir, exist_ok=True)
    os.makedirs(config.storage_path, exist_ok=True)

    db = get_db()
    app.state.db = db  # expose via request.app.state.db for cloud handlers
    await SiftService(db).ensure_indexes()
    await AggregationService(db).ensure_indexes()
    await ApiKeyService(db).ensure_indexes()
    await DocumentService(db).ensure_indexes()
    await WebhookService(db).ensure_indexes()
    await ensure_queue_indexes(db)
    await DashboardService(db).ensure_indexes()

    # Start background document processing workers
    _worker_tasks = start_workers(config.max_workers, db)

    # Mount MCP HTTP endpoint if sifter-mcp is installed
    try:
        from sifter_mcp.http_app import create_mcp_asgi_app
        app.mount("/mcp", create_mcp_asgi_app())
        logger.info("mcp_mounted", path="/mcp")
    except ImportError:
        pass

    # Mount frontend static files last, after all routers (including cloud overrides)
    # have been registered at import time. Mounting at module level would place the
    # catch-all StaticFiles before any routers added by cloud/main.py.
    frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

    logger.info("sifter_ready")

    yield

    # Shutdown
    for task in _worker_tasks:
        task.cancel()
    _worker_tasks = []
    await close_db()
    logger.info("sifter_shutdown")


app = FastAPI(
    title="Sifter",
    description="AI-powered document extraction engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_api.router)
app.include_router(auth.router)
app.include_router(keys.router)
app.include_router(sifts.router)
app.include_router(aggregations.router)
app.include_router(chat.router)
app.include_router(folders.router)
app.include_router(documents.router)
app.include_router(webhooks.router)
app.include_router(enterprise.router)
app.include_router(dashboards.router)


@app.get("/health")
async def health():
    db = get_db()
    components = {}

    try:
        await db.command("ping")
        components["database"] = "ok"
    except Exception as e:
        components["database"] = f"error: {str(e)}"

    try:
        pending = await db["processing_queue"].count_documents({"status": "pending"})
        processing = await db["processing_queue"].count_documents({"status": "processing"})
        components["queue"] = {"status": "ok", "pending": pending, "processing": processing}
    except Exception:
        components["queue"] = {"status": "error"}

    overall = "ok" if all(
        (v == "ok" if isinstance(v, str) else v.get("status") == "ok")
        for v in components.values()
    ) else "error"

    status_code = 200 if overall == "ok" else 503
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={"status": overall, "version": "0.1.0", "components": components}
    )


def run():
    uvicorn.run(
        "sifter.server:app",
        host=config.host,
        port=config.port,
        reload=True,
    )
