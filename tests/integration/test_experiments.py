import pandas as pd
import pytest

from foldq.experiments import e1_formulation, e2_encoding, e3_solvers


@pytest.mark.parametrize("module", [e1_formulation, e2_encoding, e3_solvers])
def test_experiment_runs_and_writes_a_table(module, tmp_path):
    frame = module.run(tmp_path, seed=1, quick=True)
    assert isinstance(frame, pd.DataFrame)
    assert not frame.empty
    assert (tmp_path / f"{module.NAME}.csv").exists()


def test_e1_reports_both_energy_models(tmp_path):
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    assert set(frame["energy_model"].unique()) >= {"stacking_only", "charge_refund"}


def test_e1_records_gate_a_and_b(tmp_path):
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    for column in ("representable", "representable_fraction", "is_qubo_ground_state"):
        assert column in frame.columns


def test_e2_compares_pair_maximal_and_substems(tmp_path):
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    assert set(frame["stem_mode"].unique()) == {"pair", "maximal", "substems"}
    assert set(frame["encoding"].unique()) == {"pair", "stem"}
    assert "num_variables" in frame.columns and "qubo_density" in frame.columns


def test_e2_substems_produce_more_variables_than_maximal(tmp_path):
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    grouped = frame.groupby("stem_mode")["num_variables"].mean()
    assert grouped["substems"] >= grouped["maximal"]


def test_e2_quantifies_the_rq2_compression_claim(tmp_path):
    """RQ2: stem encoding must use fewer variables than pair encoding."""
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    grouped = frame.groupby("encoding")["num_variables"].mean()
    assert grouped["stem"] < grouped["pair"]


def test_e3_covers_every_registered_classical_solver(tmp_path):
    frame = e3_solvers.run(tmp_path, seed=1, quick=True)
    assert {"random", "greedy", "simulated_annealing", "tabu"} <= set(frame["solver"].unique())


def test_e3_records_the_attribution_for_every_row(tmp_path):
    frame = e3_solvers.run(tmp_path, seed=1, quick=True)
    assert frame["attribution"].notna().all()


# --- Mandatory additions (task-20 defects/measurements) -------------------


def test_e1_reports_penalty_conditioning_columns(tmp_path):
    """MANDATORY ADDITION 1: penalty sufficiency must be a measured column,
    not an assumption -- see calibrate_penalty's `2 * max|E_s| + 1` bound,
    which does not formally cover accumulated refund terms.
    """
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    for column in ("coefficient_range", "condition_ratio", "optimum_is_valid"):
        assert column in frame.columns
    # Both are non-negative by construction (differences/ratios of absolute values).
    assert (frame["coefficient_range"] >= 0).all()
    assert (frame["condition_ratio"].dropna() >= 0).all()


def test_e1_ablates_nesting_policy_for_charge_refund(tmp_path):
    """MANDATORY ADDITION 2: nesting_policy is a real experimental variable.

    charge_refund must be measured under both all_nestable and immediate_only
    (the difference between invalid and valid optima at scale); stacking_only
    has no refund terms, so nesting_policy cannot affect it and is measured
    once, under all_nestable, rather than duplicated.
    """
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    charge_refund_policies = set(
        frame.loc[frame["energy_model"] == "charge_refund", "nesting_policy"].unique()
    )
    assert charge_refund_policies == {"all_nestable", "immediate_only"}
    stacking_only_policies = set(
        frame.loc[frame["energy_model"] == "stacking_only", "nesting_policy"].unique()
    )
    assert stacking_only_policies == {"all_nestable"}


def test_e2_min_stem_length_ablation_includes_one(tmp_path):
    """MANDATORY ADDITION 3: the lone-pair hypothesis needs min_stem_length=1
    actually exercised, not just (2, 3) -- Gate A's 3-of-4 failures at n=40
    were lone base pairs that min_stem_length=2 structurally excludes.
    """
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    stem_rows = frame[frame["encoding"] == "stem"]
    assert 1 in set(stem_rows["min_stem_length"])


def test_e2_lower_min_stem_length_never_reduces_representable_fraction(tmp_path):
    """The lone-pair hypothesis, made non-flaky: generate_maximal_stems computes
    each seed's helix length `k` independently of min_stem_length, which is
    purely a post-hoc keep/drop filter on that k. So shrinking min_stem_length
    can only ever add candidate stems for the same sequence and stem_mode,
    never remove one -- representable_fraction is therefore guaranteed
    non-increasing as min_stem_length grows, not just usually so.
    """
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    stem_rows = frame[frame["encoding"] == "stem"]
    for _key, group in stem_rows.groupby(["sequence_id", "stem_mode"]):
        ordered = group.sort_values("min_stem_length")["representable_fraction"].tolist()
        assert all(a >= b - 1e-9 for a, b in zip(ordered, ordered[1:]))


def test_e2_lower_min_stem_length_costs_variables(tmp_path):
    """The other half of the hypothesis: closing the Gate A ceiling this way
    is not free. Same monotonicity argument as above, applied to variable count.
    """
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    stem_rows = frame[frame["encoding"] == "stem"]
    for _key, group in stem_rows.groupby(["sequence_id", "stem_mode"]):
        ordered = group.sort_values("min_stem_length")["num_variables"].tolist()
        assert all(a >= b for a, b in zip(ordered, ordered[1:]))
