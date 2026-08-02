"""Validate an experiment sweep's output.

Checks that a run produced usable science, not merely that it produced files.
A sweep that writes five well-formed CSVs full of NaN is a failure this catches
and a file-existence check does not.

Usage:
    python scripts/validate_run.py results/ci
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

# Columns that must never be NaN, per experiment. Columns absent from this map
# are allowed to be NaN, and several legitimately are: `energy_gap` and
# `candidate_vienna_energy` are NaN for a pseudoknotted candidate, because
# ViennaRNA cannot score a structure with crossing pairs, and `found_ground_state`
# is empty wherever an instance exceeded the exact solver's variable ceiling.
REQUIRED_NON_NULL: dict[str, tuple[str, ...]] = {
    "e1_formulation": ("sequence_id", "length", "num_variables", "representable", "attribution"),
    "e2_encoding": ("sequence_id", "length", "encoding", "num_variables", "representable"),
    "e3_solvers": ("sequence_id", "solver", "num_variables", "base_pair_f1", "runtime_seconds"),
    "e4_qaoa": ("sequence_id", "reps", "logical_qubits", "circuit_depth", "two_qubit_gates"),
    "e5_pseudoknot": (
        "sequence_id",
        "has_pseudoknot",
        "forbid_crossing",
        "base_pair_f1_vs_reference",
    ),
}

# A gate fraction or F1 outside [0, 1] means the metric itself is broken.
UNIT_INTERVAL: dict[str, tuple[str, ...]] = {
    "e1_formulation": ("representable_fraction", "base_pair_f1"),
    "e2_encoding": ("representable_fraction", "qubo_density"),
    "e3_solvers": ("base_pair_f1",),
    "e4_qaoa": ("base_pair_f1", "qubo_density"),
    "e5_pseudoknot": ("base_pair_f1_vs_reference", "base_pair_precision", "base_pair_recall"),
}


def fail(message: str) -> None:
    print(f"FAIL {message}")
    sys.exit(1)


def main(directory: Path) -> None:
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        fail(f"no manifest at {manifest_path}")

    manifest = json.loads(manifest_path.read_text())
    for field in ("git_commit", "python_version", "platform", "seed", "experiments"):
        if field not in manifest:
            fail(f"manifest is missing {field!r}")
    if not str(manifest["python_version"]).startswith("3.11"):
        fail(f"expected Python 3.11, manifest says {manifest['python_version']}")

    for name, required in REQUIRED_NON_NULL.items():
        path = directory / f"{name}.csv"
        if not path.exists():
            fail(f"missing {path}")
        frame = pd.read_csv(path)

        if frame.empty:
            fail(f"{name}: no rows")

        declared = manifest["experiments"].get(name, {}).get("rows")
        if declared is not None and declared != len(frame):
            fail(f"{name}: manifest declares {declared} rows, file has {len(frame)}")

        for column in required:
            if column not in frame.columns:
                fail(f"{name}: missing column {column!r}")
            if frame[column].isna().any():
                count = int(frame[column].isna().sum())
                fail(f"{name}: {column!r} has {count} null value(s) and must have none")

        for column in UNIT_INTERVAL.get(name, ()):
            if column not in frame.columns:
                continue
            values = frame[column].dropna()
            if len(values) and not values.between(0.0, 1.0).all():
                bad = values[~values.between(0.0, 1.0)].tolist()[:3]
                fail(f"{name}: {column!r} outside [0,1], e.g. {bad}")

        print(f"ok   {name}: {len(frame)} rows, {len(frame.columns)} columns")

    # The attribution string is the project's central output; a sweep that emits
    # an unrecognised category means the gate logic changed without this knowing.
    known = {
        "no failure",
        "candidate generation",
        "energy model",
        "optimizer",
        "indeterminate",
        "pseudoknotted candidate",
    }
    frame = pd.read_csv(directory / "e1_formulation.csv")
    seen = {str(a).split(":")[0].strip() for a in frame["attribution"]}
    unknown = seen - known
    if unknown:
        fail(f"e1_formulation: unrecognised attribution categories {sorted(unknown)}")
    print(f"ok   attribution categories: {sorted(seen)}")

    # Every CSV present must be declared. Without this a result file added later
    # sits in the directory undescribed -- no row count, no provenance, no commit
    # -- while the manifest still claims to describe the sweep. e6_surrogate.csv
    # was in exactly that state until this check was added.
    on_disk = {path.stem for path in directory.glob("*.csv")}
    declared = set(manifest["experiments"])
    undeclared = on_disk - declared
    if undeclared:
        fail(f"CSV present but absent from the manifest: {sorted(undeclared)}")
    missing = declared - on_disk
    if missing:
        fail(f"manifest declares experiments with no CSV: {sorted(missing)}")
    print(f"ok   manifest covers every CSV present ({len(on_disk)})")

    print(f"\nPASS {directory} is a valid sweep")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(Path(sys.argv[1]))
