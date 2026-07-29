"""Reference baselines. Any quantum or annealing claim must beat these."""

from __future__ import annotations

import random
import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


class RandomSolver:
    """Uniform random bit assignments: the floor any method must clear."""

    name = "random"

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        rng = random.Random(config.seed)
        start = time.perf_counter()
        samples = []
        for _ in range(config.num_reads):
            bits = tuple(rng.randint(0, 1) for _ in range(problem.num_variables))
            samples.append(Sample(bits=bits, energy=problem.energy(bits)))
        return SolverResult(
            solver_name=self.name,
            samples=tuple(samples),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads},
        )


class GreedySolver:
    """Add helices in rank order, skipping any that conflict with the selection.

    Deterministic and ignores `seed` entirely, which the tests assert.
    """

    name = "greedy"

    def __init__(self, ranking: str = "energy") -> None:
        if ranking not in {"energy", "energy_per_pair", "length"}:
            raise ValueError(f"unknown ranking {ranking!r}")
        self.ranking = ranking

    def _rank_key(self, problem: QuboProblem, index: int) -> float:
        stem = problem.variable_map[index]
        energy = problem.linear.get(index, 0.0)
        if self.ranking == "energy":
            return energy
        if self.ranking == "energy_per_pair":
            return energy / stem.k
        return -float(stem.k)

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        start = time.perf_counter()
        order = sorted(range(problem.num_variables), key=lambda i: self._rank_key(problem, i))

        bits = [0] * problem.num_variables
        for index in order:
            if problem.linear.get(index, 0.0) >= 0.0:
                continue  # no energetic reason to include it
            bits[index] = 1
            if problem.energy(tuple(bits)) >= problem.energy(
                tuple(0 if i == index else b for i, b in enumerate(bits))
            ):
                bits[index] = 0

        assignment = tuple(bits)
        return SolverResult(
            solver_name=self.name,
            samples=(Sample(bits=assignment, energy=problem.energy(assignment)),),
            runtime_seconds=time.perf_counter() - start,
            metadata={"ranking": self.ranking},
        )


class LocalSearchSolver:
    """Steepest-descent hill climbing from random restarts, flipping one bit at a time."""

    name = "local_search"

    def __init__(self, max_iterations: int = 1000) -> None:
        self.max_iterations = max_iterations

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        rng = random.Random(config.seed)
        start = time.perf_counter()
        n = problem.num_variables
        samples = []

        for _ in range(config.num_reads):
            bits = [rng.randint(0, 1) for _ in range(n)]
            energy = problem.energy(tuple(bits))
            for _ in range(self.max_iterations):
                best_index, best_energy = None, energy
                for index in range(n):
                    bits[index] ^= 1
                    candidate = problem.energy(tuple(bits))
                    bits[index] ^= 1
                    if candidate < best_energy - 1e-12:
                        best_index, best_energy = index, candidate
                if best_index is None:
                    break
                bits[best_index] ^= 1
                energy = best_energy
            samples.append(Sample(bits=tuple(bits), energy=energy))

        return SolverResult(
            solver_name=self.name,
            samples=tuple(samples),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "max_iterations": self.max_iterations},
        )
