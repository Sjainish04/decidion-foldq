import pytest

pytest.importorskip("fastapi", reason="api extra not installed")

from foldq.api.rcsb import StructureSummary, rank_structures  # noqa: E402


def summary(**overrides) -> StructureSummary:
    defaults = dict(
        pdb_id="1EHZ",
        title="The crystal structure of yeast phenylalanine tRNA",
        method="X-RAY DIFFRACTION",
        resolution=1.93,
        rna_lengths=(76,),
        rna_sequences=("GCGGAUUUAGCUCAGUUGG",),
        ligands=("MG", "MN"),
        organisms=("Saccharomyces cerevisiae",),
        released="2000-10-02",
    )
    return StructureSummary(**{**defaults, **overrides})


def test_rank_orders_by_resolution_ascending():
    ranked = rank_structures(
        [
            summary(pdb_id="LOW", resolution=3.2),
            summary(pdb_id="BEST", resolution=0.85),
            summary(pdb_id="MID", resolution=1.93),
        ]
    )
    assert [s.pdb_id for s in ranked] == ["BEST", "MID", "LOW"]


def test_rank_places_unresolved_entries_last_without_dropping_them():
    # Solution NMR entries carry no resolution. They are still experimental
    # structures and must not be silently discarded by a resolution sort.
    ranked = rank_structures(
        [summary(pdb_id="NMR", method="SOLUTION NMR", resolution=None), summary()]
    )
    assert [s.pdb_id for s in ranked] == ["1EHZ", "NMR"]
    assert len(ranked) == 2


def test_rank_excludes_computed_models():
    ranked = rank_structures(
        [summary(pdb_id="PRED", method="PREDICTED", resolution=0.1), summary()]
    )
    assert [s.pdb_id for s in ranked] == ["1EHZ"]


def test_summary_exposes_the_longest_rna_entity():
    assert summary(rna_lengths=(12, 76, 30)).primary_rna_length == 76


def test_summary_reports_whether_it_carries_a_foldable_sequence():
    assert summary().has_rna is True
    assert summary(rna_lengths=(), rna_sequences=()).has_rna is False
