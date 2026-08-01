"""Turn solver bit strings back into RNA structures."""

from __future__ import annotations

import itertools

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.biology.dotbracket import stems_to_dotbracket
from foldq.classical.vienna import ViennaBackend
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import FoldCandidate, Sample
from foldq.schemas.structure import Stem, ValidationReport


def bits_to_stems(bits: tuple[int, ...], problem: QuboProblem) -> list[Stem]:
    """Map a bit assignment onto the helices it selects."""
    if len(bits) != problem.num_variables:
        raise ValueError(f"expected {problem.num_variables} bits, got {len(bits)}")
    return [problem.variable_map[index] for index, bit in enumerate(bits) if bit]


def validate_stems(stems: list[Stem], *, forbid_crossing: bool = True) -> ValidationReport:
    """Report every structural violation in a selected stem set."""
    overlaps: list[tuple[int, int]] = []
    crossings: list[tuple[int, int]] = []
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if stems_overlap(stems[a], stems[b]):
                overlaps.append((a, b))
            elif forbid_crossing and stems_cross(stems[a], stems[b]):
                crossings.append((a, b))
    return ValidationReport(
        overlapping_pairs=tuple(overlaps), crossing_pairs=tuple(crossings)
    )


def decode_sample(
    sample: Sample,
    problem: QuboProblem,
    backend: ViennaBackend,
    *,
    repair: bool = True,
    forbid_crossing: bool = True,
) -> FoldCandidate:
    """Decode, optionally repair, then rescore against the Turner model."""
    from foldq.decoding.repair import repair_stems

    stems = bits_to_stems(sample.bits, problem)
    report = validate_stems(stems, forbid_crossing=forbid_crossing)
    operations: tuple = ()
    was_repaired = False

    if repair and not report.is_valid:
        repaired, ops = repair_stems(stems, problem, forbid_crossing=forbid_crossing)
        stems, operations, was_repaired = repaired, tuple(ops), True
        report = validate_stems(stems, forbid_crossing=forbid_crossing)

    # Renderability is a property of the structure, not of the mode. Crossing
    # helices cannot be written in single-bracket notation at all: rendering them
    # anyway silently re-brackets the crossing into different pairs. In
    # pseudoknot mode `validate_stems` does not populate `crossing_pairs`
    # (crossings are legal there), so this must be checked directly.
    has_crossing = any(
        stems_cross(left, right)
        for left, right in itertools.combinations(stems, 2)
    )

    if has_crossing or not report.is_valid:
        dot_bracket = "." * len(problem.sequence)
        vienna_energy = float("nan")
    else:
        dot_bracket = stems_to_dotbracket(stems, len(problem.sequence))
        vienna_energy = backend.eval_structure(problem.sequence, dot_bracket)

    bits = tuple(
        1 if problem.variable_map[i] in set(stems) else 0
        for i in range(problem.num_variables)
    )

    return FoldCandidate(
        stems=tuple(stems),
        dot_bracket=dot_bracket,
        qubo_energy=problem.energy(bits),
        vienna_energy=vienna_energy,
        validation=report,
        repairs=operations,
        was_repaired=was_repaired,
        is_pseudoknotted=has_crossing,
    )
