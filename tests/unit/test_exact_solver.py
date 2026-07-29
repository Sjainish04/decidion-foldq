import itertools

import pytest

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.schemas.structure import Stem
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge

DEMO = "GGGAAAUCCCU"


def _toy(num_vars: int = 3) -> QuboProblem:
    return QuboProblem(
        linear={0: -5.0, 1: -3.0, 2: -1.0},
        quadratic={(0, 1): 20.0},
        offset=0.0,
        variable_map=tuple(Stem(0, 9, 2) for _ in range(num_vars)),
        sequence=DEMO,
        metadata={},
    )


def test_solver_result_best_is_lowest_energy():
    result = SolverResult(
        solver_name="t",
        samples=(Sample((0,), 5.0), Sample((1,), -2.0)),
        runtime_seconds=0.0,
        metadata={},
    )
    assert result.best.energy == -2.0


def test_solver_result_rejects_empty_samples():
    with pytest.raises(ValueError, match="at least one sample"):
        SolverResult(solver_name="t", samples=(), runtime_seconds=0.0, metadata={})


def test_exact_solver_finds_true_ground_state():
    problem = _toy()
    result = ExactSolver().solve(problem, SolverConfig())
    brute = min(
        (problem.energy(bits), bits)
        for bits in itertools.product((0, 1), repeat=problem.num_variables)
    )
    assert result.best.energy == pytest.approx(brute[0])
    assert problem.energy(result.best.bits) == pytest.approx(brute[0])


def test_exact_solver_avoids_the_penalised_pair():
    """Variables 0 and 1 carry a penalty of 20; the optimum cannot take both."""
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert not (result.best.bits[0] and result.best.bits[1])


def test_exact_solver_refuses_oversized_problems():
    big = QuboProblem(
        linear={i: -1.0 for i in range(40)},
        quadratic={},
        offset=0.0,
        variable_map=tuple(Stem(0, 9, 2) for _ in range(40)),
        sequence=DEMO,
        metadata={},
    )
    with pytest.raises(ExactSolverTooLarge, match="40 variables"):
        ExactSolver(max_variables=22).solve(big, SolverConfig())


def test_brute_force_counts_degeneracy_exactly():
    """Two symmetric variables that exclude each other give two ground states."""
    problem = QuboProblem(
        linear={0: -1.0, 1: -1.0},
        quadratic={(0, 1): 2.0},
        offset=0.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )
    _, energy, degeneracy, method = ExactSolver()._brute_force(problem)
    assert energy == pytest.approx(-1.0)
    assert degeneracy == 2
    assert method == "brute_force"


def test_both_exact_methods_agree_on_the_ground_energy():
    """Tree decomposition and brute force must never disagree; the gates depend on it."""
    problem = _toy()
    tree_bits, tree_energy, _, _ = ExactSolver()._tree_decomposition(problem)
    brute_bits, brute_energy, _, _ = ExactSolver()._brute_force(problem)
    assert tree_energy == pytest.approx(brute_energy)
    assert problem.energy(tree_bits) == pytest.approx(problem.energy(brute_bits))


def test_exact_solver_records_which_method_it_used():
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert result.metadata["method"] in {"tree_decomposition", "brute_force"}
    assert result.metadata["is_exact"] is True


def test_tree_decomposition_is_fast_at_the_variable_cap():
    """Regression guard: brute force at 22 variables would take minutes."""
    import time

    from foldq.biology.stems import generate_maximal_stems
    from foldq.classical.vienna import ViennaBackend
    from foldq.encodings.stem_encoding import build_stem_qubo

    backend = ViennaBackend()
    seq = "GGGCAUAAAAGCUUUUGCCCAAAGCAUUUGC"
    problem = build_stem_qubo(seq, generate_maximal_stems(seq, min_stem_length=2), backend)
    if problem.num_variables < 15:
        pytest.skip("sequence produced too few variables to be a meaningful timing test")

    start = time.perf_counter()
    ExactSolver(max_variables=24).solve(problem, SolverConfig())
    assert time.perf_counter() - start < 10.0


def test_exact_solver_is_deterministic():
    a = ExactSolver().solve(_toy(), SolverConfig(seed=1))
    b = ExactSolver().solve(_toy(), SolverConfig(seed=1))
    assert a.best.bits == b.best.bits


def test_exact_solver_records_runtime_and_name():
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert result.solver_name == "exact"
    assert result.runtime_seconds >= 0.0
