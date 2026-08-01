import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_qubo_energy_matches_manual_sum():
    problem = QuboProblem(
        linear={0: -2.0, 1: -1.0},
        quadratic={(0, 1): 5.0},
        offset=0.5,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )
    assert problem.energy((0, 0)) == pytest.approx(0.5)
    assert problem.energy((1, 0)) == pytest.approx(-1.5)
    assert problem.energy((1, 1)) == pytest.approx(-2.0 - 1.0 + 5.0 + 0.5)


def test_qubo_rejects_bitstring_of_wrong_length():
    problem = QuboProblem({0: 1.0}, {}, 0.0, (Stem(0, 9, 2),), DEMO, {})
    with pytest.raises(ValueError, match="expected 1 bits"):
        problem.energy((1, 0))


def test_num_variables_and_density():
    problem = QuboProblem(
        {0: 1.0, 1: 1.0, 2: 1.0},
        {(0, 1): 1.0},
        0.0,
        (Stem(0, 9, 2), Stem(0, 9, 3), Stem(0, 10, 2)),
        DEMO,
        {},
    )
    assert problem.num_variables == 3
    assert problem.density == pytest.approx(1 / 3)  # 1 edge of 3 possible


def test_bqm_roundtrip_preserves_energy():
    problem = QuboProblem(
        {0: -2.0, 1: -1.0}, {(0, 1): 5.0}, 0.0, (Stem(0, 9, 2), Stem(0, 9, 3)), DEMO, {}
    )
    bqm = problem.to_bqm()
    for bits in [(0, 0), (0, 1), (1, 0), (1, 1)]:
        assert bqm.energy({0: bits[0], 1: bits[1]}) == pytest.approx(problem.energy(bits))


def test_calibrated_penalty_exceeds_largest_energy_gain():
    penalty = calibrate_penalty({0: -3.0, 1: -7.5, 2: -1.0})
    assert penalty > 7.5


def test_penalty_is_positive_even_when_all_energies_are_zero():
    assert calibrate_penalty({0: 0.0, 1: 0.0}) > 0.0


def test_built_qubo_penalises_conflicting_stems(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    for (a, b), coeff in problem.quadratic.items():
        if problem.variable_map[a].nucleotides() & problem.variable_map[b].nucleotides():
            assert coeff > 0.0, "overlapping stems must be penalised, not rewarded"


def test_selecting_a_real_stem_lowers_energy(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    empty = problem.energy(tuple(0 for _ in stems))
    best = min(
        problem.energy(tuple(1 if i == idx else 0 for i in range(len(stems))))
        for idx in range(len(stems))
    )
    assert best < empty


def test_pseudoknot_mode_produces_fewer_quadratic_terms(backend):
    seq = "GGGCAUAAAAGCUUUUGCCCAAAGCAU"
    stems = generate_maximal_stems(seq, min_stem_length=2)
    strict = build_stem_qubo(seq, stems, backend, penalties=PenaltyConfig(forbid_crossing=True))
    relaxed = build_stem_qubo(seq, stems, backend, penalties=PenaltyConfig(forbid_crossing=False))
    assert len(relaxed.quadratic) <= len(strict.quadratic)


def test_metadata_records_reproducibility_fields(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    for key in ("energy_model", "nesting_policy", "overlap_penalty", "forbid_crossing"):
        assert key in problem.metadata
