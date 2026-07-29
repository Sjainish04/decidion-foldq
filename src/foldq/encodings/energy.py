"""Charge-and-refund energy coefficients for the stem QUBO.

A degree-2 objective cannot express "this helix closes a hairpin", because that
depends on which *other* helices are selected — a k-body predicate. The
construction here recovers it in two representable layers:

  linear[s]      = stacking(s) + hairpin_closure(s)     provisionally assume a hairpin
  quadratic[s,t] = -hairpin_closure(s) + interior(s,t)  refund it when t nests inside

Known approximation: when several helices nest inside one, the refund applies more
than once. `NestingPolicy` controls how aggressively that is mitigated, and the
residual error is measured in experiment E1 rather than hidden. The default policy,
`immediate_only`, drops transitive refund edges and so already mitigates most of
this: each stem is refunded only by its immediate enclosing stem, not by every
ancestor in its nesting chain.
"""

from __future__ import annotations

from typing import Literal

from foldq.biology.conflicts import is_nested
from foldq.classical.vienna import ViennaBackend
from foldq.schemas.structure import Stem

NestingPolicy = Literal["all_nestable", "immediate_only"]
EnergyModel = Literal["stacking_only", "charge_refund"]


def stem_linear_energy(backend: ViennaBackend, sequence: str, stem: Stem) -> float:
    """Linear coefficient: stacking plus a provisional hairpin-closure charge."""
    return backend.stack_energy(sequence, stem) + backend.hairpin_energy(sequence, stem)


def refund_pair_energy(
    backend: ViennaBackend, sequence: str, outer: Stem, inner: Stem
) -> float:
    """Quadratic coefficient: undo the hairpin assumption, charge the real loop."""
    return backend.interior_energy(sequence, outer, inner) - backend.hairpin_energy(
        sequence, outer
    )


def nestable_pairs(
    stems: list[Stem], policy: NestingPolicy = "immediate_only"
) -> list[tuple[int, int]]:
    """Indices (outer, inner) where `inner` sits strictly inside `outer`.

    `all_nestable` returns every nesting relationship, including transitive ones.
    `immediate_only` drops pair (a, c) when some b satisfies a > b > c, which
    reduces double-refunding at the cost of ignoring selections that skip a level.

    Defaults to `immediate_only`. Under `all_nestable`, a stem nested inside a
    deep chain accrues a refund from every ancestor; ancestors are mutually
    conflict-free, so those refunds stack without bound and can exceed the
    hard-constraint penalty, making an overlapping selection profitable. That
    was measured to produce structurally invalid optima in 8 of 8 instances at
    70-150 nt. `immediate_only` caps accumulation at one refund per stem and
    restores validity with no penalty inflation and no loss of Gate B fidelity.
    """
    pairs = [
        (outer_idx, inner_idx)
        for outer_idx, outer in enumerate(stems)
        for inner_idx, inner in enumerate(stems)
        if outer_idx != inner_idx and is_nested(outer, inner)
    ]
    if policy == "all_nestable":
        return sorted(pairs)

    direct = set(pairs)
    transitive = {
        (a, c)
        for (a, b) in pairs
        for (b2, c) in pairs
        if b == b2 and (a, c) in direct
    }
    return sorted(direct - transitive)
