"""Deterministic repair of structurally invalid solver output.

Strategy: while a violation remains, drop the helix whose removal costs the least
energy, breaking ties by stem order so the result is fully reproducible.
"""

from __future__ import annotations

from foldq.decoding.decode import validate_stems
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import RepairOp, Stem


def repair_stems(
    stems: list[Stem],
    problem: QuboProblem,
    *,
    forbid_crossing: bool = True,
) -> tuple[list[Stem], list[RepairOp]]:
    """Remove helices until the structure is legal."""
    index_of = {stem: index for index, stem in enumerate(problem.variable_map)}
    working = list(stems)
    operations: list[RepairOp] = []

    while True:
        report = validate_stems(working, forbid_crossing=forbid_crossing)
        if report.is_valid:
            return working, operations

        if report.overlapping_pairs:
            offending, reason = report.overlapping_pairs[0], "overlap: shared nucleotide"
        else:
            offending, reason = report.crossing_pairs[0], "crossing: pseudoknot"

        left, right = working[offending[0]], working[offending[1]]
        # Drop whichever contributes less energetic benefit; ties break on index.
        left_gain = problem.linear.get(index_of.get(left, -1), 0.0)
        right_gain = problem.linear.get(index_of.get(right, -1), 0.0)
        victim = right if left_gain <= right_gain else left

        working.remove(victim)
        operations.append(RepairOp(action="remove", stem=victim, reason=reason))
