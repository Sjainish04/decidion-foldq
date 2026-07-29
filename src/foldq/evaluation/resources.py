"""Quantum-resource accounting for the scaling analysis."""

from __future__ import annotations

from dataclasses import dataclass

from foldq.qubo.ising import to_sparse_pauli_op
from foldq.schemas.qubo import QuboProblem


@dataclass(frozen=True)
class ResourceReport:
    """What running this instance on gate-based hardware would actually cost."""

    logical_qubits: int
    hamiltonian_terms: int
    qubo_density: float
    circuit_depth: int
    transpiled_depth: int
    one_qubit_gates: int
    two_qubit_gates: int
    swap_gates: int
    shots: int
    optimizer_iterations: int
    circuit_evaluations: int


def estimate_resources(
    problem: QuboProblem,
    *,
    reps: int = 1,
    backend_name: str | None = None,
    shots: int = 1024,
    optimizer_iterations: int = 0,
    circuit_evaluations: int = 0,
) -> ResourceReport:
    """Build the QAOA ansatz and count what it costs, optionally after transpilation."""
    from qiskit import transpile
    from qiskit.circuit.library import QAOAAnsatz

    cost = to_sparse_pauli_op(problem)
    ansatz = QAOAAnsatz(cost_operator=cost, reps=reps)
    decomposed = ansatz.decompose(reps=3)

    operations = decomposed.count_ops()
    two_qubit = sum(
        count for gate, count in operations.items() if gate in {"cx", "cz", "ecr", "rzz"}
    )
    one_qubit = sum(
        count
        for gate, count in operations.items()
        if gate in {"rx", "ry", "rz", "h", "x", "sx", "u", "p"}
    )

    transpiled_depth, swaps = decomposed.depth(), 0
    if backend_name is not None:
        from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

        device = next(
            backend
            for backend in FakeProviderForBackendV2().backends()
            if backend.name == backend_name
        )
        compiled = transpile(ansatz, device, optimization_level=1, seed_transpiler=0)
        transpiled_depth = compiled.depth()
        swaps = compiled.count_ops().get("swap", 0)

    return ResourceReport(
        logical_qubits=problem.num_variables,
        hamiltonian_terms=len(cost),
        qubo_density=problem.density,
        circuit_depth=decomposed.depth(),
        transpiled_depth=transpiled_depth,
        one_qubit_gates=one_qubit,
        two_qubit_gates=two_qubit,
        swap_gates=swaps,
        shots=shots,
        optimizer_iterations=optimizer_iterations,
        circuit_evaluations=circuit_evaluations,
    )
