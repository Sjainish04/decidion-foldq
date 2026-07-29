"""Quantum-inspired and classical annealing solvers from the Ocean SDK.

All three run locally with no account and no cost.
"""

from __future__ import annotations

import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


def _to_samples(sampleset, problem: QuboProblem) -> tuple[Sample, ...]:
    """Convert a dimod SampleSet into ordered bit tuples.

    dimod keys samples by variable label, so this must index explicitly rather
    than relying on dict ordering.
    """
    samples = []
    for record in sampleset.data(["sample", "energy", "num_occurrences"]):
        bits = tuple(int(record.sample[i]) for i in range(problem.num_variables))
        samples.append(
            Sample(
                bits=bits,
                energy=float(record.energy),
                num_occurrences=int(record.num_occurrences),
            )
        )
    return tuple(samples)


class SimulatedAnnealingSolver:
    """The primary quantum-inspired method: classical thermal annealing."""

    name = "simulated_annealing"

    def __init__(self, num_sweeps: int = 1000) -> None:
        self.num_sweeps = num_sweeps

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import SimulatedAnnealingSampler

        start = time.perf_counter()
        sampleset = SimulatedAnnealingSampler().sample(
            problem.to_bqm(),
            num_reads=config.num_reads,
            num_sweeps=self.num_sweeps,
            seed=config.seed,
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "num_sweeps": self.num_sweeps},
        )


class TabuSolver:
    """Strong classical local search with a tabu list. Hard to beat at this scale."""

    name = "tabu"

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import TabuSampler

        start = time.perf_counter()
        sampleset = TabuSampler().sample(
            problem.to_bqm(), num_reads=config.num_reads, seed=config.seed
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads},
        )


class PathIntegralSolver:
    """Simulated quantum annealing via path-integral Monte Carlo.

    Unlike thermal annealing this models quantum tunnelling through barriers,
    making it the closest classical analogue of a quantum annealer.
    """

    name = "path_integral_sqa"

    def __init__(self, num_sweeps: int = 1000) -> None:
        self.num_sweeps = num_sweeps

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import PathIntegralAnnealingSampler

        start = time.perf_counter()
        sampleset = PathIntegralAnnealingSampler().sample(
            problem.to_bqm(),
            num_reads=config.num_reads,
            num_sweeps=self.num_sweeps,
            seed=config.seed,
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "num_sweeps": self.num_sweeps},
        )
