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
    multi_qubit_gates: int
    """Gates acting on three or more qubits; should be zero for a decomposed QAOA
    ansatz, and a non-zero value signals the decomposition did not reach the
    target basis."""
    swap_gates: int
    shots: int
    optimizer_iterations: int
    circuit_evaluations: int


_NON_COMPUTE_GATES = {"barrier", "measure", "delay", "snapshot"}


def _count_gates_by_arity(circuit) -> tuple[int, int, int]:
    """Classify a circuit's instructions by qubit width: (1-qubit, 2-qubit, 3+-qubit).

    Arity is read directly off each instruction, so a gate can never fall through
    uncounted the way a hardcoded name allowlist can when Qiskit's basis set
    changes -- e.g. the `r` gate, which matched neither the 1-qubit nor 2-qubit
    allowlist this replaces, and was silently dropped from the total.
    """
    one_qubit = two_qubit = multi_qubit = 0
    for instruction in circuit.data:
        if instruction.operation.name in _NON_COMPUTE_GATES:
            continue
        width = len(instruction.qubits)
        if width == 1:
            one_qubit += 1
        elif width == 2:
            two_qubit += 1
        else:
            multi_qubit += 1
    return one_qubit, two_qubit, multi_qubit


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

    one_qubit, two_qubit, multi_qubit = _count_gates_by_arity(decomposed)

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
        # Once a specific backend is named, the honest "what this would actually
        # cost" numbers are the mapped gate counts, not the pre-transpile ideal
        # ones -- computed the same arity-based way so the two are comparable.
        one_qubit, two_qubit, multi_qubit = _count_gates_by_arity(compiled)

    return ResourceReport(
        logical_qubits=problem.num_variables,
        hamiltonian_terms=len(cost),
        qubo_density=problem.density,
        circuit_depth=decomposed.depth(),
        transpiled_depth=transpiled_depth,
        one_qubit_gates=one_qubit,
        two_qubit_gates=two_qubit,
        multi_qubit_gates=multi_qubit,
        swap_gates=swaps,
        shots=shots,
        optimizer_iterations=optimizer_iterations,
        circuit_evaluations=circuit_evaluations,
    )
