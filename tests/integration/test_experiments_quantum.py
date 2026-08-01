"""E4 (QAOA study), E5 (pseudoknot reach), and the `run_all` reproduce entry point."""

from __future__ import annotations

import json
import math
import sys

import pandas as pd
import pytest

pytest.importorskip("qiskit_aer")

from foldq.experiments import e4_qaoa, e5_pseudoknot, run_all  # noqa: E402

# --- E4: QAOA study --------------------------------------------------------


def test_e4_runs_and_writes_a_table(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    assert isinstance(frame, pd.DataFrame) and not frame.empty
    assert (tmp_path / "e4_qaoa.csv").exists()


def test_e4_varies_depth_and_objective(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    assert frame["reps"].nunique() >= 2
    assert set(frame["objective"].unique()) >= {"expectation", "cvar"}


def test_e4_records_quantum_resources(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    for column in ("logical_qubits", "two_qubit_gates", "circuit_depth", "hamiltonian_terms"):
        assert column in frame.columns


def test_e4_records_multi_qubit_gates_and_transpilation_columns(tmp_path):
    """MANDATORY CORRECTION 3: `ResourceReport.multi_qubit_gates` must reach the
    table -- a non-zero value would mean the ansatz decomposition never reached
    the target gate basis, which is the whole point of reporting it. It should
    read zero on every row here (decomposed QAOA ansatz, no 3+-qubit gates).
    `transpiled_depth`/`swap_gates` are what would let a reader see the
    fake_hanoi routing overhead, rather than it being silently absent from
    the table entirely.
    """
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    for column in ("multi_qubit_gates", "transpiled_depth", "swap_gates"):
        assert column in frame.columns
    assert (frame["multi_qubit_gates"] == 0).all()


def test_e4_noise_row_actually_transpiles_onto_the_target_backend(tmp_path):
    """The fake_hanoi row must reflect a real device-mapped circuit, not just
    mirror the pre-transpile ideal numbers -- otherwise the module docstring's
    routing-overhead claim would not be backed by this table's own data.
    """
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    for sequence_id, group in frame.groupby("sequence_id"):
        noisy = group[group["noise_backend"] == e4_qaoa.NOISE_BACKEND]
        assert len(noisy) == 1
        matched_ideal = group[
            (group["noise_backend"] == "none")
            & (group["objective"] == "expectation")
            & (group["reps"] == noisy["reps"].iloc[0])
            & (group["shots"] == noisy["shots"].iloc[0])
        ]
        assert len(matched_ideal) == 1
        # Same problem, same reps -- circuit_depth (pre-transpile) must agree.
        assert noisy["circuit_depth"].iloc[0] == matched_ideal["circuit_depth"].iloc[0]
        # But the *transpiled* numbers must show real routing/basis-translation cost.
        assert noisy["transpiled_depth"].iloc[0] > noisy["circuit_depth"].iloc[0]
        assert noisy["two_qubit_gates"].iloc[0] > matched_ideal["two_qubit_gates"].iloc[0]


# --- E5: pseudoknot reach ---------------------------------------------------


def test_e5_runs_on_curated_pseudoknots(tmp_path):
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    assert not frame.empty
    assert frame["has_pseudoknot"].any()


def test_e5_compares_crossing_modes(tmp_path):
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    assert set(frame["forbid_crossing"].unique()) == {True, False}


def test_e5_records_vienna_inability_on_pseudoknots(tmp_path):
    """The Tier P claim, captured as data rather than prose."""
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    pk_rows = frame[frame["has_pseudoknot"]]
    assert (pk_rows["vienna_recovers_crossing_pairs"] == False).all()  # noqa: E712


def test_e5_pseudoknot_mode_recovers_more_than_strict_mode(tmp_path):
    """The submission's headline result: disabling the crossing penalty must
    recover strictly more of each curated pseudoknot's reference base pairs
    than strict (nested-only) mode does, on every curated pseudoknot.
    """
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    pk_rows = frame[frame["has_pseudoknot"]]
    for sequence_id, group in pk_rows.groupby("sequence_id"):
        strict = group.loc[group["forbid_crossing"], "base_pair_recall"].iloc[0]
        pseudoknot = group.loc[~group["forbid_crossing"], "base_pair_recall"].iloc[0]
        assert pseudoknot > strict, sequence_id


def test_e5_records_candidate_pseudoknot_diagnostics(tmp_path):
    """MANDATORY CORRECTION 1: a pseudoknotted candidate's ViennaRNA energy is
    NaN by construction -- ViennaRNA cannot score a crossing structure -- and
    that is correct data, not a missing measurement.
    `candidate_is_pseudoknotted` is what lets a reader distinguish a
    legitimate NaN from an actual bug.
    """
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    assert "candidate_is_pseudoknotted" in frame.columns
    assert "candidate_vienna_energy" in frame.columns

    pk_candidates = frame[frame["candidate_is_pseudoknotted"]]
    assert not pk_candidates.empty, "expected at least one row to find a crossing solution"
    assert pk_candidates["candidate_vienna_energy"].apply(math.isnan).all()

    non_pk_candidates = frame[~frame["candidate_is_pseudoknotted"]]
    assert not non_pk_candidates.empty
    assert not non_pk_candidates["candidate_vienna_energy"].apply(math.isnan).any()


def test_e5_nan_candidate_energies_do_not_break_aggregation(tmp_path):
    """MANDATORY CORRECTION 4: NaN-aware aggregation. E5 genuinely produces NaN
    energies (see above); a plain pandas mean must skip them for the
    non-pseudoknot group rather than the presence of any NaN anywhere
    silently propagating.
    """
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    by_candidate_kind = frame.groupby("candidate_is_pseudoknotted")[
        "candidate_vienna_energy"
    ].mean()
    assert math.isfinite(by_candidate_kind.loc[False])


def test_e5_does_not_claim_the_constructed_pseudoknots_are_published(tmp_path):
    """MANDATORY CORRECTION 2: the two curated pseudoknots are constructed for
    this project with no citation claimed (see data/fixtures/curated.json).
    The output must carry that provenance through, not launder it into an
    implied literature source.
    """
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    pk_rows = frame[frame["has_pseudoknot"]]
    assert pk_rows["source"].str.contains("CONSTRUCTED", regex=False).all()
    assert not pk_rows["source"].str.contains("published", case=False, regex=False).any()


def test_e5_module_docstring_does_not_claim_literature_provenance():
    """A durable regression guard for MANDATORY CORRECTION 2: an earlier draft
    of the fixtures file claimed literature provenance for these pseudoknots
    before it was caught. The module docstring is the first thing a reader of
    this file sees and must not reintroduce that claim.
    """
    doc = (e5_pseudoknot.__doc__ or "").lower()
    assert "published structures" not in doc
    assert "constructed" in doc
    assert "substitut" in doc  # "substitute ... before publication"


# --- run_all: the `make reproduce` entry point ------------------------------


def test_run_all_quick_writes_every_experiment_and_a_manifest(tmp_path, monkeypatch):
    output = tmp_path / "results"
    argv = ["run_all", "--quick", "--output", str(output), "--seed", "1"]
    monkeypatch.setattr(sys, "argv", argv)

    run_all.main()

    manifest = json.loads((output / "manifest.json").read_text())
    expected = {"e1_formulation", "e2_encoding", "e3_solvers", "e4_qaoa", "e5_pseudoknot"}
    assert set(manifest["experiments"]) == expected
    assert manifest["quick"] is True
    for name in expected:
        assert (output / f"{name}.csv").exists()
