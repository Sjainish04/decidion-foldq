import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.encodings.energy import (
    nestable_pairs,
    refund_pair_energy,
    stem_linear_energy,
)
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"
NESTED = "GGGCAUAAAAGCUUUUGCCC"


@pytest.fixture
def backend():
    """dangles=0, not ViennaRNA's dangles=2 default.

    The charge-and-refund construction assumes an energy model that is exactly
    additive over loops (whole-structure energy == sum of each loop's own energy),
    which is what dangles=0 provides. dangles=2 adds dangling-end bonuses on
    unpaired nucleotides adjacent to a helix -- terms that attach to unpaired
    context, not to stems, so a stem-indexed QUBO cannot represent them at any
    setting. Task 3 measured this gap at 1.20 kcal/mol on this same DEMO sequence
    under dangles=2, and exactly 0.00 under dangles=0 (see
    tests/scientific/test_vienna.py::test_dangles_gap_is_measured_not_hidden).
    Without this fixture, test_lone_hairpin_linear_energy_equals_vienna fails: it
    asserts equality within abs=0.01 while the dangles=2 gap is 1.20.
    """
    return ViennaBackend(dangles=0)


def test_linear_energy_is_stacking_plus_hairpin(backend):
    stem = Stem(0, 9, 3)
    expected = backend.stack_energy(DEMO, stem) + backend.hairpin_energy(DEMO, stem)
    assert stem_linear_energy(backend, DEMO, stem) == pytest.approx(expected)


def test_lone_hairpin_linear_energy_equals_vienna(backend):
    """When a helix really does close a hairpin, the linear term is exact."""
    stem = Stem(0, 9, 3)
    assert stem_linear_energy(backend, DEMO, stem) == pytest.approx(
        backend.fold(DEMO).mfe_energy, abs=0.01
    )


def test_refund_cancels_the_hairpin_assumption(backend):
    """The refund must remove exactly the hairpin cost the linear term charged."""
    outer, inner = Stem(0, 19, 3), Stem(4, 15, 2)
    refund = refund_pair_energy(backend, NESTED, outer, inner)
    interior = backend.interior_energy(NESTED, outer, inner)
    hairpin = backend.hairpin_energy(NESTED, outer)
    assert refund == pytest.approx(interior - hairpin)


def test_charge_plus_refund_reconstructs_two_stem_structure(backend):
    """Linear(outer) + linear(inner) + refund(outer,inner) should approximate Vienna."""
    from foldq.biology.dotbracket import stems_to_dotbracket

    outer, inner = Stem(0, 19, 3), Stem(4, 15, 2)
    modelled = (
        stem_linear_energy(backend, NESTED, outer)
        + stem_linear_energy(backend, NESTED, inner)
        + refund_pair_energy(backend, NESTED, outer, inner)
    )
    actual = backend.eval_structure(NESTED, stems_to_dotbracket([outer, inner], len(NESTED)))
    assert modelled == pytest.approx(actual, abs=1.0)


def test_nestable_pairs_finds_outer_inner_relationships():
    stems = [Stem(0, 30, 3), Stem(10, 20, 2)]
    assert nestable_pairs(stems) == [(0, 1)]


def test_nestable_pairs_excludes_disjoint_stems():
    assert nestable_pairs([Stem(0, 9, 2), Stem(20, 29, 2)]) == []


def test_immediate_only_policy_drops_transitive_nesting():
    """A contains B contains C: 'all_nestable' gives 3 pairs, 'immediate_only' gives 2."""
    stems = [Stem(0, 40, 2), Stem(5, 35, 2), Stem(12, 25, 2)]
    assert len(nestable_pairs(stems, policy="all_nestable")) == 3
    assert len(nestable_pairs(stems, policy="immediate_only")) == 2


def test_stacking_only_correlates_with_vienna_on_real_folds():
    """Regression guard on the spec's headline number: r ~= 0.958.

    Uses ViennaBackend() with its standard dangles=2 default, deliberately not the
    dangles=0 `backend` fixture used above. This test measures how well the
    stacking-only surrogate predicts the *standard* ViennaRNA/Turner benchmark --
    the same benchmark the spec's r=0.958 baseline was measured against -- rather
    than the exactly-additive energy model the charge-and-refund construction
    assumes. Switching this to dangles=0 would measure a different, easier
    question and could hide a real regression in surrogate fidelity.

    Measured over 30-100 nt under the default dangles=2 model, matching the range
    the spec's claim was derived from. The range matters: restricted to 30-60 nt
    the statistic falls to ~0.85 and varies by seed, because shorter sequences
    carry fewer stems and noisier energies -- a brittle regression guard that
    would fail spuriously depending on the RNG draw. 30-100 nt reproduces r~=0.958
    with comfortable margin above the 0.85 gate.
    """
    import random

    from foldq.biology.dotbracket import dotbracket_to_pairs, pairs_to_stems

    backend = ViennaBackend()
    random.seed(7)
    modelled, actual = [], []
    for length in (30, 40, 50, 60, 80, 100):
        for _ in range(4):
            for _ in range(400):
                seq = "".join(random.choice("AUCG") for _ in range(length))
                ref = backend.fold(seq)
                if ref.mfe_energy < -0.15 * length:
                    break
            stems = pairs_to_stems(dotbracket_to_pairs(ref.mfe_structure))
            if not stems:
                continue
            modelled.append(sum(backend.stack_energy(seq, s) for s in stems))
            actual.append(ref.mfe_energy)

    mean_m = sum(modelled) / len(modelled)
    mean_a = sum(actual) / len(actual)
    cov = sum((m - mean_m) * (a - mean_a) for m, a in zip(modelled, actual, strict=True))
    var = (
        sum((m - mean_m) ** 2 for m in modelled) * sum((a - mean_a) ** 2 for a in actual)
    ) ** 0.5
    assert cov / var > 0.85, "stacking surrogate fidelity regressed below the spec baseline"
