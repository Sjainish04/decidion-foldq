from foldq.classical.vienna import ViennaBackend
from foldq.io.fixtures import load_curated


def test_curated_set_loads_and_is_non_empty():
    assert len(load_curated()) >= 4


def test_every_curated_record_carries_provenance():
    for record in load_curated():
        assert record.source and record.license
        assert set(record.sequence) <= set("AUCG")
        assert len(record.known_structure) == len(record.sequence)


def test_curated_set_contains_pseudoknots():
    """Tier P has no exact ground truth, so constructed PK structures with
    explicit, verifiable crossing pairs are essential.
    """
    assert any(record.has_pseudoknot for record in load_curated())


def test_pseudoknot_structures_use_second_bracket_pair():
    for record in load_curated():
        if record.has_pseudoknot:
            assert "[" in record.known_structure and "]" in record.known_structure


def test_viennarna_cannot_reproduce_the_pseudoknots():
    """The core claim of Tier P, asserted as a test rather than a slogan."""
    backend = ViennaBackend()
    for record in load_curated():
        if not record.has_pseudoknot:
            continue
        predicted = backend.fold(record.sequence).mfe_structure
        assert "[" not in predicted, "dot-bracket output cannot express crossing pairs"
