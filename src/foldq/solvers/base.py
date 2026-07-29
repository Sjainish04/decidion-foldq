"""The single interface every solver implements.

Keeping one Protocol is what makes the comparison fair: no solver gets private
preprocessing, and every result flows through the same decode/repair/rescore path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import SolverResult


@dataclass(frozen=True)
class SolverConfig:
    """Runtime knobs. Every stochastic solver must honour `seed`."""

    num_reads: int = 100
    seed: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class FoldSolver(Protocol):
    name: str

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult: ...
