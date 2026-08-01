"""Pair-based QUBO: one binary variable per candidate base pair.

Maximum flexibility, but variables grow roughly quadratically with length and
stacking must be expressed as quadratic couplings, so the model is far denser
than the stem encoding. Built to answer RQ2 quantitatively.
"""

from __future__ import annotations

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.biology.pairs import candidate_pairs
from foldq.classical.vienna import ViennaBackend
from foldq.constants import DEFAULT_MIN_HAIRPIN
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem

ISOLATED_PAIR_COST = 0.3
"""Small positive cost per pair, so unstacked lone pairs are not free."""


def build_pair_qubo(
    sequence: str,
    backend: ViennaBackend,
    *,
    penalties: PenaltyConfig | None = None,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> QuboProblem:
    """Assemble the pair QUBO. Each pair is stored as a length-1 stem."""
    penalties = penalties or PenaltyConfig()
    pairs = candidate_pairs(sequence, min_hairpin=min_hairpin, allow_wobble=allow_wobble)
    variables = [Stem(i=i, j=j, k=1) for i, j in pairs]
    index_of = {(stem.i, stem.j): idx for idx, stem in enumerate(variables)}

    # A lone pair costs a little; all the reward comes from stacking below.
    linear = {idx: ISOLATED_PAIR_COST for idx in range(len(variables))}

    quadratic: dict[tuple[int, int], float] = {}

    # Stacking reward between a pair and the pair directly inside it.
    for (i, j), outer_idx in index_of.items():
        inner = index_of.get((i + 1, j - 1))
        if inner is None:
            continue
        stacking = backend.stack_energy(sequence, Stem(i=i, j=j, k=2))
        low, high = sorted((outer_idx, inner))
        quadratic[(low, high)] = stacking

    # Calibrate against the stacking rewards, not the linear costs: stacking is the
    # only thing a violation could profit from, and it dominates the lone-pair cost.
    stacking_scale = {index: value for index, value in enumerate(quadratic.values())}
    penalty = (
        penalties.overlap
        if penalties.overlap is not None
        else calibrate_penalty(stacking_scale or linear)
    )
    crossing_penalty = penalties.crossing if penalties.crossing is not None else penalty

    for a in range(len(variables)):
        for b in range(a + 1, len(variables)):
            key = (a, b)
            if stems_overlap(variables[a], variables[b]):
                quadratic[key] = quadratic.get(key, 0.0) + penalty
            elif penalties.forbid_crossing and stems_cross(variables[a], variables[b]):
                quadratic[key] = quadratic.get(key, 0.0) + crossing_penalty

    return QuboProblem(
        linear=linear,
        quadratic=quadratic,
        offset=0.0,
        variable_map=tuple(variables),
        sequence=sequence,
        metadata={
            "encoding": "pair",
            "overlap_penalty": penalty,
            "crossing_penalty": crossing_penalty,
            "forbid_crossing": penalties.forbid_crossing,
            "isolated_pair_cost": ISOLATED_PAIR_COST,
        },
    )
