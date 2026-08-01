import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.baselines import GreedySolver, LocalSearchSolver, RandomSolver
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


@pytest.mark.parametrize("solver", [RandomSolver(), GreedySolver(), LocalSearchSolver()])
def test_baselines_satisfy_the_protocol(solver):
    assert isinstance(solver, FoldSolver)
    assert isinstance(solver.name, str) and solver.name


@pytest.mark.parametrize("solver", [RandomSolver(), GreedySolver(), LocalSearchSolver()])
def test_reported_energy_matches_recomputed_energy(solver, problem):
    """A solver that misreports its own energy would corrupt every downstream gate."""
    result = solver.solve(problem, SolverConfig(num_reads=20, seed=42))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits))


@pytest.mark.parametrize("solver", [RandomSolver(), LocalSearchSolver()])
def test_stochastic_solvers_are_seed_reproducible(solver, problem):
    a = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    b = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    assert [s.bits for s in a.samples] == [s.bits for s in b.samples]


def test_greedy_is_deterministic(problem):
    a = GreedySolver().solve(problem, SolverConfig(seed=1))
    b = GreedySolver().solve(problem, SolverConfig(seed=999))
    assert a.best.bits == b.best.bits


def test_greedy_never_selects_conflicting_stems(problem):
    result = GreedySolver().solve(problem, SolverConfig())
    chosen = [problem.variable_map[i] for i, bit in enumerate(result.best.bits) if bit]
    for a_idx in range(len(chosen)):
        for b_idx in range(a_idx + 1, len(chosen)):
            assert not (chosen[a_idx].nucleotides() & chosen[b_idx].nucleotides())


def test_greedy_beats_random_on_average(problem):
    greedy = GreedySolver().solve(problem, SolverConfig()).best.energy
    random_best = RandomSolver().solve(problem, SolverConfig(num_reads=50, seed=3)).best.energy
    assert greedy <= random_best


def test_local_search_improves_on_its_starting_point(problem):
    result = LocalSearchSolver().solve(problem, SolverConfig(num_reads=10, seed=5))
    assert result.best.energy <= problem.energy(tuple(0 for _ in range(problem.num_variables)))


def test_local_search_reaches_the_optimum_on_a_small_instance(problem):
    exact = ExactSolver().solve(problem, SolverConfig()).best.energy
    found = LocalSearchSolver().solve(problem, SolverConfig(num_reads=50, seed=11)).best.energy
    assert found == pytest.approx(exact, abs=1e-6)
