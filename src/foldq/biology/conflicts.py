"""Pairwise structural conflicts between candidate helices.

Both conflict classes are pairwise, which is exactly what a QUBO can express:
  * overlap  - two helices claim the same nucleotide
  * crossing - two helices form a pseudoknot (i < i' < j < j')

Crossing is toggleable. Disabling it is pseudoknot mode.
"""

from __future__ import annotations

import networkx as nx

from foldq.schemas.structure import Stem


def stems_overlap(a: Stem, b: Stem) -> bool:
    """True if the helices claim any nucleotide in common."""
    return bool(a.nucleotides() & b.nucleotides())


def stems_cross(a: Stem, b: Stem) -> bool:
    """True if any pair of `a` interleaves with any pair of `b` (a pseudoknot)."""
    for i, j in a.pairs():
        for p, q in b.pairs():
            if i < p < j < q or p < i < q < j:
                return True
    return False


def is_nested(outer: Stem, inner: Stem) -> bool:
    """True if `inner` lies strictly inside `outer`'s innermost pair."""
    oi, oj = outer.inner_pair
    ii, ij = inner.outer_pair
    return oi < ii and ij < oj


def stems_conflict(a: Stem, b: Stem, *, forbid_crossing: bool = True) -> bool:
    """True if the two helices cannot both appear in one structure."""
    if stems_overlap(a, b):
        return True
    return forbid_crossing and stems_cross(a, b)


def build_conflict_graph(stems: list[Stem], *, forbid_crossing: bool = True) -> nx.Graph:
    """Graph whose nodes are stem indices and whose edges are pairwise conflicts."""
    graph = nx.Graph()
    graph.add_nodes_from(range(len(stems)))
    for idx_a in range(len(stems)):
        for idx_b in range(idx_a + 1, len(stems)):
            if stems_conflict(stems[idx_a], stems[idx_b], forbid_crossing=forbid_crossing):
                graph.add_edge(idx_a, idx_b)
    return graph
