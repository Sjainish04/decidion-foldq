"""Health, capability and preflight endpoints.

Three questions a client needs answered before it can behave sensibly, and none
of which `/meta` alone answers:

- `/health` — is this instance serving? Cheap, dependency-free, safe to poll.
- `/capabilities` — what can this *particular* deployment do? A size-constrained
  host installs without the quantum extra, so the solver list is a property of
  the deployment rather than of the codebase.
- `/preflight` — what will this specific request cost before it is run? A fold is
  usually milliseconds, but variable count grows with sequence length and the
  circuit solvers are exponential in it. Preflight lets a UI warn instead of
  letting a request occupy a worker until it times out.
"""

from __future__ import annotations

import importlib.util
import platform
import time

from fastapi import APIRouter
from pydantic import BaseModel, Field

import foldq
from foldq.api.routes.fold import SIMULATED_SOLVER_MAX_LENGTH
from foldq.biology.stems import generate_maximal_stems
from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY
from foldq.schemas.sequence import SequenceRecord

router = APIRouter()

_STARTED = time.time()


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float


class SolverCapability(BaseModel):
    name: str
    kind: str
    max_sequence_length: int | None = Field(
        default=None,
        description="Length cap enforced by this API, or null when unrestricted.",
    )


class CapabilitiesResponse(BaseModel):
    solvers: list[SolverCapability]
    quantum_extra_installed: bool
    structures_enabled: bool
    max_sequence_length: int
    exact_max_variables: int
    python_version: str
    foldq_version: str


class PreflightRequest(BaseModel):
    sequence: str = Field(min_length=1, max_length=200)
    solver: str = "simulated_annealing"


class PreflightResponse(BaseModel):
    sequence_length: int
    candidate_stems: int
    estimated_variables: int
    exact_gates_available: bool
    solver_available: bool
    within_limits: bool
    warnings: list[str]


# Which family a solver belongs to, so a client can group them without hardcoding
# names. `exact` is the reference the gates are scored against, not a competitor.
SOLVER_KIND = {
    "exact": "reference",
    "random": "baseline",
    "greedy": "baseline",
    "local_search": "classical",
    "tabu": "classical",
    "simulated_annealing": "quantum-inspired",
    "path_integral_sqa": "quantum-inspired",
    "qaoa": "gate-based",
    "cvar_qaoa": "gate-based",
}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness only. Touches no dependency, so a slow RCSB or a cold ViennaRNA
    import cannot make a healthy instance look down."""
    return HealthResponse(
        status="ok",
        version=foldq.__version__,
        uptime_seconds=round(time.time() - _STARTED, 3),
    )


@router.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> CapabilitiesResponse:
    config = FoldQConfig()
    quantum = all(
        importlib.util.find_spec(module) is not None for module in ("qiskit", "qiskit_aer")
    )
    return CapabilitiesResponse(
        solvers=[
            SolverCapability(
                name=name,
                kind=SOLVER_KIND.get(name, "unknown"),
                max_sequence_length=SIMULATED_SOLVER_MAX_LENGTH.get(name),
            )
            for name in sorted(SOLVER_REGISTRY)
        ],
        quantum_extra_installed=quantum,
        structures_enabled=importlib.util.find_spec("httpx") is not None,
        max_sequence_length=200,
        exact_max_variables=config.exact_max_variables,
        python_version=platform.python_version(),
        foldq_version=foldq.__version__,
    )


@router.post("/preflight", response_model=PreflightResponse)
def preflight(request: PreflightRequest) -> PreflightResponse:
    """Estimate a fold's size without running it.

    Returns 200 with warnings rather than an error: a client asking what
    something costs has not done anything wrong, and the answer "this is too big"
    is information, not a failure.
    """
    warnings: list[str] = []

    try:
        record = SequenceRecord(
            sequence_id="preflight", sequence=request.sequence, source_type="user"
        )
    except ValueError as error:
        return PreflightResponse(
            sequence_length=len(request.sequence),
            candidate_stems=0,
            estimated_variables=0,
            exact_gates_available=False,
            solver_available=request.solver in SOLVER_REGISTRY,
            within_limits=False,
            warnings=[str(error)],
        )

    config = FoldQConfig()
    stems = generate_maximal_stems(
        record.sequence,
        min_stem_length=config.min_stem_length,
        min_hairpin=config.min_hairpin,
        allow_wobble=config.allow_wobble,
    )
    variables = len(stems)

    solver_available = request.solver in SOLVER_REGISTRY
    if not solver_available:
        warnings.append(
            f"solver {request.solver!r} is not available on this deployment; "
            f"available: {sorted(SOLVER_REGISTRY)}"
        )

    cap = SIMULATED_SOLVER_MAX_LENGTH.get(request.solver)
    within = solver_available and (cap is None or record.length <= cap)
    if cap is not None and record.length > cap:
        warnings.append(
            f"solver {request.solver!r} is capped at {cap} nt in this API; "
            f"this sequence is {record.length} nt"
        )

    exact_available = variables <= config.exact_max_variables
    if not exact_available:
        warnings.append(
            f"{variables} variables exceeds the exact solver's "
            f"{config.exact_max_variables}-variable ceiling, so Gates B and C will be "
            "reported as indeterminate rather than passed or failed"
        )

    if variables == 0:
        warnings.append("no candidate stems: this sequence has no foldable helices")

    return PreflightResponse(
        sequence_length=record.length,
        candidate_stems=len(stems),
        estimated_variables=variables,
        exact_gates_available=exact_available,
        solver_available=solver_available,
        within_limits=within,
        warnings=warnings,
    )
