# tests/scientific/test_vienna.py
import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"

# DEMO with its trailing, unpaired 3' U dropped. DEMO's MFE fold leaves that
# base dangling outside the (0, 9) stem, in the exterior loop; ViennaRNA's
# default (dangles=2) model then charges a dangling-end term (confirmed via
# fc.eval_structure_verbose: "External loop: -120" dekacal/mol) that neither
# eval_int_loop nor eval_hp_loop can see, since both are loop-local. That
# extra term is real physics, not a units/index bug -- but it breaks the
# "stack + hairpin == whole structure" identity for DEMO specifically. Here,
# the stem consumes the entire sequence (no dangling tail), so the identity
# holds exactly under the same default model. See task-3-report.md for the
# full diagnosis (raw-API cross-check and eval_structure_verbose output).
HAIRPIN_ONLY = "GGGAAAUCCC"


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
    assert backend.eval_structure(DEMO, ref.mfe_structure) == pytest.approx(ref.mfe_energy, abs=0.01)


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


def test_stack_plus_hairpin_reconstructs_vienna_energy(backend):
    """For a lone hairpin, stacking + closure IS the whole structure energy.

    Uses HAIRPIN_ONLY rather than DEMO: DEMO's MFE structure leaves one base
    dangling outside the stem, which adds an exterior-loop dangling-end term
    that stack_energy/hairpin_energy cannot see (they only evaluate loop-
    local energies). HAIRPIN_ONLY's stem consumes the whole sequence, so
    there is no such term and the identity holds exactly.
    """
    stem = Stem(i=0, j=9, k=3)
    total = backend.stack_energy(HAIRPIN_ONLY, stem) + backend.hairpin_energy(HAIRPIN_ONLY, stem)
    assert total == pytest.approx(backend.fold(HAIRPIN_ONLY).mfe_energy, abs=0.01)


def test_single_pair_stem_has_zero_stacking(backend):
    assert backend.stack_energy(DEMO, Stem(i=0, j=9, k=1)) == pytest.approx(0.0)


def test_interior_energy_between_nested_stems():
    seq = "GGGCAUAAAAGCUUUUGCCC"
    backend = ViennaBackend()
    outer, inner = Stem(i=0, j=19, k=3), Stem(i=4, j=15, k=2)
    energy = backend.interior_energy(seq, outer, inner)
    assert -20.0 < energy < 20.0
