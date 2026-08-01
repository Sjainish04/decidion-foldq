"""Response models for the HTTP API.

These mirror the pipeline's dataclasses rather than re-deriving anything, so a
change to the science layer surfaces here as a type error rather than as a
silently wrong payload.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FoldRequest(BaseModel):
    sequence: str = Field(min_length=1, max_length=200)
    solver: str = "simulated_annealing"
    seed: int = 42
    pseudoknots: bool = False


class StageTiming(BaseModel):
    name: Literal["reference", "candidates", "qubo", "solve", "decode", "gates"]
    seconds: float


class StemOut(BaseModel):
    i: int
    j: int
    k: int


class StructureOut(BaseModel):
    dot_bracket: str
    energy: float | None
    base_pairs: list[tuple[int, int]]


class CandidateOut(BaseModel):
    dot_bracket: str
    energy: float | None
    base_pairs: list[tuple[int, int]]
    stems: list[StemOut]
    qubo_energy: float
    was_repaired: bool
    repair_count: int
    is_pseudoknotted: bool


class GatesOut(BaseModel):
    representable: bool
    representable_fraction: float
    is_qubo_ground_state: bool | None
    solver_found_ground_state: bool | None
    energy_gap: float | None
    base_pair_f1: float
    is_pseudoknotted: bool
    attribution: str
    notes: list[str]


class ProblemOut(BaseModel):
    num_variables: int
    num_quadratic_terms: int
    density: float
    overlap_penalty: float
    forbid_crossing: bool


class FoldResponse(BaseModel):
    run_id: str
    sequence: str
    solver: str
    seed: int
    reference: StructureOut
    candidate: CandidateOut
    gates: GatesOut
    problem: ProblemOut
    stages: list[StageTiming]
    runtime_seconds: float
    decision_card_html: str


class MetaResponse(BaseModel):
    versions: dict[str, str]
    solvers: list[str]
    commit: str | None
