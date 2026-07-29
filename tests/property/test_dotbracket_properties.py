from hypothesis import given, settings
from hypothesis import strategies as st

from foldq.biology.dotbracket import pairs_to_dotbracket, stems_to_dotbracket, stems_to_pairs
from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import dotbracket_to_pairs

sequences = st.text(alphabet="AUCG", min_size=8, max_size=60)


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_dotbracket_length_always_matches_sequence(sequence):
    stems = generate_maximal_stems(sequence)
    for stem in stems:
        assert len(stems_to_dotbracket([stem], len(sequence))) == len(sequence)


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_single_stem_dotbracket_is_balanced(sequence):
    for stem in generate_maximal_stems(sequence):
        rendered = stems_to_dotbracket([stem], len(sequence))
        assert rendered.count("(") == rendered.count(")")
        depth = 0
        for char in rendered:
            depth += (char == "(") - (char == ")")
            assert depth >= 0
        assert depth == 0


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_pairs_to_dotbracket_roundtrips(sequence):
    for stem in generate_maximal_stems(sequence):
        pairs = stems_to_pairs([stem])
        assert dotbracket_to_pairs(pairs_to_dotbracket(pairs, len(sequence))) == pairs


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_generated_stems_respect_min_hairpin(sequence):
    for stem in generate_maximal_stems(sequence):
        inner_i, inner_j = stem.inner_pair
        assert inner_j - inner_i - 1 >= 3
