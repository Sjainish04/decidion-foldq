"""The four-gate diagnostic report."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class GateReport:
    """Attributes a result to candidate generation, the energy model, or the solver.

    Gates B and C need exact ground truth and are `None` when the instance is too
    large to enumerate. `is_pseudoknotted` marks a candidate whose selected stems
    cross, so it carries a placeholder all-dots dot-bracket and NaN energy by
    construction (see `decode_sample`); `attribution` treats divergence from the
    nested reference as expected there, not a failure of an earlier gate.
    """

    representable: bool
    representable_fraction: float
    is_qubo_ground_state: bool | None
    solver_found_ground_state: bool | None
    energy_gap: float
    base_pair_f1: float
    is_pseudoknotted: bool = False
    notes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def attribution(self) -> str:
        """Name the earliest gate that failed; later gates cannot be blamed for it."""
        if self.is_pseudoknotted:
            return (
                "pseudoknotted candidate: the selected structure contains crossing "
                "pairs, which ViennaRNA cannot represent or score. The reference "
                "fold can hold at most one of any two crossing helices, so "
                "precision against it is capped even when the structure is "
                "correct. Divergence from the nested reference is expected here, "
                "not a failure"
            )
        if not self.representable:
            return (
                "candidate generation: the reference structure is not in the candidate "
                f"set (only {self.representable_fraction:.0%} of its pairs are reachable)"
            )
        if self.is_qubo_ground_state is False:
            return "energy model: the reference structure is not the QUBO ground state"
        if self.solver_found_ground_state is False:
            return "optimizer: the solver did not reach the QUBO ground state"
        if self.is_qubo_ground_state is None or self.solver_found_ground_state is None:
            return "indeterminate: instance too large for exact ground truth"
        return "no failure: all gates passed"
