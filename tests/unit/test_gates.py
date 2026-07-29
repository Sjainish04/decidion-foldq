import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.decoding.decode import decode_sample
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.gates import (
    evaluate_gates,
    gate_a_representable,
    gate_c_solved,
)
from foldq.schemas.gates import GateReport
from foldq.schemas.result import Sample, SolverResult
from foldq.schemas.structure import Stem
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_gate_a_passes_when_every_reference_pair_is_covered():
    reference = frozenset({(0, 9), (1, 8), (2, 7)})
    ok, fraction = gate_a_representable(reference, [Stem(0, 9, 3)])
    assert ok
    assert fraction == 1.0


def test_gate_a_reports_the_ceiling_when_a_pair_is_missing():
    reference = frozenset({(0, 9), (1, 8), (2, 7), (30, 40)})
    ok, fraction = gate_a_representable(reference, [Stem(0, 9, 3)])
    assert not ok
    assert fraction == pytest.approx(0.75)


def test_gate_a_on_the_real_demo_sequence(backend):
    reference = backend.fold(DEMO)
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    ok, fraction = gate_a_representable(reference.base_pairs, stems)
    assert ok and fraction == 1.0


def test_gate_c_passes_when_solver_matches_exact():
    exact = SolverResult("exact", (Sample((1, 0), -5.0),), 0.0, {})
    solver = SolverResult("sa", (Sample((1, 0), -5.0),), 0.0, {})
    assert gate_c_solved(solver, exact) is True


def test_gate_c_fails_when_solver_is_worse():
    exact = SolverResult("exact", (Sample((1, 0), -5.0),), 0.0, {})
    solver = SolverResult("sa", (Sample((0, 1), -3.0),), 0.0, {})
    assert gate_c_solved(solver, exact) is False


def test_gate_c_is_none_without_exact_ground_truth():
    solver = SolverResult("sa", (Sample((0, 1), -3.0),), 0.0, {})
    assert gate_c_solved(solver, None) is None


def test_full_ladder_on_the_demo_sequence(backend):
    reference = backend.fold(DEMO)
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend)
    exact = ExactSolver().solve(problem, SolverConfig())
    candidate = decode_sample(exact.best, problem, backend)

    report = evaluate_gates(problem, reference, exact, candidate, exact_result=exact)
    assert isinstance(report, GateReport)
    assert report.representable is True
    assert report.solver_found_ground_state is True
    assert 0.0 <= report.base_pair_f1 <= 1.0


def test_attribution_names_the_first_failing_gate():
    assert "candidate generation" in GateReport(
        representable=False, representable_fraction=0.5,
        is_qubo_ground_state=None, solver_found_ground_state=None,
        energy_gap=1.0, base_pair_f1=0.0,
    ).attribution

    assert "energy model" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=False, solver_found_ground_state=True,
        energy_gap=1.0, base_pair_f1=0.5,
    ).attribution

    assert "optimizer" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=True, solver_found_ground_state=False,
        energy_gap=1.0, base_pair_f1=0.5,
    ).attribution

    assert "no failure" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=True, solver_found_ground_state=True,
        energy_gap=0.0, base_pair_f1=1.0,
    ).attribution
