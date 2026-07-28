"""The ViennaRNA boundary.

Two conversions live here and nowhere else in the codebase:
  * ViennaRNA indices are 1-based; ours are 0-based.
  * ViennaRNA `eval_*` helpers return dekacal/mol; we work in kcal/mol.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import RNA

from foldq.constants import DEKACAL_PER_KCAL, DEFAULT_TEMPERATURE_C
from foldq.schemas.structure import Stem


@dataclass(frozen=True)
class ViennaReference:
    """The classical thermodynamic reference for one sequence."""

    sequence: str
    mfe_structure: str
    mfe_energy: float
    base_pairs: frozenset[tuple[int, int]]


def dotbracket_to_pairs(structure: str) -> frozenset[tuple[int, int]]:
    """Parse dot-bracket into 0-based (i, j) pairs with i < j."""
    stack: list[int] = []
    pairs: set[tuple[int, int]] = set()
    for idx, char in enumerate(structure):
        if char == "(":
            stack.append(idx)
        elif char == ")":
            if not stack:
                raise ValueError(f"unbalanced dot-bracket at position {idx}")
            pairs.add((stack.pop(), idx))
    if stack:
        raise ValueError(f"unbalanced dot-bracket: {len(stack)} unclosed pair(s)")
    return frozenset(pairs)


class ViennaBackend:
    """Thin, cached wrapper over the ViennaRNA Python bindings."""

    def __init__(
        self,
        temperature_celsius: float = DEFAULT_TEMPERATURE_C,
        no_lonely_pairs: bool = False,
    ) -> None:
        self.temperature_celsius = temperature_celsius
        self.no_lonely_pairs = no_lonely_pairs

    def _model(self) -> RNA.md:
        model = RNA.md()
        model.temperature = self.temperature_celsius
        if self.no_lonely_pairs:
            model.noLP = 1
        return model

    @lru_cache(maxsize=512)
    def _compound(self, sequence: str) -> RNA.fold_compound:
        return RNA.fold_compound(sequence, self._model())

    def fold(self, sequence: str) -> ViennaReference:
        """Minimum-free-energy fold."""
        structure, energy = self._compound(sequence).mfe()
        return ViennaReference(
            sequence=sequence,
            mfe_structure=structure,
            mfe_energy=float(energy),
            base_pairs=dotbracket_to_pairs(structure),
        )

    def eval_structure(self, sequence: str, dot_bracket: str) -> float:
        """Turner free energy of an arbitrary structure, in kcal/mol."""
        if len(sequence) != len(dot_bracket):
            raise ValueError(
                f"structure length {len(dot_bracket)} != sequence length {len(sequence)}"
            )
        return float(self._compound(sequence).eval_structure(dot_bracket))

    def stack_energy(self, sequence: str, stem: Stem) -> float:
        """Nearest-neighbour stacking energy of a helix, in kcal/mol.

        Zero for a single-pair stem, which has nothing to stack against.
        """
        compound = self._compound(sequence)
        pairs = stem.pairs()
        total = 0.0
        for outer, inner in zip(pairs, pairs[1:]):
            total += compound.eval_int_loop(
                outer[0] + 1, outer[1] + 1, inner[0] + 1, inner[1] + 1
            )
        return total / DEKACAL_PER_KCAL

    def hairpin_energy(self, sequence: str, stem: Stem) -> float:
        """Cost of closing a hairpin loop with this helix's innermost pair."""
        inner_i, inner_j = stem.inner_pair
        return self._compound(sequence).eval_hp_loop(inner_i + 1, inner_j + 1) / DEKACAL_PER_KCAL

    def interior_energy(self, sequence: str, outer: Stem, inner: Stem) -> float:
        """Interior-loop / bulge cost between an outer helix and one nested inside it."""
        oi, oj = outer.inner_pair
        ii, ij = inner.outer_pair
        return self._compound(sequence).eval_int_loop(oi + 1, oj + 1, ii + 1, ij + 1) / (
            DEKACAL_PER_KCAL
        )

    def partition_function(self, sequence: str) -> tuple[str, float]:
        """Ensemble free energy and centroid structure."""
        compound = self._compound(sequence)
        _, ensemble_energy = compound.pf()
        centroid, _ = compound.centroid()
        return centroid, float(ensemble_energy)
