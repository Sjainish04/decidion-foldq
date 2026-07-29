"""The four-gate diagnostic report."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class GateReport:
    """Attributes a result to candidate generation, the energy model, or the solver.

    Gates B and C need exact ground truth and are `None` when the instance is too
    large to enumerate.
    """

    representable: bool
    representable_fraction: float
    is_qubo_ground_state: bool | None
    solver_found_ground_state: bool | None
    energy_gap: float
    base_pair_f1: float
    notes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def attribution(self) -> str:
        """Name the earliest gate that failed; later gates cannot be blamed for it."""
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
