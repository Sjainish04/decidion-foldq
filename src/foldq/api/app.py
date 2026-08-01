"""FastAPI application factory.

Optional: install with `pip install -e ".[api]"`. The core library and CLI do not
depend on FastAPI.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from foldq.api.routes import fold, meta


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
        allow_origins=["http://localhost:3000"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(fold.router, prefix="/api/v1")
    app.include_router(meta.router, prefix="/api/v1")
    return app


app = create_app()
