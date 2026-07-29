"""Evaluate the four-gate diagnostic ladder."""

from __future__ import annotations

from foldq.biology.dotbracket import dotbracket_to_pairs, stems_to_pairs
from foldq.classical.vienna import ViennaReference
from foldq.evaluation.metrics import base_pair_metrics, energy_gap
from foldq.schemas.gates import GateReport
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import FoldCandidate, SolverResult
from foldq.schemas.structure import Stem

TOLERANCE = 1e-6


def gate_a_representable(
    reference_pairs: frozenset[tuple[int, int]], stems: list[Stem]
) -> tuple[bool, float]:
    """Gate A: can the candidate set express the reference structure at all?"""
    if not reference_pairs:
        return True, 1.0
    reachable = stems_to_pairs(stems)
    covered = len(reference_pairs & reachable)
    return covered == len(reference_pairs), covered / len(reference_pairs)


def gate_b_faithful(
    problem: QuboProblem,
    reference_pairs: frozenset[tuple[int, int]],
    exact_result: SolverResult | None,
) -> bool | None:
    """Gate B: is the reference structure the QUBO's ground state?"""
    if exact_result is None:
        return None
    ground_pairs = stems_to_pairs(
        [problem.variable_map[i] for i, bit in enumerate(exact_result.best.bits) if bit]
    )
    return ground_pairs == reference_pairs


def gate_c_solved(
    solver_result: SolverResult, exact_result: SolverResult | None
) -> bool | None:
    """Gate C: did this solver actually reach the QUBO ground state?"""
    if exact_result is None:
        return None
    return solver_result.best.energy <= exact_result.best.energy + TOLERANCE


def gate_d_physical(
    candidate: FoldCandidate, reference: ViennaReference
) -> tuple[float, float]:
    """Gate D: how good is the decoded structure thermodynamically and structurally?"""
    predicted = dotbracket_to_pairs(candidate.dot_bracket) if candidate.dot_bracket else frozenset()
    metrics = base_pair_metrics(predicted, reference.base_pairs)
    return energy_gap(candidate.vienna_energy, reference.mfe_energy), metrics.f1


def evaluate_gates(
    problem: QuboProblem,
    reference: ViennaReference,
    solver_result: SolverResult,
    candidate: FoldCandidate,
    exact_result: SolverResult | None = None,
) -> GateReport:
    """Run the full ladder and package the attribution."""
    representable, fraction = gate_a_representable(
        reference.base_pairs, list(problem.variable_map)
    )
    gap, f1 = gate_d_physical(candidate, reference)

    notes: list[str] = []
    if exact_result is None:
        notes.append(
            f"instance has {problem.num_variables} variables; exact ground truth "
            "unavailable, so Gates B and C are indeterminate"
        )
    if candidate.was_repaired:
        notes.append(f"structure required {len(candidate.repairs)} repair operation(s)")

    return GateReport(
        representable=representable,
        representable_fraction=fraction,
        is_qubo_ground_state=gate_b_faithful(problem, reference.base_pairs, exact_result),
        solver_found_ground_state=gate_c_solved(solver_result, exact_result),
        energy_gap=gap,
        base_pair_f1=f1,
        notes=tuple(notes),
    )
