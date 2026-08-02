"""E7: multivariate analysis of the project's own results.

E1-E6 each answer one question. This asks what the whole body of results says
together: of everything this project can vary, what actually moves the outcome,
what only appears to because it travels with something else, and how much of the
variation the measured features explain at all.

Everything is computed from the committed CSVs, so the output is reproducible
from the repository without re-running any folding.

    python -m foldq.experiments.e7_analysis --output results/full
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

import pandas as pd

from foldq.analysis.drivers import (
    learning_curve,
    marginal_effects,
    out_of_fold_fit,
    pareto_frontier,
    permutation_importance,
)
from foldq.analysis.multivariate import (
    correlation_matrix,
    principal_components,
    standardised_ols,
    variance_inflation,
)

E1_FEATURES = ["length", "num_variables", "qubo_density", "coefficient_range", "condition_ratio"]
# Design factors and instance size only. energy_gap and qubo_energy are OUTCOMES
# of the same run, so predicting F1 from them would be circular -- the model
# would score well by rediscovering that a large gap means a poor structure,
# which is a definition rather than a finding. The solver is one-hot encoded
# because it is the one factor an operator actually chooses.
E3_FEATURES = ["length", "num_variables"]


def build(results: Path) -> dict:
    e1 = pd.read_csv(results / "e1_formulation.csv")
    e2 = pd.read_csv(results / "e2_encoding.csv")
    e3 = pd.read_csv(results / "e3_solvers.csv")

    e1 = e1.assign(gate_b=e1.is_qubo_ground_state.astype(float))

    # One-hot the solver so the forest can use the choice an operator makes,
    # rather than being handed only instance size.
    solver_dummies = pd.get_dummies(e3.solver, prefix="solver").astype(float)
    e3_model = pd.concat([e3, solver_dummies], axis=1)
    e3_model_features = [*E3_FEATURES, *solver_dummies.columns]

    # Encoding trade-off: variable count against representability. The two axes
    # the project actually has to choose between.
    encodings = (
        e2.assign(
            configuration=e2.encoding
            + " "
            + e2.stem_mode.fillna("")
            + " msl="
            + e2.min_stem_length.fillna(0).astype(int).astype(str)
        )
        .groupby("configuration", as_index=False)
        .agg(mean_variables=("num_variables", "mean"), gate_a=("representable", "mean"))
    )

    # Runtime against accuracy, per solver.
    solvers = e3.groupby("solver", as_index=False).agg(
        mean_runtime=("runtime_seconds", "mean"), mean_f1=("base_pair_f1", "mean")
    )

    return {
        "generated_from": "results/full committed CSVs",
        "note": (
            "Computed from committed experiment output, not from a new sweep. "
            "Re-running this reproduces it exactly."
        ),
        "multicollinearity": {
            "note": (
                "VIF above 10 means a predictor is nearly a linear combination of the "
                "others, and its individual coefficient should not be read as an "
                "independent effect."
            ),
            "e1": [
                asdict(v) | {"severity": v.severity} for v in variance_inflation(e1, E1_FEATURES)
            ],
        },
        "correlations": {
            "e1": asdict(correlation_matrix(e1, [*E1_FEATURES, "base_pair_f1"])),
            "e3": asdict(
                correlation_matrix(
                    e3,
                    [
                        "length",
                        "num_variables",
                        "qubo_energy",
                        "vienna_energy",
                        "energy_gap",
                        "base_pair_f1",
                        "runtime_seconds",
                    ],
                )
            ),
        },
        "regression": {
            "note": (
                "Predictors are z-scored, so coefficients are comparable across units "
                "and can be ranked."
            ),
            "f1_on_instance_features": asdict(standardised_ols(e1, "base_pair_f1", E1_FEATURES)),
            "gate_b_on_instance_features": asdict(standardised_ols(e1, "gate_b", E1_FEATURES)),
        },
        "principal_components": {
            "note": "z-scored first, or the structure would just recover the largest raw variance.",
            "e1": asdict(principal_components(e1, E1_FEATURES)),
        },
        "partial_dependence": {
            "note": (
                "E1 is a full factorial sweep, so these marginal means ARE the partial "
                "dependence. No surrogate model is fitted, and none is needed."
            ),
            "gate_b": [
                asdict(e)
                for e in marginal_effects(
                    e1, "gate_b", ["energy_model", "nesting_policy", "overlap_penalty"]
                )
            ],
            "base_pair_f1": [
                asdict(e)
                for e in marginal_effects(
                    e1, "base_pair_f1", ["energy_model", "nesting_policy", "overlap_penalty"]
                )
            ],
        },
        "random_forest": {
            "note": (
                "Predictions are out-of-fold: every point is predicted by a model that "
                "never saw it. An in-sample forest parity plot is near-perfect by "
                "construction and says nothing about generalisation."
            ),
            "f1_from_design_factors": asdict(
                out_of_fold_fit(e3_model, "base_pair_f1", e3_model_features)
            ),
            "importance": [
                asdict(f)
                for f in permutation_importance(e3_model, "base_pair_f1", e3_model_features)
            ],
            "learning_curve": [
                asdict(p) for p in learning_curve(e3_model, "base_pair_f1", e3_model_features)
            ],
        },
        "pareto": {
            "note": "A point is on the frontier when nothing is cheaper and at least as good.",
            "encoding_variables_vs_representability": [
                asdict(p)
                for p in pareto_frontier(
                    encodings, label="configuration", cost="mean_variables", benefit="gate_a"
                )
            ],
            "solver_runtime_vs_accuracy": [
                asdict(p)
                for p in pareto_frontier(
                    solvers, label="solver", cost="mean_runtime", benefit="mean_f1"
                )
            ],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", default="results/full")
    parser.add_argument("--output", default="results/full")
    args = parser.parse_args()

    payload = build(Path(args.results))
    path = Path(args.output) / "e7_analysis.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")

    print(f"wrote {path}")
    regression = payload["regression"]["f1_on_instance_features"]
    print(f"\n  F1 on instance features: R2 {regression['r_squared']:.3f} (n={regression['n']})")
    top = max(regression["coefficients"], key=lambda c: abs(c["beta"]))
    name, beta, p_value = top["name"], top["beta"], top["p_value"]
    print(f"  strongest standardised driver: {name} beta={beta:+.3f} p={p_value:.4g}")
    forest = payload["random_forest"]["f1_from_design_factors"]
    print(f"  out-of-fold random forest: R2 {forest['r2']:.3f}, MAE {forest['mae']:.3f}")
    print("  partial dependence on Gate B:")
    for effect in payload["partial_dependence"]["gate_b"]:
        factor, level, mean, n = (effect[k] for k in ("factor", "level", "mean", "n"))
        print(f"    {factor:16s} {level:14s} {mean:.3f} (n={n})")


if __name__ == "__main__":
    main()
