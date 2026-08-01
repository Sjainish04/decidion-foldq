"""Conversions between dot-bracket notation, pair lists, and helices."""

from __future__ import annotations

from collections.abc import Iterable

from foldq.classical.vienna import dotbracket_to_pairs
from foldq.schemas.structure import Stem

__all__ = [
    "dotbracket_to_pairs",
    "pairs_to_dotbracket",
    "pairs_to_stems",
    "stems_to_dotbracket",
    "stems_to_pairs",
]


def pairs_to_dotbracket(pairs: Iterable[tuple[int, int]], length: int) -> str:
    """Render 0-based pairs as dot-bracket, rejecting illegal pair sets.

    Only nested (pseudoknot-free) structures are representable; crossing pairs
    cannot be written in single-bracket notation and must be reported separately.
    """
    chars = ["."] * length
    claimed: set[int] = set()
    for i, j in pairs:
        if i < 0 or j < 0:
            raise ValueError(f"pair ({i}, {j}) has a negative index")
        if i >= length or j >= length:
            raise ValueError(f"pair ({i}, {j}) exceeds sequence length {length}")
        if i in claimed or j in claimed:
            raise ValueError(f"nucleotide in pair ({i}, {j}) is paired more than once")
        claimed.update((i, j))
        chars[i], chars[j] = "(", ")"
    return "".join(chars)


def stems_to_pairs(stems: Iterable[Stem]) -> frozenset[tuple[int, int]]:
    """Flatten helices into the set of base pairs they contain."""
    return frozenset(pair for stem in stems for pair in stem.pairs())


def stems_to_dotbracket(stems: Iterable[Stem], length: int) -> str:
    """Render helices as dot-bracket."""
    return pairs_to_dotbracket(stems_to_pairs(stems), length)


def pairs_to_stems(pairs: Iterable[tuple[int, int]]) -> list[Stem]:
    """Group pairs into maximal stacked helices.

    Consecutive pairs (i, j) and (i+1, j-1) belong to the same helix.
    """
    ordered = sorted(pairs)
    if not ordered:
        return []

    claimed: set[int] = set()
    for i, j in ordered:
        if i in claimed or j in claimed:
            raise ValueError(f"nucleotide in pair ({i}, {j}) is paired more than once")
        claimed.update((i, j))

    stems: list[Stem] = []
    start = ordered[0]
    run = 1
    for previous, current in zip(ordered, ordered[1:]):
        if current[0] == previous[0] + 1 and current[1] == previous[1] - 1:
            run += 1
        else:
            stems.append(Stem(i=start[0], j=start[1], k=run))
            start, run = current, 1
    stems.append(Stem(i=start[0], j=start[1], k=run))
    return sorted(stems)
