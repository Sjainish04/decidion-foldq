"""Stem-based QUBO: one binary variable per candidate helix."""

from __future__ import annotations

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.energy import (
    EnergyModel,
    NestingPolicy,
    nestable_pairs,
    refund_pair_energy,
    stem_linear_energy,
)
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem


def build_stem_qubo(
    sequence: str,
    stems: list[Stem],
    backend: ViennaBackend,
    *,
    penalties: PenaltyConfig | None = None,
    energy_model: EnergyModel = "charge_refund",
    nesting_policy: NestingPolicy = "immediate_only",
) -> QuboProblem:
    """Assemble the stem QUBO from energy terms and hard-constraint penalties."""
    penalties = penalties or PenaltyConfig()

    if energy_model == "stacking_only":
        linear = {i: backend.stack_energy(sequence, s) for i, s in enumerate(stems)}
    else:
        linear = {i: stem_linear_energy(backend, sequence, s) for i, s in enumerate(stems)}

    overlap_penalty = (
        penalties.overlap if penalties.overlap is not None else calibrate_penalty(linear)
    )
    crossing_penalty = (
        penalties.crossing if penalties.crossing is not None else overlap_penalty
    )

    quadratic: dict[tuple[int, int], float] = {}

    # Hard constraints.
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if stems_overlap(stems[a], stems[b]):
                quadratic[(a, b)] = quadratic.get((a, b), 0.0) + overlap_penalty
            elif penalties.forbid_crossing and stems_cross(stems[a], stems[b]):
                quadratic[(a, b)] = quadratic.get((a, b), 0.0) + crossing_penalty

    # Loop-closure refunds, only between helices that could legally coexist.
    if energy_model == "charge_refund":
        for outer_idx, inner_idx in nestable_pairs(stems, policy=nesting_policy):
            key = (min(outer_idx, inner_idx), max(outer_idx, inner_idx))
            if key in quadratic:
                continue  # already a hard conflict; a refund would be meaningless
            quadratic[key] = refund_pair_energy(
                backend, sequence, stems[outer_idx], stems[inner_idx]
            )

    return QuboProblem(
        linear=linear,
        quadratic=quadratic,
        offset=0.0,
        variable_map=tuple(stems),
        sequence=sequence,
        metadata={
            "energy_model": energy_model,
            "nesting_policy": nesting_policy,
            "overlap_penalty": overlap_penalty,
            "crossing_penalty": crossing_penalty,
            "forbid_crossing": penalties.forbid_crossing,
        },
    )
