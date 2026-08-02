"""FastAPI application factory.

Optional: install with `pip install -e ".[api]"`. The core library and CLI do not
depend on FastAPI.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from foldq.api import errors
from foldq.api.routes import fold, meta, structures, system

DEFAULT_ORIGINS = ("http://localhost:3000",)


def allowed_origins() -> list[str]:
    """Browser origins permitted to call this API.

    Set `FOLDQ_ALLOWED_ORIGINS` to a comma-separated list when the frontend is
    deployed somewhere other than local development — without the deployed
    origin listed, the browser blocks every request and the site looks broken
    while the API itself is healthy.

    Deliberately not defaulted to "*". Nothing served here is private, but an
    explicit list keeps the deployment self-documenting and avoids a wildcard
    that would outlive the reason for it.
    """
    raw = os.environ.get("FOLDQ_ALLOWED_ORIGINS", "").strip()
    if not raw:
        return list(DEFAULT_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Decidion FoldQ API",
        version="0.1.0",
        description=(
            "Thin HTTP seam over the FoldQ pipeline. No authentication, no "
            "persistence: a fold is deterministic given sequence, solver and seed."
        ),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(fold.router, prefix="/api/v1")
    app.include_router(meta.router, prefix="/api/v1")
    app.include_router(structures.router, prefix="/api/v1")
    app.include_router(system.router, prefix="/api/v1")
    errors.install(app)
    return app


app = create_app()
