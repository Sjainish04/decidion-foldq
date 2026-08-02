"""Structure discovery endpoints.

Errors from RCSB are surfaced as 503 rather than 500: the service is a dependency
we do not control, and the frontend distinguishes "RCSB is unavailable" from "this
app is broken".
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from foldq.api.errors import ErrorCode, FoldQAPIError
from foldq.api.rcsb import (
    StructureSummary,
    fetch_entries,
    rank_structures,
    search_rna_structures,
)

router = APIRouter()


class StructureOut(BaseModel):
    pdb_id: str
    title: str
    method: str
    resolution: float | None
    rna_length: int | None
    rna_sequence: str | None
    ligands: list[str]
    organisms: list[str]
    released: str
    retrieved: str


class StructureSearchResponse(BaseModel):
    structures: list[StructureOut]
    query: str
    max_resolution: float


def _to_out(summary: StructureSummary) -> StructureOut:
    return StructureOut(
        pdb_id=summary.pdb_id,
        title=summary.title,
        method=summary.method,
        resolution=summary.resolution,
        rna_length=summary.primary_rna_length,
        rna_sequence=summary.primary_rna_sequence,
        ligands=list(summary.ligands),
        organisms=list(summary.organisms),
        released=summary.released,
        retrieved=summary.retrieved,
    )


@router.get("/structures/search", response_model=StructureSearchResponse)
def search(
    text: str = Query("", max_length=100),
    max_resolution: float = Query(3.0, gt=0, le=20),
    limit: int = Query(25, ge=1, le=50),
) -> StructureSearchResponse:
    try:
        ids = search_rna_structures(max_resolution=max_resolution, limit=limit, text=text)
        entries = fetch_entries(ids)
    except httpx.HTTPError as error:
        raise FoldQAPIError(
            ErrorCode.STRUCTURE_SOURCE_UNAVAILABLE,
            f"RCSB PDB is unavailable: {error}",
            status_code=503,
            details={"upstream": "rcsb.org", "affects": "structure views only"},
        ) from error
    return StructureSearchResponse(
        structures=[_to_out(entry) for entry in rank_structures(list(entries))],
        query=text,
        max_resolution=max_resolution,
    )


@router.get("/structures/{pdb_id}", response_model=StructureOut)
def entry(pdb_id: str) -> StructureOut:
    try:
        entries = fetch_entries((pdb_id.upper(),))
    except httpx.HTTPError as error:
        raise FoldQAPIError(
            ErrorCode.STRUCTURE_SOURCE_UNAVAILABLE,
            f"RCSB PDB is unavailable: {error}",
            status_code=503,
            details={"upstream": "rcsb.org", "affects": "structure views only"},
        ) from error
    if not entries:
        raise FoldQAPIError(
            ErrorCode.STRUCTURE_NOT_FOUND,
            f"no PDB entry {pdb_id!r}",
            status_code=404,
            details={"pdb_id": pdb_id},
        )
    return _to_out(entries[0])
