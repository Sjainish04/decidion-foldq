"""Candidate helix (stem) generation.

Maximal helices are the primary encoding: they cannot be extended outward, which
compresses the variable count roughly 4x versus enumerating every sub-helix.
"""

from __future__ import annotations

from foldq.biology.pairs import can_pair
from foldq.constants import DEFAULT_MIN_HAIRPIN, DEFAULT_MIN_STEM_LENGTH
from foldq.schemas.structure import Stem


def generate_maximal_stems(
    sequence: str,
    *,
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> list[Stem]:
    """All helices that cannot be extended by one more pair on the outside.

    A helix seeded at (i, j) is only kept if (i-1, j+1) cannot pair; otherwise it
    is a sub-helix of a longer one and would be reported twice.
    """
    n = len(sequence)
    found: set[Stem] = set()

    for i in range(n):
        for j in range(i + min_hairpin + 1, n):
            if not can_pair(sequence[i], sequence[j], allow_wobble):
                continue
            # Skip non-maximal seeds: this helix extends outward, so a longer one exists.
            if i > 0 and j < n - 1 and can_pair(sequence[i - 1], sequence[j + 1], allow_wobble):
                continue
            k = 0
            # Extend inward while the next pair is legal and leaves a valid hairpin.
            while j - i - 2 * k >= min_hairpin + 1 and can_pair(
                sequence[i + k], sequence[j - k], allow_wobble
            ):
                k += 1
            if k >= min_stem_length:
                found.add(Stem(i=i, j=j, k=k))

    return sorted(found)


def expand_substems(
    stems: list[Stem],
    *,
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
) -> list[Stem]:
    """Every contiguous sub-helix of every input helix.

    Raises representability (the true fold may need a truncated helix) at the cost
    of roughly 4x more variables.
    """
    out: set[Stem] = set()
    for stem in stems:
        for offset in range(stem.k):
            for length in range(min_stem_length, stem.k - offset + 1):
                inner_i = stem.i + offset + length - 1
                inner_j = stem.j - offset - length + 1
                if inner_j - inner_i - 1 < min_hairpin:
                    continue
                out.add(Stem(i=stem.i + offset, j=stem.j - offset, k=length))
    return sorted(out)
