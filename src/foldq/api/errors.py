"""Typed API errors and structured request logging.

Two problems with the default FastAPI error shape for this API.

A client cannot branch on it. `{"detail": "..."}` carries a human sentence, so
telling "your sequence has a bad character" apart from "this instance is too big
for the exact gates" means matching on prose. A stable `code` makes that a
lookup, and `details` carries what the client needs to recover — for a
too-large instance, which solver to use instead.

And it discards the distinction this project exists to make. "Gates B and C are
indeterminate" is not an error at all; it is a result. So the codes below cover
genuine failures only, and anything that is a legitimate scientific outcome
travels in the normal response.

Log lines carry the fields a reviewer would need to reconstruct a run — run id,
stage, solver, duration, error code — as JSON, so they survive being grepped out
of a platform log viewer.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("foldq.api")


class ErrorCode(StrEnum):
    """Stable identifiers a client can branch on.

    Values are part of the API contract: renaming one is a breaking change, so
    they are spelled out rather than derived from exception class names.
    """

    INVALID_SEQUENCE = "INVALID_SEQUENCE"
    UNKNOWN_SOLVER = "UNKNOWN_SOLVER"
    SEQUENCE_TOO_LONG_FOR_SOLVER = "SEQUENCE_TOO_LONG_FOR_SOLVER"
    NO_CANDIDATE_STEMS = "NO_CANDIDATE_STEMS"
    NO_VALID_SAMPLES = "NO_VALID_SAMPLES"
    VIENNARNA_UNAVAILABLE = "VIENNARNA_UNAVAILABLE"
    STRUCTURE_SOURCE_UNAVAILABLE = "STRUCTURE_SOURCE_UNAVAILABLE"
    STRUCTURE_NOT_FOUND = "STRUCTURE_NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    trace_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class FoldQAPIError(Exception):
    """An error with a code a client can act on."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int = 422,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def install(app: FastAPI) -> None:
    """Attach the error handler and request logging."""

    @app.exception_handler(FoldQAPIError)
    async def _handle(request: Request, error: FoldQAPIError) -> JSONResponse:
        trace_id = getattr(request.state, "trace_id", f"trace_{uuid.uuid4().hex[:12]}")
        _log(
            "error",
            event="request_failed",
            trace_id=trace_id,
            path=request.url.path,
            error_code=error.code.value,
            message=error.message,
        )
        return JSONResponse(
            status_code=error.status_code,
            content=ErrorResponse(
                error=ErrorBody(
                    code=error.code,
                    message=error.message,
                    details=error.details,
                    trace_id=trace_id,
                )
            ).model_dump(mode="json"),
        )

    @app.middleware("http")
    async def _trace(request: Request, call_next):  # type: ignore[no-untyped-def]
        trace_id = f"trace_{uuid.uuid4().hex[:12]}"
        request.state.trace_id = trace_id
        started = time.perf_counter()
        response = await call_next(request)
        # Only the boundary is logged, not a line per stage: the pipeline is one
        # synchronous call, so per-stage timings would be invented rather than
        # measured, and the fold response already reports its own breakdown.
        _log(
            "info",
            event="request",
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        response.headers["x-trace-id"] = trace_id
        return response


def _log(level: str, **fields: Any) -> None:
    """One JSON object per line, so a platform log viewer keeps the structure."""
    payload = {"ts": time.time(), "level": level, **fields}
    getattr(logger, level)(json.dumps(payload, default=str))
