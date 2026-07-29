"""QAOA on local Aer simulators.

Runs entirely offline with no account and no cost. Optional hardware-realistic
noise comes from `qiskit_ibm_runtime.fake_provider`, which ships real IBM device
calibration data locally.
"""

from __future__ import annotations

import time
from collections.abc import Sequence

import numpy as np

from foldq.qubo.ising import to_sparse_pauli_op
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


def _cvar(energies: Sequence[float], weights: Sequence[float], alpha: float) -> float:
    """Mean of the lowest-`alpha` fraction of sampled energies."""
    order = np.argsort(energies)
    cutoff = max(1, int(np.ceil(alpha * sum(weights))))
    taken, total, accumulated = 0.0, 0.0, 0.0
    for index in order:
        take = min(weights[index], cutoff - accumulated)
        if take <= 0:
            break
        total += energies[index] * take
        taken += take
        accumulated += take
    return total / taken if taken else float(np.mean(energies))


class QAOASolver:
    """Quantum Approximate Optimization Algorithm with optional CVaR and warm start."""

    name = "qaoa"

    def __init__(
        self,
        reps: int = 1,
        optimizer: str = "COBYLA",
        maxiter: int = 200,
        shots: int | None = None,
        objective: str = "expectation",
        cvar_alpha: float = 0.25,
        warm_start_bits: tuple[int, ...] | None = None,
        noise_backend: str | None = None,
    ) -> None:
        if objective not in {"expectation", "cvar"}:
            raise ValueError(f"unknown objective {objective!r}")
        self.reps = reps
        self.optimizer = optimizer
        self.maxiter = maxiter
        self.shots = shots
        self.objective = objective
        self.cvar_alpha = cvar_alpha
        self.warm_start_bits = warm_start_bits
        self.noise_backend = noise_backend
        if noise_backend is not None:
            self.name = f"qaoa_noisy_{noise_backend}"
        elif objective == "cvar":
            self.name = "cvar_qaoa"

    def _simulator(self):
        from qiskit_aer import AerSimulator

        if self.noise_backend is None:
            return AerSimulator(method="statevector")

        from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

        device = next(
            backend
            for backend in FakeProviderForBackendV2().backends()
            if backend.name == self.noise_backend
        )
        return AerSimulator.from_backend(device)

    def _circuit(self, problem: QuboProblem):
        from qiskit.circuit.library import QAOAAnsatz

        cost = to_sparse_pauli_op(problem)
        initial_state = None
        if self.warm_start_bits is not None:
            from qiskit import QuantumCircuit

            initial_state = QuantumCircuit(problem.num_variables)
            for index, bit in enumerate(self.warm_start_bits):
                if bit:
                    initial_state.x(index)
        ansatz = QAOAAnsatz(cost_operator=cost, reps=self.reps, initial_state=initial_state)
        ansatz.measure_all()
        return ansatz

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from qiskit import transpile
        from scipy.optimize import minimize

        start = time.perf_counter()
        rng = np.random.default_rng(config.seed)
        simulator = self._simulator()
        ansatz = self._circuit(problem)
        compiled = transpile(ansatz, simulator, seed_transpiler=config.seed or 0)

        shots = self.shots or config.num_reads
        evaluations = {"count": 0}

        def sample_energies(parameters):
            bound = compiled.assign_parameters(parameters)
            job = simulator.run(bound, shots=shots, seed_simulator=config.seed)
            counts = job.result().get_counts()
            energies, weights, bitstrings = [], [], []
            for bitstring, occurrences in counts.items():
                # Qiskit returns little-endian strings; variable 0 is the last char.
                bits = tuple(int(char) for char in reversed(bitstring.replace(" ", "")))
                bits = bits[: problem.num_variables]
                energies.append(problem.energy(bits))
                weights.append(float(occurrences))
                bitstrings.append(bits)
            return energies, weights, bitstrings

        def objective_value(parameters):
            evaluations["count"] += 1
            energies, weights, _ = sample_energies(parameters)
            if self.objective == "cvar":
                return _cvar(energies, weights, self.cvar_alpha)
            return float(np.average(energies, weights=weights))

        initial = rng.uniform(0, np.pi, size=compiled.num_parameters)
        optimization = minimize(
            objective_value,
            initial,
            method=self.optimizer,
            options={"maxiter": self.maxiter},
        )

        _, weights, bitstrings = sample_energies(optimization.x)
        samples = tuple(
            Sample(bits=bits, energy=problem.energy(bits), num_occurrences=int(weight))
            for bits, weight in zip(bitstrings, weights)
        )

        return SolverResult(
            solver_name=self.name,
            samples=samples,
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "reps": self.reps,
                "optimizer": self.optimizer,
                "objective": self.objective,
                "cvar_alpha": self.cvar_alpha if self.objective == "cvar" else None,
                "shots": shots,
                "optimizer_iterations": int(optimization.nit)
                if hasattr(optimization, "nit")
                else self.maxiter,
                "circuit_evaluations": evaluations["count"],
                "warm_started": self.warm_start_bits is not None,
                "noise_backend": self.noise_backend,
                "transpiled_depth": compiled.depth(),
            },
        )
