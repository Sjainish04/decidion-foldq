"""Solver output schemas."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from foldq.schemas.structure import RepairOp, Stem, ValidationReport


@dataclass(frozen=True)
class Sample:
    """One bit assignment returned by a solver."""

    bits: tuple[int, ...]
    energy: float
    num_occurrences: int = 1


@dataclass(frozen=True)
class SolverResult:
    """Everything one solver run produced, before any biological interpretation."""

    solver_name: str
    samples: tuple[Sample, ...]
    runtime_seconds: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.samples:
            raise ValueError(f"solver {self.solver_name!r} returned at least one sample: none")

    @property
    def best(self) -> Sample:
        return min(self.samples, key=lambda sample: sample.energy)

    @property
    def unique_samples(self) -> int:
        return len({sample.bits for sample in self.samples})


@dataclass(frozen=True)
class FoldCandidate:
    """A decoded, validated, repaired, and rescored structure."""

    stems: tuple[Stem, ...]
    dot_bracket: str
    qubo_energy: float
    vienna_energy: float
    validation: ValidationReport
    repairs: tuple[RepairOp, ...] = field(default_factory=tuple)
    was_repaired: bool = False
