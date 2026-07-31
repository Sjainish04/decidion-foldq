import pandas as pd
import pytest

from foldq.config import FoldQConfig
from foldq.pipeline import FoldQPipeline
from foldq.reporting.decision_card import render_decision_card
from foldq.reporting.figures import (
    plot_resource_scaling,
    plot_solver_comparison,
    plot_variable_scaling,
)
from foldq.schemas.sequence import SequenceRecord

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def result():
    record = SequenceRecord(sequence_id="demo", sequence=DEMO, source_type="synthetic")
    return FoldQPipeline(FoldQConfig()).predict(record, solver="exact")


def test_decision_card_is_written_and_self_contained(result, tmp_path):
    path = render_decision_card(result, tmp_path / "card.html")
    assert path.exists()
    html = path.read_text()
    assert "<html" in html.lower()
    assert "http://" not in html and "https://" not in html


def test_decision_card_reports_every_required_field(result, tmp_path):
    html = render_decision_card(result, tmp_path / "card.html").read_text()
    for fragment in (
        DEMO,
        result.reference.mfe_structure,
        result.best_candidate.dot_bracket,
        result.gates.attribution,
    ):
        assert fragment in html


def test_decision_card_states_limitations(result, tmp_path):
    html = render_decision_card(result, tmp_path / "card.html").read_text()
    assert "Limitations" in html
    assert "advantage" not in html.lower() or "no quantum-advantage" in html.lower()


def test_decision_card_reports_pseudoknot_status(result, tmp_path):
    html = render_decision_card(result, tmp_path / "card.html").read_text()
    assert "pseudoknot" in html.lower()


def test_figures_are_written(tmp_path):
    scaling = pd.DataFrame(
        {
            "length": [20, 30, 40, 50],
            "num_variables": [5, 14, 22, 41],
            "stem_mode": ["maximal"] * 4,
            "qubo_density": [0.8, 0.82, 0.77, 0.65],
        }
    )
    assert plot_variable_scaling(scaling, tmp_path / "scaling.png").exists()

    solvers = pd.DataFrame(
        {
            "solver": ["greedy", "greedy", "simulated_annealing", "simulated_annealing"],
            "base_pair_f1": [0.6, 0.7, 0.9, 0.95],
            "energy_gap": [2.0, 1.5, 0.2, 0.1],
        }
    )
    assert plot_solver_comparison(solvers, tmp_path / "solvers.png").exists()

    resources = pd.DataFrame(
        {
            "logical_qubits": [5, 8, 14],
            "two_qubit_gates": [20, 56, 182],
            "circuit_depth": [10, 22, 60],
            "reps": [1, 1, 1],
        }
    )
    assert plot_resource_scaling(resources, tmp_path / "resources.png").exists()
