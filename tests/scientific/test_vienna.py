# tests/scientific/test_vienna.py
import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_fold_matches_known_reference(backend):
    ref = backend.fold(DEMO)
    assert ref.mfe_structure == "(((....)))."
    assert ref.mfe_energy == pytest.approx(-3.70, abs=0.01)
    assert ref.base_pairs == frozenset({(0, 9), (1, 8), (2, 7)})


def test_eval_structure_agrees_with_fold_energy(backend):
    ref = backend.fold(DEMO)
    assert backend.eval_structure(DEMO, ref.mfe_structure) == pytest.approx(
        ref.mfe_energy, abs=0.01
    )


def test_stack_energy_is_in_kcal_not_dekacal(backend):
    """Regression guard: dekacal values are ~100x too large."""
    stem = Stem(i=0, j=9, k=3)
    energy = backend.stack_energy(DEMO, stem)
    assert -20.0 < energy < 0.0, f"{energy} looks like dekacal/mol, not kcal/mol"


def test_hairpin_energy_is_positive_and_small(backend):
    """Loop entropy costs energy, and in kcal/mol it is single digits."""
    stem = Stem(i=0, j=9, k=3)
    energy = backend.hairpin_energy(DEMO, stem)
    assert 0.0 < energy < 20.0


def test_stack_plus_hairpin_reconstructs_vienna_energy():
    """For a lone hairpin under dangles=0, stacking + closure IS the whole energy.

    This is the acceptance test for both unit and index conversions: it fails if
    any eval_* call is missing its +1 or its /100.0.

    It requires dangles=0 because ViennaRNA's default dangles=2 model adds
    dangling-end bonuses on unpaired nucleotides adjacent to a helix. Those terms
    live on unpaired context rather than on stems, so a stem-indexed QUBO with only
    1-body and 2-body terms cannot represent them. See
    test_dangles_gap_is_measured_not_hidden for the size of that term.
    """
    backend = ViennaBackend(dangles=0)
    stem = Stem(i=0, j=9, k=3)
    total = backend.stack_energy(DEMO, stem) + backend.hairpin_energy(DEMO, stem)
    assert total == pytest.approx(backend.fold(DEMO).mfe_energy, abs=0.01)


def test_dangles_gap_is_measured_not_hidden():
    """Quantify what the stem-additive surrogate cannot represent under dangles=2.

    The default model contributes an exterior-loop dangling-end term that no
    combination of stem 1-body and 2-body coefficients can express. Recording it
    here means the surrogate's known blind spot is asserted, not discovered later.
    """
    stem = Stem(i=0, j=9, k=3)
    standard = ViennaBackend(dangles=2)
    additive = standard.stack_energy(DEMO, stem) + standard.hairpin_energy(DEMO, stem)
    gap = additive - standard.fold(DEMO).mfe_energy
    assert gap == pytest.approx(1.20, abs=0.01)

    exact = ViennaBackend(dangles=0)
    assert (
        exact.stack_energy(DEMO, stem)
        + exact.hairpin_energy(DEMO, stem)
        - exact.fold(DEMO).mfe_energy
    ) == pytest.approx(0.0, abs=0.01)


def test_single_pair_stem_has_zero_stacking(backend):
    assert backend.stack_energy(DEMO, Stem(i=0, j=9, k=1)) == pytest.approx(0.0)


def test_interior_energy_between_nested_stems():
    seq = "GGGCAUAAAAGCUUUUGCCC"
    backend = ViennaBackend()
    outer, inner = Stem(i=0, j=19, k=3), Stem(i=4, j=15, k=2)
    energy = backend.interior_energy(seq, outer, inner)
    assert -20.0 < energy < 20.0
