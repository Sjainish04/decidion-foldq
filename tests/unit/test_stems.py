# tests/unit/test_stems.py
from foldq.biology.pairs import can_pair, candidate_pairs
from foldq.biology.stems import expand_substems, generate_maximal_stems
from foldq.schemas.structure import Stem


def test_canonical_and_wobble_pairing():
    assert can_pair("A", "U")
    assert can_pair("G", "C")
    assert can_pair("G", "U", allow_wobble=True)
    assert not can_pair("G", "U", allow_wobble=False)
    assert not can_pair("A", "G")
    assert not can_pair("A", "A")


def test_candidate_pairs_respect_min_hairpin():
    # AAAA...UUUU with a 3-base loop
    pairs = candidate_pairs("GGGAAAUCCCU", min_hairpin=3)
    for i, j in pairs:
        assert j - i - 1 >= 3


def test_maximal_stem_found_in_simple_hairpin():
    stems = generate_maximal_stems("GGGAAAUCCCU", min_stem_length=2)
    assert Stem(i=0, j=9, k=3) in stems


def test_maximal_stems_are_not_extendable():
    """A maximal stem's flanking pair must not itself be pairable."""
    seq = "GGGGAAAAUCCCC"
    stems = generate_maximal_stems(seq, min_stem_length=2)
    for stem in stems:
        outer_i, outer_j = stem.outer_pair
        if outer_i > 0 and outer_j < len(seq) - 1:
            assert not can_pair(seq[outer_i - 1], seq[outer_j + 1])


def test_min_stem_length_filters_short_helices():
    seq = "GGGAAAUCCCU"
    assert all(s.k >= 3 for s in generate_maximal_stems(seq, min_stem_length=3))
    assert all(s.k >= 2 for s in generate_maximal_stems(seq, min_stem_length=2))


def test_substem_expansion_produces_all_contiguous_subhelices():
    subs = expand_substems([Stem(i=0, j=10, k=3)], min_stem_length=2)
    assert Stem(0, 10, 3) in subs  # the whole helix
    assert Stem(0, 10, 2) in subs  # truncated from the inside
    assert Stem(1, 9, 2) in subs  # shifted inward
    assert Stem(0, 10, 1) not in subs  # below min_stem_length


def test_substem_expansion_is_deduplicated_and_sorted():
    subs = expand_substems([Stem(0, 10, 3), Stem(0, 10, 3)], min_stem_length=2)
    assert len(subs) == len(set(subs))
    assert subs == sorted(subs)


def test_no_stems_when_sequence_cannot_pair():
    assert generate_maximal_stems("AAAAAAAAAA", min_stem_length=2) == []


def test_generation_is_deterministic():
    seq = "GGGCAUAAAAGCUUUUGCCC"
    assert generate_maximal_stems(seq) == generate_maximal_stems(seq)
