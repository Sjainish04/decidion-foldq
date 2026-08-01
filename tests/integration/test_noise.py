import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.resources import estimate_resources
from foldq.solvers.base import SolverConfig
from foldq.solvers.qaoa import QAOASolver

pytest.importorskip("qiskit_aer")
pytest.importorskip("qiskit_ibm_runtime")

DEMO = "GGGAAAUCCCU"
NOISE_BACKEND = "fake_hanoi"


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


def test_fake_backend_is_available_offline():
    from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

    names = {backend.name for backend in FakeProviderForBackendV2().backends()}
    assert NOISE_BACKEND in names


def test_noisy_qaoa_runs_and_reports_its_backend(problem):
    solver = QAOASolver(reps=1, maxiter=15, shots=256, noise_backend=NOISE_BACKEND)
    result = solver.solve(problem, SolverConfig(num_reads=256, seed=4))
    assert result.metadata["noise_backend"] == NOISE_BACKEND
    assert result.solver_name.startswith("qaoa_noisy")


def test_noisy_energies_are_still_valid_qubo_values(problem):
    """Noise degrades quality but must never corrupt the energy bookkeeping."""
    solver = QAOASolver(reps=1, maxiter=15, shots=256, noise_backend=NOISE_BACKEND)
    result = solver.solve(problem, SolverConfig(num_reads=256, seed=4))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits), abs=1e-6)


def test_noise_does_not_improve_on_noiseless(problem):
    clean = QAOASolver(reps=1, maxiter=40, shots=512).solve(problem, SolverConfig(seed=9))
    noisy = QAOASolver(reps=1, maxiter=40, shots=512, noise_backend=NOISE_BACKEND).solve(
        problem, SolverConfig(seed=9)
    )
    assert noisy.best.energy >= clean.best.energy - 1e-6


def test_transpiled_depth_exceeds_ideal_depth_on_real_topology(problem):
    """Limited connectivity forces SWAPs; this is a headline resource finding."""
    ideal = estimate_resources(problem, reps=1)
    mapped = estimate_resources(problem, reps=1, backend_name=NOISE_BACKEND)
    assert mapped.transpiled_depth >= ideal.circuit_depth
