from foldq.biology.conflicts import (
    build_conflict_graph,
    is_nested,
    stems_conflict,
    stems_cross,
    stems_overlap,
)
from foldq.schemas.structure import Stem


def test_overlap_when_nucleotide_reused():
    assert stems_overlap(Stem(0, 20, 3), Stem(2, 30, 2))  # shares index 2
    assert not stems_overlap(Stem(0, 9, 2), Stem(20, 29, 2))


def test_nested_stems_do_not_conflict():
    outer, inner = Stem(0, 30, 3), Stem(10, 20, 3)
    assert not stems_overlap(outer, inner)
    assert not stems_cross(outer, inner)
    assert not stems_conflict(outer, inner)
    assert is_nested(outer, inner)


def test_disjoint_stems_do_not_conflict():
    assert not stems_conflict(Stem(0, 9, 2), Stem(20, 29, 2))


def test_crossing_stems_are_a_pseudoknot():
    # i < i' < j < j'  ->  crossing
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert stems_cross(a, b)
    assert stems_conflict(a, b, forbid_crossing=True)


def test_crossing_allowed_in_pseudoknot_mode():
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert not stems_conflict(a, b, forbid_crossing=False)


def test_overlap_still_forbidden_in_pseudoknot_mode():
    """Pseudoknot mode relaxes crossing only; a nucleotide still pairs at most once."""
    assert stems_conflict(Stem(0, 20, 3), Stem(2, 30, 2), forbid_crossing=False)


def test_conflict_graph_has_node_per_stem_and_edge_per_conflict():
    stems = [Stem(0, 20, 2), Stem(10, 30, 2), Stem(40, 49, 2)]
    graph = build_conflict_graph(stems, forbid_crossing=True)
    assert graph.number_of_nodes() == 3
    assert graph.has_edge(0, 1)      # crossing
    assert not graph.has_edge(0, 2)  # disjoint


def test_pseudoknot_mode_yields_sparser_graph():
    stems = [Stem(0, 20, 2), Stem(10, 30, 2), Stem(5, 25, 2)]
    strict = build_conflict_graph(stems, forbid_crossing=True)
    relaxed = build_conflict_graph(stems, forbid_crossing=False)
    assert relaxed.number_of_edges() < strict.number_of_edges()


def test_conflict_is_symmetric():
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert stems_conflict(a, b) == stems_conflict(b, a)
