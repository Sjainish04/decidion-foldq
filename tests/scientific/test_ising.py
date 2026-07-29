import itertools

import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.qubo.ising import (
    bits_to_spins,
    ising_energy,
    qubo_to_ising,
    spins_to_bits,
    to_sparse_pauli_op,
)
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


def _toy() -> QuboProblem:
    return QuboProblem(
        linear={0: -2.0, 1: 3.0},
        quadratic={(0, 1): 5.0},
        offset=1.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )


def test_bit_spin_conversion_roundtrips():
    assert bits_to_spins((0, 1)) == (1, -1)   # x=0 -> z=+1
    assert spins_to_bits((1, -1)) == (0, 1)


def test_ising_energy_matches_qubo_on_every_assignment():
    """The whole point of the mapping: identical energies after the offset."""
    problem = _toy()
    h, coupling, offset = qubo_to_ising(problem)
    for bits in itertools.product((0, 1), repeat=2):
        spins = bits_to_spins(bits)
        assert ising_energy(h, coupling, offset, spins) == pytest.approx(problem.energy(bits))


def test_ising_matches_qubo_on_a_real_instance():
    backend = ViennaBackend()
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend)
    h, coupling, offset = qubo_to_ising(problem)
    for bits in itertools.product((0, 1), repeat=problem.num_variables):
        assert ising_energy(h, coupling, offset, bits_to_spins(bits)) == pytest.approx(
            problem.energy(bits), abs=1e-9
        )


def test_sparse_pauli_op_has_correct_qubit_count():
    op = to_sparse_pauli_op(_toy())
    assert op.num_qubits == 2


def test_sparse_pauli_op_diagonal_matches_qubo():
    """The cost Hamiltonian's diagonal must equal the QUBO objective."""
    import numpy as np

    problem = _toy()
    diagonal = np.diag(to_sparse_pauli_op(problem).to_matrix()).real
    for index, bits in enumerate(itertools.product((0, 1), repeat=2)):
        # Qiskit orders basis states with qubit 0 as the least significant bit.
        qiskit_index = sum(bit << position for position, bit in enumerate(reversed(bits)))
        assert diagonal[qiskit_index] == pytest.approx(problem.energy(bits))
