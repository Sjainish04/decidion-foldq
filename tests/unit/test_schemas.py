import pytest

from foldq.schemas.sequence import SequenceRecord
from foldq.schemas.structure import Stem


def test_sequence_record_normalizes_and_measures():
    rec = SequenceRecord(sequence_id="s1", sequence="ggcauT", source_type="synthetic")
    assert rec.sequence == "GGCAUU"  # lowercased and T->U
    assert rec.length == 6
    assert rec.gc_content == pytest.approx(3 / 6)
    assert len(rec.checksum) == 16


def test_sequence_record_rejects_invalid_nucleotide():
    with pytest.raises(ValueError, match="invalid nucleotide"):
        SequenceRecord(sequence_id="bad", sequence="GGXAU", source_type="synthetic")


def test_sequence_record_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        SequenceRecord(sequence_id="bad", sequence="", source_type="synthetic")


def test_stem_expands_to_stacked_pairs():
    stem = Stem(i=0, j=10, k=3)
    assert stem.pairs() == ((0, 10), (1, 9), (2, 8))
    assert stem.outer_pair == (0, 10)
    assert stem.inner_pair == (2, 8)
    assert stem.nucleotides() == frozenset({0, 1, 2, 8, 9, 10})
    assert stem.span == 11


def test_stem_rejects_non_positive_length():
    with pytest.raises(ValueError, match="at least one pair"):
        Stem(i=0, j=10, k=0)


def test_stem_rejects_self_crossing_geometry():
    # k so large the strands would pass through each other
    with pytest.raises(ValueError, match="overlap"):
        Stem(i=0, j=6, k=4)


def test_stems_are_hashable_and_sortable():
    a, b = Stem(0, 10, 3), Stem(1, 9, 2)
    assert len({a, b, Stem(0, 10, 3)}) == 2
    assert sorted([b, a])[0] == a
