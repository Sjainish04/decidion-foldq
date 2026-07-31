"""End-to-end orchestration: sequence in, gated result out."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

from foldq.biology.stems import expand_substems, generate_maximal_stems
from foldq.classical.vienna import ViennaBackend, ViennaReference
from foldq.config import FoldQConfig
from foldq.decoding.decode import decode_sample
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.gates import evaluate_gates
from foldq.schemas.gates import GateReport
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.result import FoldCandidate, SolverResult
from foldq.schemas.sequence import SequenceRecord
from foldq.solvers.annealing import PathIntegralSolver, SimulatedAnnealingSolver, TabuSolver
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.baselines import GreedySolver, LocalSearchSolver, RandomSolver
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge

SOLVER_REGISTRY: dict[str, Callable[[], FoldSolver]] = {
    "exact": ExactSolver,
    "random": RandomSolver,
    "greedy": GreedySolver,
    "local_search": LocalSearchSolver,
    "simulated_annealing": SimulatedAnnealingSolver,
    "tabu": TabuSolver,
    "path_integral_sqa": PathIntegralSolver,
}


def _register_quantum_solvers() -> None:
    """QAOA needs the optional quantum extra; register it only if importable."""
    try:
        from foldq.solvers.qaoa import QAOASolver
    except ImportError:
        return
    SOLVER_REGISTRY["qaoa"] = QAOASolver
    SOLVER_REGISTRY["cvar_qaoa"] = lambda: QAOASolver(objective="cvar")


_register_quantum_solvers()


@dataclass(frozen=True)
class PipelineResult:
    """Everything one prediction produced."""

    record: SequenceRecord
    reference: ViennaReference
    problem: QuboProblem
    solver_result: SolverResult
    best_candidate: FoldCandidate
    gates: GateReport
    runtime_seconds: float
    metadata: dict[str, Any]


class FoldQPipeline:
    """Wires the stages together without letting any solver take a shortcut."""

    def __init__(self, config: FoldQConfig | None = None) -> None:
        self.config = config or FoldQConfig()
        self.backend = ViennaBackend(
            temperature_celsius=self.config.temperature_celsius,
            no_lonely_pairs=self.config.no_lonely_pairs,
            dangles=self.config.dangles,
        )
        # Charge-and-refund assumes an energy model exactly additive over loops,
        # which only dangles=0 provides. Reference folding and rescoring stay on
        # the configured (standard) model so benchmarks compare against ordinary
        # ViennaRNA behaviour.
        self.energy_backend = ViennaBackend(
            temperature_celsius=self.config.temperature_celsius,
            no_lonely_pairs=self.config.no_lonely_pairs,
            dangles=self.config.energy_dangles,
        )

    def build_problem(self, sequence: str) -> QuboProblem:
        stems = generate_maximal_stems(
            sequence,
            min_stem_length=self.config.min_stem_length,
            min_hairpin=self.config.min_hairpin,
            allow_wobble=self.config.allow_wobble,
        )
        if self.config.expand_substems:
            stems = expand_substems(
                stems,
                min_stem_length=self.config.min_stem_length,
                min_hairpin=self.config.min_hairpin,
            )
        return build_stem_qubo(
            sequence,
            stems,
            self.energy_backend,
            penalties=PenaltyConfig(
                overlap=self.config.overlap_penalty,
                crossing=self.config.crossing_penalty,
                forbid_crossing=self.config.forbid_crossing,
            ),
            energy_model=self.config.energy_model,
            nesting_policy=self.config.nesting_policy,
        )

    def predict(
        self,
        record: SequenceRecord,
        *,
        encoding: str = "stem",
        solver: str = "simulated_annealing",
    ) -> PipelineResult:
        if encoding != "stem":
            raise ValueError(f"unsupported encoding {encoding!r}; only 'stem' is implemented")
        if solver not in SOLVER_REGISTRY:
            raise ValueError(
                f"unknown solver {solver!r}; available: {sorted(SOLVER_REGISTRY)}"
            )

        start = time.perf_counter()
        reference = self.backend.fold(record.sequence)
        problem = self.build_problem(record.sequence)

        solver_config = SolverConfig(num_reads=self.config.num_reads, seed=self.config.seed)
        solver_result = SOLVER_REGISTRY[solver]().solve(problem, solver_config)

        # Exact ground truth for Gates B and C, when the instance is small enough.
        exact_result: SolverResult | None
        try:
            exact_result = ExactSolver(
                max_variables=self.config.exact_max_variables
            ).solve(problem, solver_config)
        except ExactSolverTooLarge:
            exact_result = None

        candidate = decode_sample(
            solver_result.best,
            problem,
            self.backend,
            repair=self.config.repair_invalid,
            forbid_crossing=self.config.forbid_crossing,
        )
        gates = evaluate_gates(problem, reference, solver_result, candidate, exact_result)

        return PipelineResult(
            record=record,
            reference=reference,
            problem=problem,
            solver_result=solver_result,
            best_candidate=candidate,
            gates=gates,
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "solver": solver,
                "encoding": encoding,
                "config": self.config.as_dict(),
                "num_variables": problem.num_variables,
                "qubo_density": problem.density,
                "exact_available": exact_result is not None,
            },
        )
