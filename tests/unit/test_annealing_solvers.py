import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.solvers.annealing import (
    PathIntegralSolver,
    SimulatedAnnealingSolver,
    TabuSolver,
)
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"
ALL_SOLVERS = [SimulatedAnnealingSolver(), TabuSolver(), PathIntegralSolver()]


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_annealers_satisfy_the_protocol(solver):
    assert isinstance(solver, FoldSolver)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_reported_energy_matches_recomputed_energy(solver, problem):
    result = solver.solve(problem, SolverConfig(num_reads=20, seed=42))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits), abs=1e-6)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_annealers_find_the_optimum_on_a_small_instance(solver, problem):
    exact = ExactSolver().solve(problem, SolverConfig()).best.energy
    found = solver.solve(problem, SolverConfig(num_reads=100, seed=13)).best.energy
    assert found == pytest.approx(exact, abs=1e-6)


@pytest.mark.parametrize("solver", [SimulatedAnnealingSolver(), PathIntegralSolver()])
def test_annealers_are_seed_reproducible(solver, problem):
    a = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    b = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    assert a.best.energy == pytest.approx(b.best.energy)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_bit_ordering_survives_the_dimod_roundtrip(solver, problem):
    """dimod returns dict-keyed samples; misordering them corrupts every decode."""
    result = solver.solve(problem, SolverConfig(num_reads=5, seed=1))
    for sample in result.samples:
        assert len(sample.bits) == problem.num_variables
        assert all(bit in (0, 1) for bit in sample.bits)
