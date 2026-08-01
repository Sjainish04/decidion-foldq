"""`make reproduce` entry point: run every experiment into one output directory."""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
from pathlib import Path

from foldq.experiments import (
    e1_formulation,
    e2_encoding,
    e3_solvers,
    e5_pseudoknot,
)

EXPERIMENTS = [e1_formulation, e2_encoding, e3_solvers, e5_pseudoknot]


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run every FoldQ experiment.")
    parser.add_argument("--output", type=Path, default=Path("results"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--quick", action="store_true", help="reduced sweep for CI")
    args = parser.parse_args()

    modules = list(EXPERIMENTS)
    try:
        from foldq.experiments import e4_qaoa

        modules.insert(3, e4_qaoa)
    except ImportError:
        print("qiskit not installed; skipping E4 (QAOA)")

    args.output.mkdir(parents=True, exist_ok=True)
    summary = {}
    for module in modules:
        print(f"running {module.NAME} ...")
        frame = module.run(args.output, seed=args.seed, quick=args.quick)
        summary[module.NAME] = {"rows": len(frame), "columns": list(frame.columns)}

    manifest = {
        "git_commit": _git_commit(),
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "seed": args.seed,
        "quick": args.quick,
        "experiments": summary,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"wrote results to {args.output}")


if __name__ == "__main__":
    main()
