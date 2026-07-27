"""Structural primitives: stems, validation reports, repair operations."""

from __future__ import annotations

from dataclasses import dataclass, field

from foldq.constants import DEFAULT_MIN_HAIRPIN


@dataclass(frozen=True, order=True)
class Stem:
    """A stacked helix of `k` consecutive base pairs starting at the pair (i, j).

    Pairs are (i, j), (i+1, j-1), ..., (i+k-1, j-k+1). Indices are 0-based.
    """

    i: int
    j: int
    k: int

    def __post_init__(self) -> None:
        if self.k < 1:
            raise ValueError("a stem must contain at least one pair")
        if self.i < 0 or self.j < 0:
            raise ValueError("stem indices must be non-negative")
        if self.i >= self.j:
            raise ValueError(f"stem start {self.i} must precede end {self.j}")
        inner_i, inner_j = self.i + self.k - 1, self.j - self.k + 1
        if inner_i >= inner_j:
            raise ValueError(f"stem strands overlap: k={self.k} too large for span {self.j - self.i}")
        if inner_j - inner_i - 1 < DEFAULT_MIN_HAIRPIN:
            raise ValueError(
                f"stem leaves only {inner_j - inner_i - 1} unpaired bases; "
                f"minimum hairpin is {DEFAULT_MIN_HAIRPIN}"
            )

    def pairs(self) -> tuple[tuple[int, int], ...]:
        return tuple((self.i + t, self.j - t) for t in range(self.k))

    def nucleotides(self) -> frozenset[int]:
        return frozenset(idx for pair in self.pairs() for idx in pair)

    @property
    def outer_pair(self) -> tuple[int, int]:
        return (self.i, self.j)

    @property
    def inner_pair(self) -> tuple[int, int]:
        return (self.i + self.k - 1, self.j - self.k + 1)

    @property
    def span(self) -> int:
        return self.j - self.i + 1


@dataclass(frozen=True)
class ValidationReport:
    """Result of checking a decoded stem set for structural legality."""

    overlapping_pairs: tuple[tuple[int, int], ...] = field(default_factory=tuple)
    crossing_pairs: tuple[tuple[int, int], ...] = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:
        return not self.overlapping_pairs and not self.crossing_pairs

    @property
    def violation_count(self) -> int:
        return len(self.overlapping_pairs) + len(self.crossing_pairs)


@dataclass(frozen=True)
class RepairOp:
    """One deterministic edit made while repairing an invalid structure."""

    action: str
    stem: Stem
    reason: str
