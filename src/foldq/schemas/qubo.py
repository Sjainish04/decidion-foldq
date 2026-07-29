"""QUBO problem representation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import dimod

from foldq.schemas.structure import Stem


@dataclass(frozen=True)
class PenaltyConfig:
    """Hard-constraint penalty weights. `None` means calibrate adaptively."""

    overlap: float | None = None
    crossing: float | None = None
    forbid_crossing: bool = True


@dataclass(frozen=True)
class QuboProblem:
    """A binary quadratic objective plus the biology each variable stands for."""

    linear: dict[int, float]
    quadratic: dict[tuple[int, int], float]
    offset: float
    variable_map: tuple[Stem, ...]
    sequence: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def num_variables(self) -> int:
        return len(self.variable_map)

    @property
    def density(self) -> float:
        n = self.num_variables
        if n < 2:
            return 0.0
        return len(self.quadratic) / (n * (n - 1) / 2)

    def energy(self, bits: Sequence[int]) -> float:
        """Objective value of a bit assignment."""
        if len(bits) != self.num_variables:
            raise ValueError(f"expected {self.num_variables} bits, got {len(bits)}")
        total = self.offset
        total += sum(coeff for idx, coeff in self.linear.items() if bits[idx])
        total += sum(
            coeff for (a, b), coeff in self.quadratic.items() if bits[a] and bits[b]
        )
        return total

    def to_bqm(self) -> dimod.BinaryQuadraticModel:
        """Convert to a dimod model for the Ocean samplers."""
        return dimod.BinaryQuadraticModel(
            dict(self.linear), dict(self.quadratic), self.offset, dimod.BINARY
        )
