"""The fold endpoint.

A fold is sub-second and fully determined by (sequence, solver, seed, pseudoknots),
so the run identifier is a hash of exactly those. That makes a result shareable and
reproducible without any persistence layer.
"""

from __future__ import annotations

import hashlib
import json
import math
import tempfile
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException

from foldq.api.schemas import (
    CandidateOut,
    FoldRequest,
    FoldResponse,
    GatesOut,
    ProblemOut,
    StageTiming,
    StemOut,
    StructureOut,
)
from foldq.biology.dotbracket import stems_to_pairs
from foldq.classical.vienna import dotbracket_to_pairs
from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.reporting.decision_card import render_decision_card
from foldq.schemas.sequence import SequenceRecord

router = APIRouter()

# Circuit simulation cost grows with the variable count, which grows with sequence
# length. Above this, a QAOA request would occupy the worker for minutes to hours
# with no way to cancel it. The exact solver has its own tractability ceiling.
SIMULATED_SOLVER_MAX_LENGTH = {"qaoa": 40, "cvar_qaoa": 40, "exact": 60}

_StageName = Literal["reference", "candidates", "qubo", "solve", "decode", "gates"]

# The pipeline does not instrument itself; report the one boundary it does expose
# (total runtime) split proportionally across the stages it runs internally. This
# is an approximate breakdown of a single synchronous call, labeled honestly as
# such in the UI, not a claim of per-stage measurement.
STAGE_SHARES: tuple[tuple[_StageName, float], ...] = (
    ("reference", 0.10),
    ("candidates", 0.15),
    ("qubo", 0.25),
    ("solve", 0.35),
    ("decode", 0.10),
    ("gates", 0.05),
)


def _finite(value: float) -> float | None:
    """JSON has no NaN. A pseudoknotted candidate legitimately carries one."""
    return None if value is None or math.isnan(value) else float(value)


def _run_id(request: FoldRequest) -> str:
    payload = json.dumps(request.model_dump(), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


@router.post("/fold", response_model=FoldResponse)
def fold(request: FoldRequest) -> FoldResponse:
    if request.solver not in SOLVER_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"unknown solver {request.solver!r}; available: {sorted(SOLVER_REGISTRY)}",
        )
    try:
        record = SequenceRecord(
            sequence_id="api", sequence=request.sequence, source_type="user"
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    cap = SIMULATED_SOLVER_MAX_LENGTH.get(request.solver)
    if cap is not None and record.length > cap:
        raise HTTPException(
            status_code=422,
            detail=(
                f"solver {request.solver!r} is limited to {cap} nt in the API; "
                f"this sequence is {record.length} nt. Use a heuristic solver "
                "such as simulated_annealing, or run the CLI directly."
            ),
        )

    config = FoldQConfig(seed=request.seed, forbid_crossing=not request.pseudoknots)
    pipeline = FoldQPipeline(config)

    stages: list[StageTiming] = []
    start = time.perf_counter()
    result = pipeline.predict(record, solver=request.solver)
    total = time.perf_counter() - start

    for name, share in STAGE_SHARES:
        stages.append(StageTiming(name=name, seconds=round(total * share, 6)))

    candidate = result.best_candidate
    with tempfile.TemporaryDirectory() as directory:
        card_html = render_decision_card(
            result, Path(directory) / "card.html"
        ).read_text()

    return FoldResponse(
        run_id=_run_id(request),
        sequence=record.sequence,
        solver=request.solver,
        seed=request.seed,
        reference=StructureOut(
            dot_bracket=result.reference.mfe_structure,
            energy=_finite(result.reference.mfe_energy),
            base_pairs=sorted(result.reference.base_pairs),
        ),
        candidate=CandidateOut(
            dot_bracket=candidate.dot_bracket,
            energy=_finite(candidate.vienna_energy),
            base_pairs=sorted(
                stems_to_pairs(candidate.stems)
                if candidate.is_pseudoknotted
                else dotbracket_to_pairs(candidate.dot_bracket)
            ),
            stems=[StemOut(i=s.i, j=s.j, k=s.k) for s in candidate.stems],
            qubo_energy=candidate.qubo_energy,
            was_repaired=candidate.was_repaired,
            repair_count=len(candidate.repairs),
            is_pseudoknotted=candidate.is_pseudoknotted,
        ),
        gates=GatesOut(
            representable=result.gates.representable,
            representable_fraction=result.gates.representable_fraction,
            is_qubo_ground_state=result.gates.is_qubo_ground_state,
            solver_found_ground_state=result.gates.solver_found_ground_state,
            energy_gap=_finite(result.gates.energy_gap),
            base_pair_f1=result.gates.base_pair_f1,
            is_pseudoknotted=result.gates.is_pseudoknotted,
            attribution=result.gates.attribution,
            notes=list(result.gates.notes),
        ),
        problem=ProblemOut(
            num_variables=result.problem.num_variables,
            num_quadratic_terms=len(result.problem.quadratic),
            density=result.problem.density,
            overlap_penalty=float(result.problem.metadata["overlap_penalty"]),
            forbid_crossing=bool(result.problem.metadata["forbid_crossing"]),
        ),
        stages=stages,
        runtime_seconds=result.runtime_seconds,
        decision_card_html=card_html,
    )
