import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.decoding.decode import bits_to_stems, decode_sample, validate_stems
from foldq.decoding.repair import repair_stems
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


@pytest.fixture
def problem(backend):
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), backend)


def _conflicting_problem() -> QuboProblem:
    """Two helices that share nucleotide 0 and therefore cannot coexist."""
    return QuboProblem(
        linear={0: -5.0, 1: -4.0},
        quadratic={(0, 1): 50.0},
        offset=0.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 10, 2)),
        sequence=DEMO,
        metadata={},
    )


def test_bits_select_the_right_stems(problem):
    bits = tuple(1 if i == 0 else 0 for i in range(problem.num_variables))
    assert bits_to_stems(bits, problem) == [problem.variable_map[0]]


def test_no_bits_set_decodes_to_empty_structure(problem):
    assert bits_to_stems(tuple(0 for _ in range(problem.num_variables)), problem) == []


def test_validate_accepts_a_legal_structure():
    assert validate_stems([Stem(0, 30, 3), Stem(10, 20, 2)]).is_valid


def test_validate_flags_overlap():
    report = validate_stems([Stem(0, 20, 3), Stem(2, 30, 2)])
    assert not report.is_valid
    assert report.overlapping_pairs == ((0, 1),)


def test_validate_flags_crossing():
    report = validate_stems([Stem(0, 20, 2), Stem(10, 30, 2)], forbid_crossing=True)
    assert report.crossing_pairs == ((0, 1),)


def test_validate_ignores_crossing_in_pseudoknot_mode():
    report = validate_stems([Stem(0, 20, 2), Stem(10, 30, 2)], forbid_crossing=False)
    assert report.is_valid


def test_repair_removes_conflicts_and_records_why():
    problem = _conflicting_problem()
    repaired, ops = repair_stems(list(problem.variable_map), problem)
    assert validate_stems(repaired).is_valid
    assert len(ops) == 1
    assert ops[0].action == "remove"
    assert "overlap" in ops[0].reason


def test_repair_keeps_the_more_favourable_stem():
    """Stem 0 has energy -5 versus -4, so repair must drop stem 1."""
    problem = _conflicting_problem()
    repaired, _ = repair_stems(list(problem.variable_map), problem)
    assert repaired == [Stem(0, 9, 2)]


def test_repair_is_a_no_op_on_valid_structures(problem):
    stems = [problem.variable_map[0]]
    repaired, ops = repair_stems(stems, problem)
    assert repaired == stems
    assert ops == []


def test_repair_is_deterministic():
    problem = _conflicting_problem()
    first, _ = repair_stems(list(problem.variable_map), problem)
    second, _ = repair_stems(list(problem.variable_map), problem)
    assert first == second


def test_decode_produces_a_scored_candidate(problem, backend):
    bits = tuple(1 if i == 0 else 0 for i in range(problem.num_variables))
    candidate = decode_sample(Sample(bits, problem.energy(bits)), problem, backend)
    assert len(candidate.dot_bracket) == len(DEMO)
    assert candidate.vienna_energy == pytest.approx(
        backend.eval_structure(DEMO, candidate.dot_bracket), abs=0.01
    )
    assert candidate.validation.is_valid


def test_decode_without_repair_preserves_the_violation():
    """Raw reporting must not quietly fix an invalid solver output."""
    problem = _conflicting_problem()
    bits = (1, 1)
    candidate = decode_sample(
        Sample(bits, problem.energy(bits)), problem, ViennaBackend(), repair=False
    )
    assert not candidate.validation.is_valid
    assert not candidate.was_repaired


def test_pseudoknot_mode_does_not_silently_rebracket_a_crossing():
    """A crossing structure must not be rendered as different nested pairs.

    In pseudoknot mode `validate_stems` does not populate `crossing_pairs`,
    because crossings are legal there. Keying renderability off that field made
    decode_sample emit a dot-bracket encoding DIFFERENT pairs than were selected:
    Stem(0,10,1) + Stem(5,15,1) rendered as pairs (0,15)/(5,10), and ViennaRNA
    then scored a structure that was never chosen. Renderability is a property of
    the structure, not of the mode.
    """
    import math

    from foldq.schemas.qubo import QuboProblem

    left, right = Stem(0, 10, 1), Stem(5, 15, 1)
    sequence = "GGGCAUAAAAGCUUUUGCCCAAAGC"
    problem = QuboProblem(
        linear={0: -1.0, 1: -1.0},
        quadratic={},
        offset=0.0,
        variable_map=(left, right),
        sequence=sequence,
        metadata={},
    )
    candidate = decode_sample(
        Sample((1, 1), -2.0),
        problem,
        ViennaBackend(dangles=0),
        repair=False,
        forbid_crossing=False,
    )
    assert candidate.is_pseudoknotted is True
    assert set(candidate.dot_bracket) == {"."}, (
        f"crossing structure rendered as {candidate.dot_bracket!r}; "
        "single-bracket notation cannot express it"
    )
    assert math.isnan(candidate.vienna_energy)


def test_non_crossing_structure_still_renders_normally_in_pseudoknot_mode():
    """Relaxing crossing must not disable rendering for ordinary nested folds."""
    problem = _conflicting_problem()
    bits = tuple(1 if index == 0 else 0 for index in range(problem.num_variables))
    candidate = decode_sample(
        Sample(bits, problem.energy(bits)),
        problem,
        ViennaBackend(dangles=0),
        forbid_crossing=False,
    )
    assert candidate.is_pseudoknotted is False
    assert "(" in candidate.dot_bracket
