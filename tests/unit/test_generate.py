import random

import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.data.generate import (
    generate_benchmark_set,
    generate_folding_sequence,
    plant_hairpin,
)


@pytest.fixture
def backend():
    return ViennaBackend()


def test_planted_hairpin_is_self_complementary():
    """The planted 5' and 3' stems must be reverse complements.

    The 3' stem begins after the 5' stem and the loop, so position `offset`
    pairs with `2*stem_length + loop_length - 1 - offset`. Deriving that index
    from the parameters rather than hardcoding it keeps the test correct if the
    fixture parameters ever change.
    """
    stem_length, loop_length, length = 5, 4, 20
    seq = plant_hairpin(
        length=length,
        stem_length=stem_length,
        loop_length=loop_length,
        rng=random.Random(1),
    )
    assert len(seq) == length
    complement = {"A": "U", "U": "A", "G": "C", "C": "G"}
    partner_of_first = 2 * stem_length + loop_length - 1
    for offset in range(stem_length):
        assert seq[offset] == complement[seq[partner_of_first - offset]], (
            f"offset {offset} does not pair with {partner_of_first - offset}"
        )


def test_planted_hairpin_actually_folds(backend):
    seq = plant_hairpin(length=24, stem_length=6, loop_length=4, rng=random.Random(2))
    assert backend.fold(seq).mfe_energy < -3.0


def test_generated_sequence_always_folds(backend):
    """The landmine guard: never emit a sequence whose MFE structure is empty."""
    for length in (20, 25, 30, 40):
        record = generate_folding_sequence(length, rng=random.Random(3), backend=backend)
        reference = backend.fold(record.sequence)
        assert reference.mfe_energy < 0.0
        assert "(" in reference.mfe_structure


def test_generated_sequence_respects_length_and_alphabet(backend):
    record = generate_folding_sequence(30, rng=random.Random(4), backend=backend)
    assert record.length == 30
    assert set(record.sequence) <= set("AUCG")


def test_generation_is_seed_reproducible(backend):
    a = generate_folding_sequence(25, rng=random.Random(5), backend=backend)
    b = generate_folding_sequence(25, rng=random.Random(5), backend=backend)
    assert a.sequence == b.sequence


def test_benchmark_set_has_unique_ids_and_requested_shape(backend):
    records = generate_benchmark_set([20, 30], count_per_length=3, seed=42, backend=backend)
    assert len(records) == 6
    assert len({r.sequence_id for r in records}) == 6
    assert sorted({r.length for r in records}) == [20, 30]


def test_benchmark_set_can_cap_variable_count(backend):
    """Tier boundaries are enforced by variable count, not nucleotide length."""
    from foldq.biology.stems import generate_maximal_stems

    records = generate_benchmark_set(
        [30, 40], count_per_length=2, seed=7, backend=backend, max_variables=22
    )
    for record in records:
        assert len(generate_maximal_stems(record.sequence)) <= 22
