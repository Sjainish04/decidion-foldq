import pytest

from foldq.biology.dotbracket import (
    pairs_to_dotbracket,
    pairs_to_stems,
    stems_to_dotbracket,
    stems_to_pairs,
)
from foldq.schemas.structure import Stem


def test_pairs_render_as_dotbracket():
    assert pairs_to_dotbracket({(0, 9), (1, 8), (2, 7)}, 11) == "(((....)))."


def test_empty_structure_is_all_dots():
    assert pairs_to_dotbracket(set(), 5) == "....."


def test_stems_render_as_dotbracket():
    assert stems_to_dotbracket([Stem(0, 9, 3)], 11) == "(((....)))."


def test_stems_to_pairs_flattens():
    assert stems_to_pairs([Stem(0, 9, 2)]) == frozenset({(0, 9), (1, 8)})


def test_pairs_to_stems_groups_stacked_pairs():
    stems = pairs_to_stems({(0, 9), (1, 8), (2, 7)})
    assert stems == [Stem(0, 9, 3)]


def test_pairs_to_stems_splits_on_discontinuity():
    # two separate helices, not one
    stems = pairs_to_stems({(0, 30), (1, 29), (10, 20), (11, 19)})
    assert sorted(stems) == [Stem(0, 30, 2), Stem(10, 20, 2)]


def test_roundtrip_stems_pairs_stems():
    original = [Stem(0, 30, 3), Stem(10, 20, 2)]
    assert sorted(pairs_to_stems(stems_to_pairs(original))) == sorted(original)


def test_rejects_pair_beyond_sequence_length():
    with pytest.raises(ValueError, match="exceeds"):
        pairs_to_dotbracket({(0, 99)}, 10)


def test_rejects_nucleotide_paired_twice():
    with pytest.raises(ValueError, match="paired more than once"):
        pairs_to_dotbracket({(0, 9), (0, 8)}, 11)


def test_rejects_negative_index():
    """Negative indices must raise, not silently wrap to a different pair."""
    with pytest.raises(ValueError, match="negative index"):
        pairs_to_dotbracket({(-8, 5)}, 10)


def test_pairs_to_stems_rejects_nucleotide_paired_twice():
    """Solver output can be arbitrary; a shared nucleotide must fail loudly."""
    with pytest.raises(ValueError, match="paired more than once"):
        pairs_to_stems({(0, 9), (0, 8)})
