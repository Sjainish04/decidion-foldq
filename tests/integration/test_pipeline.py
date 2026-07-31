import sys

import pytest
from typer.testing import CliRunner

from foldq.cli import app
from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

DEMO = "GGGAAAUCCCU"
runner = CliRunner()


@pytest.fixture
def record():
    return SequenceRecord(sequence_id="demo", sequence=DEMO, source_type="synthetic")


def test_registry_exposes_every_planned_solver():
    for name in (
        "exact", "random", "greedy", "local_search",
        "simulated_annealing", "tabu", "path_integral_sqa",
    ):
        assert name in SOLVER_REGISTRY


def test_classical_solvers_present_even_if_quantum_extra_is_unimportable(monkeypatch):
    """qiskit is optional (the `quantum` extra); registry construction must not
    depend on it.

    Forces `from foldq.solvers.qaoa import QAOASolver` to raise ImportError --
    setting `sys.modules["foldq.solvers.qaoa"] = None` is the standard way to make
    the import system raise for a specific module regardless of whether qiskit is
    actually installed in this environment -- then calls the real
    `_register_quantum_solvers` and checks every classical solver is still there
    while `qaoa`/`cvar_qaoa` are simply absent. This is what proves the try/except
    around that import actually guards the registry, not just that it exists.
    """
    import foldq.pipeline as pipeline_module

    saved = dict(pipeline_module.SOLVER_REGISTRY)
    pipeline_module.SOLVER_REGISTRY.pop("qaoa", None)
    pipeline_module.SOLVER_REGISTRY.pop("cvar_qaoa", None)
    monkeypatch.setitem(sys.modules, "foldq.solvers.qaoa", None)

    try:
        pipeline_module._register_quantum_solvers()
        for name in (
            "exact", "random", "greedy", "local_search",
            "simulated_annealing", "tabu", "path_integral_sqa",
        ):
            assert name in pipeline_module.SOLVER_REGISTRY
        assert "qaoa" not in pipeline_module.SOLVER_REGISTRY
        assert "cvar_qaoa" not in pipeline_module.SOLVER_REGISTRY
    finally:
        pipeline_module.SOLVER_REGISTRY.clear()
        pipeline_module.SOLVER_REGISTRY.update(saved)


def test_pipeline_runs_end_to_end(record):
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="simulated_annealing")
    assert result.reference.mfe_structure == "(((....)))."
    assert len(result.best_candidate.dot_bracket) == len(DEMO)
    assert result.gates.representable is True
    assert result.runtime_seconds > 0.0


def test_pipeline_recovers_the_mfe_on_the_demo_sequence(record):
    """The headline sanity check: on a trivially foldable sequence, get the MFE."""
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="exact")
    assert result.best_candidate.dot_bracket == result.reference.mfe_structure
    assert result.gates.base_pair_f1 == 1.0


def test_pipeline_populates_gates_b_and_c_when_exact_is_reachable(record):
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="simulated_annealing")
    assert result.gates.is_qubo_ground_state is not None
    assert result.gates.solver_found_ground_state is not None


def test_pipeline_is_seed_reproducible(record):
    config = FoldQConfig(seed=99)
    first = FoldQPipeline(config).predict(record, solver="simulated_annealing")
    second = FoldQPipeline(config).predict(record, solver="simulated_annealing")
    assert first.best_candidate.dot_bracket == second.best_candidate.dot_bracket


def test_pseudoknot_mode_changes_the_problem(record):
    strict = FoldQPipeline(FoldQConfig(forbid_crossing=True)).predict(record, solver="exact")
    relaxed = FoldQPipeline(FoldQConfig(forbid_crossing=False)).predict(record, solver="exact")
    assert len(relaxed.problem.quadratic) <= len(strict.problem.quadratic)


def test_pipeline_uses_dangles_0_for_energy_coefficients_and_dangles_2_elsewhere(record):
    """Correction 1's whole point: two backends, not one.

    `energy_backend` (dangles=0) must be what builds the QUBO's coefficients, since
    charge-and-refund assumes an energy model exactly additive over loops -- only
    true under dangles=0. `backend` (dangles=2, the configured/standard value) must
    still be what folds the reference and rescores the decoded candidate, so the
    benchmark comparison is against ordinary ViennaRNA behaviour.
    """
    pipeline = FoldQPipeline(FoldQConfig())
    assert pipeline.backend.dangles == 2
    assert pipeline.energy_backend.dangles == 0

    result = pipeline.predict(record, solver="exact")
    # The QUBO's linear coefficients must match a dangles=0 computation, not the
    # dangles=2 backend's -- confirms build_problem actually used energy_backend.
    from foldq.encodings.stem_encoding import build_stem_qubo

    stems = list(result.problem.variable_map)
    expected = build_stem_qubo(record.sequence, stems, pipeline.energy_backend)
    assert result.problem.linear == expected.linear


def test_cli_doctor_reports_the_environment():
    result = runner.invoke(app, ["doctor"])
    assert result.exit_code == 0
    assert "ViennaRNA" in result.stdout


def test_cli_validate_accepts_and_rejects():
    assert runner.invoke(app, ["validate", "--sequence", DEMO]).exit_code == 0
    assert runner.invoke(app, ["validate", "--sequence", "GGXAU"]).exit_code != 0


def test_cli_predict_writes_expected_artifacts(tmp_path):
    result = runner.invoke(
        app,
        ["predict", "--sequence", DEMO, "--solver", "exact", "--output", str(tmp_path)],
    )
    assert result.exit_code == 0
    for name in ("manifest.json", "summary.md"):
        assert (tmp_path / name).exists()
