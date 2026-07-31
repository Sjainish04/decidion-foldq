"""E3: solver comparison on identical QUBOs.

Answers RQ3. Every solver receives the same problem and the same decode path,
so differences are attributable to the optimizer alone. E3 compares solvers,
which does not require exact ground truth: `qubo_energy`, `vienna_energy`,
and `base_pair_f1` are all measurable without it.

NaN posture (MANDATORY ADDITION 4): `vienna_energy`/`energy_gap` come from
`best_candidate`, which is decoded with `repair=config.repair_invalid` and
`forbid_crossing=config.forbid_crossing`. Neither is overridden here, so both
stay at their `FoldQConfig` defaults (`repair_invalid=True`,
`forbid_crossing=True`). Under that combination `decode_sample` cannot return
a NaN `vienna_energy`: `repair_stems` loops until `validate_stems` reports a
crossing-free, non-overlapping selection (or the empty selection), so the
post-repair `has_crossing` recheck in `decode_sample` is always False -- see
`src/foldq/decoding/decode.py`.

TASK-22 FIX -- this runner used to pass `max_variables=22` to
`generate_benchmark_set`, matched to the default `exact_max_variables`.
Measured stem counts at lengths 40 and 50 are 43-120, always above that cap,
so the full (non-quick) sweep silently accepted zero sequences at those two
lengths and produced zero rows for them -- length coverage quietly stopped at
30 with no error raised. The cap is now removed: lengths 40 and 50 produce
rows again. `is_qubo_ground_state` / `solver_found_ground_state` are `None`,
not NaN, whenever an instance's variable count exceeds `exact_max_variables`:
`ExactSolver` raises `ExactSolverTooLarge`, this pipeline catches it, and
`exact_result` stays `None`, which `evaluate_gates` reports as `None` for
both gates rather than guessing. That is expected and correct at lengths 40
and 50 now, not a defect -- `found_ground_state` is a three-valued column
(`True`/`False`/`None`) and callers must not treat `None` as falsy. If a
future variant of this runner sets `forbid_crossing` or `repair_invalid`
differently, any aggregate over `vienna_energy` / `energy_gap` must switch to
NaN-skipping (e.g. pandas' default `skipna=True` mean, or `numpy.nanmean`)
rather than a raw Python `sum(...) / len(...)`.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline

NAME = "e3_solvers"
CLASSICAL = ("random", "greedy", "local_search", "simulated_annealing", "tabu", "path_integral_sqa")


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 25] if quick else [20, 25, 30, 40, 50]
    per_length = 1 if quick else 5
    seeds = [seed] if quick else [seed, seed + 1, seed + 2]

    records = generate_benchmark_set(lengths, per_length, seed=seed, backend=backend)
    solvers = [name for name in CLASSICAL if name in SOLVER_REGISTRY]

    rows = []
    for record in records:
        for solver in solvers:
            for run_seed in seeds:
                config = FoldQConfig(seed=run_seed, num_reads=50 if quick else 500)
                result = FoldQPipeline(config).predict(record, solver=solver)
                rows.append(
                    {
                        "sequence_id": record.sequence_id,
                        "length": record.length,
                        "solver": solver,
                        "seed": run_seed,
                        "num_variables": result.problem.num_variables,
                        "qubo_energy": result.solver_result.best.energy,
                        "vienna_energy": result.best_candidate.vienna_energy,
                        "energy_gap": result.gates.energy_gap,
                        "base_pair_f1": result.gates.base_pair_f1,
                        "found_ground_state": result.gates.solver_found_ground_state,
                        "was_repaired": result.best_candidate.was_repaired,
                        "attribution": result.gates.attribution,
                        "runtime_seconds": result.runtime_seconds,
                    }
                )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
