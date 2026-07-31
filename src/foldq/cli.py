"""Command-line interface."""

from __future__ import annotations

import json
import platform
import sys
from pathlib import Path

import typer

from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

app = typer.Typer(help="Decidion FoldQ: hybrid quantum-classical RNA structure prediction.")


@app.command()
def doctor() -> None:
    """Check that the environment can run every part of the pipeline."""
    typer.echo(f"Python           {platform.python_version()}")
    for label, module in (
        ("ViennaRNA", "RNA"),
        ("dimod", "dimod"),
        ("dwave-samplers", "dwave.samplers"),
        ("networkx", "networkx"),
        ("Qiskit", "qiskit"),
        ("qiskit-aer", "qiskit_aer"),
    ):
        try:
            __import__(module)
            typer.echo(f"{label:16s} ok")
        except ImportError:
            typer.echo(f"{label:16s} MISSING")
    typer.echo(f"solvers          {', '.join(sorted(SOLVER_REGISTRY))}")


@app.command()
def validate(sequence: str = typer.Option(..., "--sequence")) -> None:
    """Validate an RNA sequence."""
    try:
        record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    except ValueError as error:
        typer.echo(f"invalid: {error}")
        raise typer.Exit(code=1) from error
    typer.echo(f"valid: {record.length} nt, GC {record.gc_content:.1%}, {record.checksum}")


@app.command()
def predict(
    sequence: str = typer.Option(..., "--sequence"),
    solver: str = typer.Option("simulated_annealing", "--solver"),
    config_path: Path | None = typer.Option(None, "--config"),
    output: Path = typer.Option(Path("results/demo"), "--output"),
    seed: int | None = typer.Option(None, "--seed"),
    pseudoknots: bool = typer.Option(False, "--pseudoknots"),
) -> None:
    """Predict a structure and write the run artifacts."""
    config = FoldQConfig.from_yaml(config_path) if config_path else FoldQConfig()
    config = config.merged_with(
        seed=seed, forbid_crossing=False if pseudoknots else None
    )

    record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    result = FoldQPipeline(config).predict(record, solver=solver)

    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "sequence": record.sequence,
        "sequence_checksum": record.checksum,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "config": config.as_dict(),
        "solver": solver,
        "num_variables": result.problem.num_variables,
        "qubo_density": result.problem.density,
        "reference_structure": result.reference.mfe_structure,
        "reference_energy": result.reference.mfe_energy,
        "predicted_structure": result.best_candidate.dot_bracket,
        "predicted_energy": result.best_candidate.vienna_energy,
        "gates": {
            "representable": result.gates.representable,
            "representable_fraction": result.gates.representable_fraction,
            "is_qubo_ground_state": result.gates.is_qubo_ground_state,
            "solver_found_ground_state": result.gates.solver_found_ground_state,
            "energy_gap": result.gates.energy_gap,
            "base_pair_f1": result.gates.base_pair_f1,
            "attribution": result.gates.attribution,
        },
        "runtime_seconds": result.runtime_seconds,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))

    summary = "\n".join(
        [
            f"# FoldQ prediction: {record.sequence_id}",
            "",
            f"Sequence      {record.sequence}",
            f"ViennaRNA MFE {result.reference.mfe_structure}  {result.reference.mfe_energy:.2f} kcal/mol",
            f"FoldQ         {result.best_candidate.dot_bracket}  {result.best_candidate.vienna_energy:.2f} kcal/mol",
            "",
            f"Solver        {solver} ({result.problem.num_variables} variables, "
            f"density {result.problem.density:.2f})",
            f"Base-pair F1  {result.gates.base_pair_f1:.3f}",
            f"Energy gap    {result.gates.energy_gap:.2f} kcal/mol",
            f"Attribution   {result.gates.attribution}",
        ]
    )
    (output / "summary.md").write_text(summary + "\n")
    typer.echo(summary)


@app.command()
def generate(
    count: int = typer.Option(10, "--count"),
    lengths: str = typer.Option("20,30", "--lengths"),
    seed: int = typer.Option(42, "--seed"),
    output: Path = typer.Option(Path("data/raw/synthetic/set.csv"), "--output"),
) -> None:
    """Generate a benchmark set of sequences that actually fold."""
    import csv

    from foldq.classical.vienna import ViennaBackend
    from foldq.data.generate import generate_benchmark_set

    parsed = [int(value) for value in lengths.split(",")]
    records = generate_benchmark_set(parsed, count, seed=seed, backend=ViennaBackend())

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["sequence_id", "sequence", "length", "gc_content"])
        for record in records:
            writer.writerow(
                [record.sequence_id, record.sequence, record.length, f"{record.gc_content:.3f}"]
            )
    typer.echo(f"wrote {len(records)} sequences to {output}")


@app.command()
def benchmark(
    dataset: Path = typer.Option(..., "--dataset"),
    solvers: str = typer.Option("greedy,simulated_annealing", "--solvers"),
    output: Path = typer.Option(Path("results/benchmark"), "--output"),
) -> None:
    """Run several solvers over a dataset and write a comparison table."""
    import csv

    names = [name.strip() for name in solvers.split(",")]
    pipeline = FoldQPipeline(FoldQConfig())

    rows = []
    with dataset.open() as handle:
        for entry in csv.DictReader(handle):
            record = SequenceRecord(
                sequence_id=entry["sequence_id"],
                sequence=entry["sequence"],
                source_type="synthetic",
            )
            for name in names:
                result = pipeline.predict(record, solver=name)
                rows.append(
                    {
                        "sequence_id": record.sequence_id,
                        "length": record.length,
                        "solver": name,
                        "num_variables": result.problem.num_variables,
                        "base_pair_f1": f"{result.gates.base_pair_f1:.4f}",
                        "energy_gap": f"{result.gates.energy_gap:.4f}",
                        "attribution": result.gates.attribution,
                        "runtime_seconds": f"{result.runtime_seconds:.4f}",
                    }
                )

    output.mkdir(parents=True, exist_ok=True)
    target = output / "benchmark.csv"
    with target.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    typer.echo(f"wrote {len(rows)} rows to {target}")


@app.command()
def report(
    sequence: str = typer.Option(..., "--sequence"),
    solver: str = typer.Option("simulated_annealing", "--solver"),
    output: Path = typer.Option(Path("results/demo/decision-card.html"), "--output"),
) -> None:
    """Render an explainable decision card for one prediction."""
    from foldq.reporting.decision_card import render_decision_card

    record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    result = FoldQPipeline(FoldQConfig()).predict(record, solver=solver)
    path = render_decision_card(result, output)
    typer.echo(f"wrote decision card to {path}")


if __name__ == "__main__":
    sys.exit(app())
