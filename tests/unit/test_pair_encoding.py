import pytest

from foldq.biology.pairs import candidate_pairs
from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.pair_encoding import build_pair_qubo
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.schemas.qubo import PenaltyConfig

DEMO = "GGGAAAUCCCU"
LONGER = "GGGCAUAAAAGCUUUUGCCC"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_one_variable_per_candidate_pair(backend):
    problem = build_pair_qubo(DEMO, backend)
    assert problem.num_variables == len(candidate_pairs(DEMO))


def test_every_variable_is_a_single_pair(backend):
    problem = build_pair_qubo(DEMO, backend)
    assert all(stem.k == 1 for stem in problem.variable_map)


def test_adjacent_pairs_are_rewarded_for_stacking(backend):
    """Stacking is the pair encoding's only source of favourable energy."""
    problem = build_pair_qubo(DEMO, backend)
    index = {(stem.i, stem.j): idx for idx, stem in enumerate(problem.variable_map)}
    key = tuple(sorted((index[(0, 9)], index[(1, 8)])))
    assert problem.quadratic[key] < 0.0


def test_overlapping_pairs_are_penalised(backend):
    problem = build_pair_qubo(DEMO, backend)
    for (a, b), coeff in problem.quadratic.items():
        left, right = problem.variable_map[a], problem.variable_map[b]
        if left.nucleotides() & right.nucleotides():
            assert coeff > 0.0


def test_pair_encoding_uses_more_variables_than_stem_encoding(backend):
    """The headline RQ2 comparison, asserted rather than assumed."""
    pair = build_pair_qubo(LONGER, backend)
    stem = build_stem_qubo(LONGER, generate_maximal_stems(LONGER, min_stem_length=2), backend)
    assert pair.num_variables > stem.num_variables


def test_metadata_identifies_the_encoding(backend):
    assert build_pair_qubo(DEMO, backend).metadata["encoding"] == "pair"


def test_selecting_a_stacked_pair_set_lowers_energy(backend):
    problem = build_pair_qubo(DEMO, backend)
    index = {(stem.i, stem.j): idx for idx, stem in enumerate(problem.variable_map)}
    bits = [0] * problem.num_variables
    for pair in ((0, 9), (1, 8), (2, 7)):
        bits[index[pair]] = 1
    assert problem.energy(tuple(bits)) < problem.energy(tuple([0] * problem.num_variables))


def test_pseudoknot_mode_removes_crossing_penalties(backend):
    strict = build_pair_qubo(LONGER, backend, penalties=PenaltyConfig(forbid_crossing=True))
    relaxed = build_pair_qubo(LONGER, backend, penalties=PenaltyConfig(forbid_crossing=False))
    assert len(relaxed.quadratic) <= len(strict.quadratic)
