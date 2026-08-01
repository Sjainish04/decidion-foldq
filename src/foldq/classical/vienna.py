"""The ViennaRNA boundary.

Two conversions live here and nowhere else in the codebase:
  * ViennaRNA indices are 1-based; ours are 0-based.
  * ViennaRNA `eval_*` helpers return dekacal/mol; we work in kcal/mol.

A third thing lives here too, deliberately made explicit rather than left as
an implicit default: the dangling-end model, `dangles`. `dangles=2` (the
class default) matches standard ViennaRNA/RNAfold behaviour, and is what
`fold()`/`eval_structure()` should normally use. `dangles=0` turns off
dangling-end bonuses on unpaired nucleotides adjacent to a helix, which
makes the energy model exactly additive over loops (whole-structure energy
== sum of each loop's own energy, nothing left over). That additivity is
exactly what the stem-indexed QUBO surrogate assumes -- it has only 1-body
and 2-body terms over stems, with nowhere to put a term that lives on
unpaired context next to a helix rather than on the helix itself. See
`tests/scientific/test_vienna.py::test_dangles_gap_is_measured_not_hidden`
for the measured size of what `dangles=2` adds that the surrogate can't
represent.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import RNA

from foldq.constants import DEFAULT_TEMPERATURE_C, DEKACAL_PER_KCAL
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
        dangles: int = 2,
    ) -> None:
        self.temperature_celsius = temperature_celsius
        self.no_lonely_pairs = no_lonely_pairs
        self.dangles = dangles

    def _model(self) -> RNA.md:
        model = RNA.md()
        model.temperature = self.temperature_celsius
        model.dangles = self.dangles
        if self.no_lonely_pairs:
            model.noLP = 1
        return model

    # Keying on instance identity (not just `sequence`) is deliberate: it is what
    # isolates the dangles=0 backend (energy coefficients) from the dangles=2
    # backend (reference folding and rescoring) so they cannot cross-contaminate
    # through a shared cache. The retained-instance cost is bounded by maxsize
    # and acceptable at this project's scale.
    @lru_cache(maxsize=512)  # noqa: B019 - see note above; instance-keying is required, not incidental
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
        for outer, inner in zip(pairs, pairs[1:], strict=False):
            total += compound.eval_int_loop(outer[0] + 1, outer[1] + 1, inner[0] + 1, inner[1] + 1)
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
