"""Render a self-contained, explainable folding decision card."""

from __future__ import annotations

import math
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = Path(__file__).parent / "templates"


def _tri_state(value: bool | None) -> tuple[str, str]:
    if value is None:
        return "na", "indeterminate (instance too large for exact ground truth)"
    return ("pass", "yes") if value else ("fail", "no")


def render_decision_card(result, output: Path) -> Path:
    """Write one HTML card describing a single prediction end to end."""
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = environment.get_template("decision_card.html.j2")

    gate_b_class, gate_b_text = _tri_state(result.gates.is_qubo_ground_state)
    gate_c_class, gate_c_text = _tri_state(result.gates.solver_found_ground_state)
    predicted_energy = result.best_candidate.vienna_energy
    energy_text = (
        "not scorable (crossing pairs)"
        if math.isnan(predicted_energy)
        else f"{predicted_energy:.2f} kcal/mol"
    )

    html = template.render(
        sequence_id=result.record.sequence_id,
        sequence=result.record.sequence,
        reference_structure=result.reference.mfe_structure,
        reference_energy=result.reference.mfe_energy,
        predicted_structure=result.best_candidate.dot_bracket,
        predicted_energy=energy_text,
        is_pseudoknotted=result.best_candidate.is_pseudoknotted,
        representable=result.gates.representable,
        representable_fraction=result.gates.representable_fraction,
        gate_b_class=gate_b_class,
        gate_b_text=gate_b_text,
        gate_c_class=gate_c_class,
        gate_c_text=gate_c_text,
        base_pair_f1=result.gates.base_pair_f1,
        energy_gap=result.gates.energy_gap,
        attribution=result.gates.attribution,
        stems=result.best_candidate.stems,
        solver=result.metadata["solver"],
        num_variables=result.problem.num_variables,
        qubo_density=result.problem.density,
        repair_count=len(result.best_candidate.repairs),
        runtime_seconds=result.runtime_seconds,
        seed=result.metadata["config"]["seed"],
        exact_max_variables=result.metadata["config"]["exact_max_variables"],
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    return output
