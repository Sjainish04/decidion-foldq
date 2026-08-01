"""Base-pair compatibility and candidate pair enumeration."""

from __future__ import annotations

from foldq.constants import CANONICAL_PAIRS, DEFAULT_MIN_HAIRPIN, WOBBLE_PAIRS


def can_pair(a: str, b: str, allow_wobble: bool = True) -> bool:
    """True if nucleotides `a` and `b` can form a base pair."""
    if (a, b) in CANONICAL_PAIRS:
        return True
    return allow_wobble and (a, b) in WOBBLE_PAIRS


def candidate_pairs(
    sequence: str,
    *,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> list[tuple[int, int]]:
    """Every (i, j) that could pair while leaving a legal hairpin loop."""
    n = len(sequence)
    return [
        (i, j)
        for i in range(n)
        for j in range(i + min_hairpin + 1, n)
        if can_pair(sequence[i], sequence[j], allow_wobble)
    ]
