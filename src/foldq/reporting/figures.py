"""Publication figures. Matplotlib only, no interactive dependencies."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def _save(figure, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output, dpi=150)
    plt.close(figure)
    return output


def plot_variable_scaling(frame, output: Path) -> Path:
    """Binary variables versus sequence length, split by encoding."""
    figure, axis = plt.subplots(figsize=(6, 4))
    for mode, group in frame.groupby("stem_mode"):
        aggregated = group.groupby("length")["num_variables"].mean()
        axis.plot(aggregated.index, aggregated.to_numpy(), marker="o", label=mode)
    axis.set_xlabel("sequence length (nt)")
    axis.set_ylabel("binary variables")
    axis.set_title("Encoding size versus sequence length")
    axis.legend()
    axis.grid(alpha=0.3)
    return _save(figure, output)


def plot_solver_comparison(frame, output: Path) -> Path:
    """Base-pair F1 and energy gap per solver."""
    figure, (left, right) = plt.subplots(1, 2, figsize=(10, 4))
    order = sorted(frame["solver"].unique())
    positions = range(1, len(order) + 1)
    # Set tick labels via set_xticklabels rather than boxplot(..., labels=...) /
    # boxplot(..., tick_labels=...): the keyword was renamed between matplotlib
    # 3.8 (labels) and 3.11 (tick_labels, with labels removed), and this project
    # only pins matplotlib>=3.8, so neither spelling is safe to hardcode.
    left.boxplot([frame[frame.solver == name]["base_pair_f1"] for name in order])
    left.set_xticks(list(positions))
    left.set_xticklabels(order, rotation=45)
    left.set_ylabel("base-pair F1")
    left.set_title("Structural accuracy")
    right.boxplot([frame[frame.solver == name]["energy_gap"] for name in order])
    right.set_xticks(list(positions))
    right.set_xticklabels(order, rotation=45)
    right.set_ylabel("energy gap (kcal/mol)")
    right.set_title("Thermodynamic gap from MFE")
    for axis in (left, right):
        axis.grid(alpha=0.3)
    return _save(figure, output)


def plot_resource_scaling(frame, output: Path) -> Path:
    """Two-qubit gates and circuit depth versus logical qubit count."""
    figure, axis = plt.subplots(figsize=(6, 4))
    aggregated = frame.groupby("logical_qubits")[["two_qubit_gates", "circuit_depth"]].mean()
    axis.plot(aggregated.index, aggregated["two_qubit_gates"], marker="o", label="two-qubit gates")
    axis.plot(aggregated.index, aggregated["circuit_depth"], marker="s", label="circuit depth")
    axis.set_xlabel("logical qubits")
    axis.set_ylabel("count")
    axis.set_yscale("log")
    axis.set_title("QAOA resource scaling")
    axis.legend()
    axis.grid(alpha=0.3)
    return _save(figure, output)
