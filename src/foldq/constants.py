"""Project-wide constants and unit conversions."""

from typing import Final

DEKACAL_PER_KCAL: Final[float] = 100.0
"""ViennaRNA eval_* functions return dekacal/mol; divide by this to get kcal/mol."""

CANONICAL_PAIRS: Final[frozenset[tuple[str, str]]] = frozenset(
    {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G")}
)
WOBBLE_PAIRS: Final[frozenset[tuple[str, str]]] = frozenset({("G", "U"), ("U", "G")})
VALID_NUCLEOTIDES: Final[frozenset[str]] = frozenset("AUCG")

DEFAULT_MIN_HAIRPIN: Final[int] = 3
"""A hairpin loop needs at least 3 unpaired bases: pair (i,j) requires j - i - 1 >= 3."""

DEFAULT_MIN_STEM_LENGTH: Final[int] = 2
DEFAULT_TEMPERATURE_C: Final[float] = 37.0
