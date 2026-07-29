"""QUBO to Ising conversion for gate-based algorithms.

Substituting x_i = (1 - z_i) / 2 with z_i in {-1, +1} turns the binary objective
into an Ising Hamiltonian:  H = sum_i h_i Z_i + sum_{i<j} J_ij Z_i Z_j + offset
"""

from __future__ import annotations

from collections.abc import Sequence

from foldq.schemas.qubo import QuboProblem


def bits_to_spins(bits: Sequence[int]) -> tuple[int, ...]:
    """x = 0 -> z = +1;  x = 1 -> z = -1."""
    return tuple(1 - 2 * bit for bit in bits)


def spins_to_bits(spins: Sequence[int]) -> tuple[int, ...]:
    return tuple((1 - spin) // 2 for spin in spins)


def qubo_to_ising(
    problem: QuboProblem,
) -> tuple[dict[int, float], dict[tuple[int, int], float], float]:
    """Return (h, J, offset) such that Ising energy equals the QUBO objective."""
    h: dict[int, float] = {i: 0.0 for i in range(problem.num_variables)}
    coupling: dict[tuple[int, int], float] = {}
    offset = problem.offset

    for index, value in problem.linear.items():
        h[index] -= value / 2.0
        offset += value / 2.0

    for (a, b), value in problem.quadratic.items():
        coupling[(a, b)] = coupling.get((a, b), 0.0) + value / 4.0
        h[a] -= value / 4.0
        h[b] -= value / 4.0
        offset += value / 4.0

    return h, coupling, offset


def ising_energy(
    h: dict[int, float],
    coupling: dict[tuple[int, int], float],
    offset: float,
    spins: Sequence[int],
) -> float:
    """Evaluate the Ising Hamiltonian for a spin assignment."""
    total = offset
    total += sum(value * spins[index] for index, value in h.items())
    total += sum(value * spins[a] * spins[b] for (a, b), value in coupling.items())
    return total


def to_sparse_pauli_op(problem: QuboProblem):
    """Build the Qiskit cost Hamiltonian for this problem.

    Convention: variable `index` lives on qubit `index`. This is the convention
    the QAOA solver's measurement decoder depends on -- Qiskit counts keys are
    little-endian strings (rightmost character is qubit 0), so decoding with
    `reversed(bitstring)` yields `bits[k] == qubit k`, and `problem.energy(bits)`
    then treats `bits[k]` as variable `k`.

    Qiskit's Pauli label strings list qubit (n-1) first (leftmost) and qubit 0
    last (rightmost): string position p (0-indexed from the left) addresses
    qubit (n - 1 - p). To put variable `index` on qubit `index`, the 'Z'
    belongs at string position `n - 1 - index`, not `index`. Getting this
    backwards silently swaps the qubit each variable lives on, which is exactly
    the kind of permutation `test_sparse_pauli_op_diagonal_matches_qubo` and
    `test_diagonal_matches_on_an_asymmetric_three_variable_problem` exist to
    catch -- a symmetric fixture can pass under either mapping, so both tests
    use asymmetric coefficients.
    """
    from qiskit.quantum_info import SparsePauliOp

    n = problem.num_variables
    h, coupling, offset = qubo_to_ising(problem)

    labels: list[tuple[str, float]] = []
    if offset:
        labels.append(("I" * n, offset))
    for index, value in h.items():
        if value:
            pauli = ["I"] * n
            pauli[n - 1 - index] = "Z"
            labels.append(("".join(pauli), value))
    for (a, b), value in coupling.items():
        if value:
            pauli = ["I"] * n
            pauli[n - 1 - a] = "Z"
            pauli[n - 1 - b] = "Z"
            labels.append(("".join(pauli), value))

    if not labels:
        labels = [("I" * n, 0.0)]
    return SparsePauliOp.from_list(labels)
