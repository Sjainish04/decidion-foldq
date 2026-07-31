"""E1: formulation validation. Does the QUBO actually encode RNA folding?

Answers RQ1 and RQ4 by measuring Gates A and B across energy models, nesting
policies, and penalty scales on instances small enough to enumerate exactly.

MANDATORY ADDITION 1 -- penalty conditioning as a measured result, not an
assumption. `qubo.builder.calibrate_penalty` sets the hard-constraint penalty
to `2 * max|E_s| + 1`, which is sufficient to outbid a *single* conflicting
stacking/hairpin term but is not a proof it outbids *accumulated* negative
refund terms under `charge_refund` -- a stem nested inside a long chain can
draw a refund from more than one ancestor (see
`encodings/energy.py:nestable_pairs`). Three columns turn that gap into data:

  coefficient_range   max(|coeff|) - min(|coeff|) over every linear and
                       quadratic coefficient in the assembled QUBO (offset
                       excluded -- a constant shift changes no optimum and so
                       is not part of the coefficient spread). Not restricted
                       to non-zero coefficients: a literal 0.0 linear cost
                       (no stacking or hairpin contribution) is a real,
                       legitimate coefficient, not noise to discard.
  condition_ratio      max(|coeff|) / min(|coeff| for coeff != 0). NaN when
                       every coefficient is (numerically) zero -- a
                       degenerate QUBO this project's instances should never
                       produce, but which must not raise ZeroDivisionError if
                       one somehow does (MANDATORY ADDITION 4). Values at or
                       below 1e-9 are treated as zero for this denominator,
                       filtering floating-point noise rather than any
                       physically meaningful energy scale.
  optimum_is_valid     whether the *raw, unrepaired* selection at the exact
                       QUBO optimum is a structurally legal stem set -- no
                       two selected stems overlap or (`forbid_crossing`
                       defaults to True and is never overridden in this
                       runner) cross. Computed with `stems_overlap` /
                       `stems_cross` directly on `bits_to_stems(solver_result
                       .best.bits, problem)`, deliberately not on
                       `best_candidate`: `best_candidate` is decoded with
                       `repair=True` by default, and repair's entire job is
                       to *fix* the invalidity this column exists to catch,
                       so checking it would always read True. `None` when
                       exact ground truth is unavailable at this instance
                       size (mirrors `GateReport.is_qubo_ground_state`);
                       given this runner's `max_variables=18` generation cap
                       against the default `exact_max_variables=22`, that
                       should not fire in practice.

MANDATORY ADDITION 2 -- nesting_policy ablation. The loop below already
exercises both `all_nestable` and `immediate_only` for `charge_refund` (only
`stacking_only` is restricted to one policy, since it has no refund terms
for a nesting policy to act on). `immediate_only` became the default in a
separate fix after `all_nestable` was measured to produce structurally
invalid QUBO optima at 70-200 nt (`encodings/energy.py:nestable_pairs`); this
loop plus `optimum_is_valid` is what turns that from a commit-message claim
into a reportable, in-band measurement. Do not collapse this loop to the
default policy only.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.decoding.decode import bits_to_stems
from foldq.pipeline import FoldQPipeline
from foldq.schemas.qubo import QuboProblem

NAME = "e1_formulation"

_ZERO_EPSILON = 1e-9
"""Coefficients at or below this magnitude count as zero for
`condition_ratio`'s denominator -- filters floating-point noise, not a
physically meaningful energy scale."""


def _abs_coefficients(problem: QuboProblem) -> list[float]:
    """Every linear and quadratic coefficient's magnitude. Offset excluded:
    a constant energy shift changes no optimum, so it carries no
    conditioning information.
    """
    return [abs(v) for v in problem.linear.values()] + [
        abs(v) for v in problem.quadratic.values()
    ]


def coefficient_range(problem: QuboProblem) -> float:
    """max(|coeff|) - min(|coeff|), including zero-valued coefficients.

    0.0 for zero or one coefficients -- there is no spread to report.
    """
    values = _abs_coefficients(problem)
    return max(values) - min(values) if values else 0.0


def condition_ratio(problem: QuboProblem) -> float:
    """max(|coeff|) / min(|coeff| for coeff != 0).

    NaN if no coefficient is (numerically) non-zero, rather than raising
    ZeroDivisionError -- see MANDATORY ADDITION 4 in the module docstring.
    """
    values = _abs_coefficients(problem)
    nonzero = [v for v in values if v > _ZERO_EPSILON]
    if not nonzero:
        return float("nan")
    return max(values) / min(nonzero)


def selection_is_valid(
    problem: QuboProblem, bits: tuple[int, ...], *, forbid_crossing: bool
) -> bool:
    """Structural legality of the raw selection at `bits`.

    Must run on a raw solver bitstring, never on a repaired/decoded
    candidate -- repair exists precisely to fix the invalidity this function
    measures, so checking a repaired candidate would always read True.
    """
    stems = bits_to_stems(bits, problem)
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if stems_overlap(stems[a], stems[b]):
                return False
            if forbid_crossing and stems_cross(stems[a], stems[b]):
                return False
    return True


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 25] if quick else [20, 25, 30, 35]
    per_length = 2 if quick else 6
    penalties = [None] if quick else [None, 5.0, 20.0]

    records = generate_benchmark_set(
        lengths, per_length, seed=seed, backend=backend, max_variables=18
    )

    rows = []
    for record in records:
        for energy_model in ("stacking_only", "charge_refund"):
            for nesting_policy in ("all_nestable", "immediate_only"):
                if energy_model == "stacking_only" and nesting_policy == "immediate_only":
                    continue  # nesting policy is irrelevant without refunds
                for penalty in penalties:
                    config = FoldQConfig(
                        seed=seed,
                        energy_model=energy_model,
                        nesting_policy=nesting_policy,
                        overlap_penalty=penalty,
                    )
                    result = FoldQPipeline(config).predict(record, solver="exact")

                    # solver="exact" above, so solver_result.best *is* the exact
                    # QUBO optimum -- no separate ExactSolver call needed here.
                    # Availability mirrors GateReport's own gate B/C semantics.
                    exact_available = result.gates.is_qubo_ground_state is not None
                    optimum_is_valid = (
                        selection_is_valid(
                            result.problem,
                            result.solver_result.best.bits,
                            forbid_crossing=config.forbid_crossing,
                        )
                        if exact_available
                        else None
                    )

                    rows.append(
                        {
                            "sequence_id": record.sequence_id,
                            "length": record.length,
                            "energy_model": energy_model,
                            "nesting_policy": nesting_policy,
                            "overlap_penalty": penalty if penalty is not None else "adaptive",
                            "num_variables": result.problem.num_variables,
                            "qubo_density": result.problem.density,
                            "coefficient_range": coefficient_range(result.problem),
                            "condition_ratio": condition_ratio(result.problem),
                            "representable": result.gates.representable,
                            "representable_fraction": result.gates.representable_fraction,
                            "is_qubo_ground_state": result.gates.is_qubo_ground_state,
                            "optimum_is_valid": optimum_is_valid,
                            "base_pair_f1": result.gates.base_pair_f1,
                            "energy_gap": result.gates.energy_gap,
                            "attribution": result.gates.attribution,
                        }
                    )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
