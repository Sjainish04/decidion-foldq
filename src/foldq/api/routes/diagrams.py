"""Template-based secondary-structure diagrams, via EMBL-EBI's R2DT.

Exposed as three endpoints — submit, status, result — mirroring R2DT's own job
model rather than hiding it behind one blocking call. A job takes tens of
seconds; holding a serverless function open for that long wastes the function's
budget and gives the user a spinner with no progress, whereas polling lets the
frontend say which stage it is in.

Why this exists alongside the project's own layouts: FoldQ draws a structure from
the structure alone, so a tRNA comes out in whatever shape the layout algorithm
produces. R2DT matches against curated templates, so the same tRNA comes out as
the cloverleaf a biologist recognises. The two answer different questions and are
presented side by side, never merged.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from foldq.api import r2dt
from foldq.api.errors import ErrorCode, FoldQAPIError
from foldq.schemas.sequence import SequenceRecord

router = APIRouter()

# R2DT is a free shared service run by EMBL-EBI. This cap keeps a bad request
# from turning into an expensive job on someone else's infrastructure; it is well
# above anything this project folds.
MAX_LENGTH = 1000


class DiagramRequest(BaseModel):
    sequence: str = Field(..., description="RNA sequence, A/C/G/U.")


class DiagramJob(BaseModel):
    job_id: str
    state: str


class DiagramResult(BaseModel):
    job_id: str
    state: str
    svg: str | None = None
    template: str | None = None
    template_source: str | None = None
    #: False when R2DT found no matching template and fell back to a computed
    #: layout. The diagram is still valid; it just carries no family convention.
    templated: bool = False


def _unavailable(error: Exception) -> FoldQAPIError:
    """R2DT being down is a 503, not a 500 — this app is fine."""
    return FoldQAPIError(
        ErrorCode.STRUCTURE_SOURCE_UNAVAILABLE,
        f"R2DT is unavailable: {error}",
        status_code=503,
    )


@router.post("/diagrams/r2dt", response_model=DiagramJob)
def submit(request: DiagramRequest) -> DiagramJob:
    try:
        record = SequenceRecord(sequence_id="api", sequence=request.sequence, source_type="user")
    except ValueError as error:
        raise FoldQAPIError(
            ErrorCode.INVALID_SEQUENCE, str(error), details={"sequence": request.sequence[:60]}
        ) from error

    if record.length > MAX_LENGTH:
        raise FoldQAPIError(
            ErrorCode.SEQUENCE_TOO_LONG_FOR_SOLVER,
            f"R2DT requests here are limited to {MAX_LENGTH} nt; this sequence is {record.length}",
            details={"sequence_length": record.length, "maximum_length": MAX_LENGTH},
        )

    try:
        job_id = r2dt.submit(record.sequence)
    except httpx.HTTPError as error:
        raise _unavailable(error) from error

    return DiagramJob(job_id=job_id, state="RUNNING")


@router.get("/diagrams/r2dt/{job_id}", response_model=DiagramResult)
def result(job_id: str) -> DiagramResult:
    """Report the job's state, and its diagram once there is one."""
    try:
        state = r2dt.status(job_id)
    except httpx.HTTPError as error:
        raise _unavailable(error) from error

    if state != "FINISHED":
        if state in {"ERROR", "FAILURE", "NOT_FOUND"}:
            raise FoldQAPIError(
                ErrorCode.STRUCTURE_NOT_FOUND,
                f"R2DT could not draw this sequence (job state {state})",
                status_code=404,
                details={"job_id": job_id, "state": state},
            )
        return DiagramResult(job_id=job_id, state=state)

    try:
        diagram = r2dt.fetch(job_id)
    except httpx.HTTPError as error:
        raise _unavailable(error) from error

    return DiagramResult(
        job_id=job_id,
        state=state,
        svg=diagram.svg,
        template=diagram.template,
        template_source=diagram.source,
        templated=diagram.matched_a_template,
    )
