"""Exact ground-state solvers, the source of truth for Gates B and C.

Tree decomposition handles sparse graphs efficiently but fails on the dense
conflict graphs RNA produces above roughly 22 variables. Beyond `max_variables`
this raises rather than returning a heuristic answer that would silently
invalidate every gate that depends on it.
"""

from __future__ import annotations

import itertools
import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


class ExactSolverTooLarge(RuntimeError):  # noqa: N818 - name fixed by the task-10 interface spec
    """Raised when a problem exceeds the exact solver's honest reach."""


class ExactSolver:
    """Enumerate every assignment and return the true optimum.

    `degeneracy_probe_reads` bounds how hard the tree-decomposition path looks
    for ground-state degeneracy. `TreeDecompositionSolver` returns distinct
    solutions capped at `min(num_reads, 2**n)`, so the reported `degeneracy`
    is only as good as this budget -- it is a lower bound, not a guaranteed
    exact count, unless the probe returns fewer samples than it asked for.
    `metadata["degeneracy_is_exact"]` reports which case applies. The
    brute-force path always counts exactly.
    """

    name = "exact"

    def __init__(
        self,
        max_variables: int = 22,
        brute_force_limit: int = 18,
        degeneracy_probe_reads: int = 64,
    ) -> None:
        self.max_variables = max_variables
        self.brute_force_limit = brute_force_limit
        self.degeneracy_probe_reads = degeneracy_probe_reads

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        n = problem.num_variables
        if n > self.max_variables:
            raise ExactSolverTooLarge(
                f"problem has {n} variables, above the exact limit of {self.max_variables}; "
                "Gates B and C cannot be evaluated at this size"
            )

        start = time.perf_counter()

        # Tree decomposition is the workhorse: it solved 22 variables in 0.056s during
        # design probing, where brute force needs 4.2M enumerations. It raises on graphs
        # whose treewidth is too large, so brute force stays as a bounded fallback.
        if n > self.brute_force_limit:
            bits, energy, degeneracy, method, degeneracy_is_exact = self._tree_decomposition(problem)
        else:
            try:
                bits, energy, degeneracy, method, degeneracy_is_exact = self._tree_decomposition(
                    problem
                )
            except Exception:  # noqa: BLE001 - any sampler failure falls back safely
                bits, energy, degeneracy, method, degeneracy_is_exact = self._brute_force(problem)

        return SolverResult(
            solver_name=self.name,
            samples=(Sample(bits=bits, energy=energy),),
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "degeneracy": degeneracy,
                "degeneracy_is_exact": degeneracy_is_exact,
                "method": method,
                "num_variables": n,
                "is_exact": True,
            },
        )

    def _tree_decomposition(
        self, problem: QuboProblem
    ) -> tuple[tuple[int, ...], float, int, str, bool]:
        """Exact ground state via tree decomposition of the interaction graph.

        `TreeDecompositionSolver`, not `TreeDecompositionSampler`: the sampler draws
        stochastic reads from the Boltzmann distribution at beta=1.0, which is exact
        only in distribution, not per-draw -- on the toy problem it returned the true
        optimum in 4 of 5 independent calls and a strictly worse energy in the 5th.
        The solver runs the same tree decomposition as a deterministic dynamic
        program over the elimination order and returns the true minimum every time.

        The ground *energy* and *bitstring* are exact regardless. Ground-state
        *degeneracy*, however, is counted from the distinct solutions the solver
        happens to return, capped at `min(degeneracy_probe_reads, 2**n)`. That
        count is a true count only when the probe did not come back saturated
        with ground states right up to its own budget; otherwise more ground
        states may exist beyond what was sampled, and the count is a lower
        bound. The returned bool reports which case applies.
        """
        from dwave.samplers import TreeDecompositionSolver

        # TreeDecompositionSolver returns DISTINCT solutions capped at
        # min(num_reads, 2**n), so the degeneracy count is only as good as the
        # number of reads requested. Probe with a bounded budget rather than 2.
        probe_reads = min(self.degeneracy_probe_reads, 2**problem.num_variables)
        try:
            sampleset = TreeDecompositionSolver().sample(
                problem.to_bqm(), num_reads=probe_reads
            )
        except Exception as error:
            raise ExactSolverTooLarge(
                f"tree decomposition failed on {problem.num_variables} variables "
                f"(density {problem.density:.2f}): {error}"
            ) from error

        best = sampleset.first
        bits = tuple(int(best.sample[i]) for i in range(problem.num_variables))
        degeneracy = sum(
            1 for record in sampleset.data(["energy"]) if abs(record.energy - best.energy) <= 1e-9
        )
        # If every returned sample is a ground state AND we exhausted the probe
        # budget, more ground states may exist beyond what was returned.
        exhausted = len(sampleset) >= probe_reads
        degeneracy_is_exact = not (exhausted and degeneracy == len(sampleset))
        return bits, float(best.energy), degeneracy, "tree_decomposition", degeneracy_is_exact

    def _brute_force(
        self, problem: QuboProblem
    ) -> tuple[tuple[int, ...], float, int, str, bool]:
        """Enumerate every assignment. Only used below `brute_force_limit`."""
        n = problem.num_variables
        best_energy = float("inf")
        best_bits: tuple[int, ...] = tuple(0 for _ in range(n))
        degeneracy = 0

        for bits in itertools.product((0, 1), repeat=n):
            energy = problem.energy(bits)
            if energy < best_energy - 1e-9:
                best_energy, best_bits, degeneracy = energy, bits, 1
            elif abs(energy - best_energy) <= 1e-9:
                degeneracy += 1

        return best_bits, best_energy, degeneracy, "brute_force", True
