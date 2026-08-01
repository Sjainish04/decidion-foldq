"""E2: encoding comparison and scaling.

Answers RQ2 and RQ5. Re-measures the length-to-variable mapping at the resolved
default of min_stem_length=2, which the spec flags as differing from its own
tables (measured at 3).

MANDATORY ADDITION 3 -- the lone-pair hypothesis. At the default `min_stem_length=2`,
isolated k=1 helices are structurally excluded from the candidate set before the QUBO
is even built (`biology/stems.py:generate_maximal_stems` drops any seed whose helix
length falls below `min_stem_length`). E1's own default-configuration sweep sees 100%
Gate A, but only because it caps instances at 18 variables; the hypothesis this module
tests is that lone base pairs are the dominant Gate A failure mode once instances grow
past that cap, and this sweep measures it directly rather than assuming it: at
`min_stem_length=2` (maximal mode) Gate A is 75% (n=40), not 100%, and every one of
those failures is rescued at `min_stem_length=1`. The `min_stem_length`
sweep below now includes 1, not just (2, 3), so `representable_fraction` at
1 vs. 2 is an actual measurement of whether that ceiling closes, and
`num_variables` at 1 vs. 2 measures what it costs to close it. This is a
monotonic, not merely probabilistic, comparison: for a fixed sequence and
stem_mode, `generate_maximal_stems` computes each seed's helix length `k`
identically regardless of `min_stem_length` (`min_stem_length` only gates
whether that `k` is kept), so the min_stem_length=1 candidate set is always a
superset of the min_stem_length=2 one -- `representable_fraction` cannot
decrease and `num_variables` cannot fall as min_stem_length shrinks, for the
same sequence and stem_mode. Quick mode samples {1, 2} (two points, enough to
see the effect fast); the full sweep uses {1, 2, 3}.

MANDATORY ADDITION 4 -- NaN posture. `representable_fraction` comes from
`gate_a_representable`, which special-cases an empty reference (returns 1.0
rather than dividing by zero); no column in this table can be NaN in
practice. Nothing here is aggregated inside the runner -- the two
monotonicity properties above are checked per (sequence_id, stem_mode) group
by the caller/tests, not summarized into this table.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.pipeline import FoldQPipeline

NAME = "e2_encoding"


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 30] if quick else [20, 30, 40, 50, 60, 80, 100, 120]
    per_length = 1 if quick else 5

    records = generate_benchmark_set(lengths, per_length, seed=seed, backend=backend)

    rows = []
    for record in records:
        reference = backend.fold(record.sequence)

        from foldq.encodings.pair_encoding import build_pair_qubo
        from foldq.evaluation.gates import gate_a_representable

        def _row(
            encoding: str,
            stem_mode: str,
            min_stem_length: int | None,
            problem,
            *,
            record,
            reference,
        ):
            # record/reference are explicit parameters, not closed over from the
            # enclosing `for record in records:` loop, so this function's meaning
            # cannot silently drift if it is ever hoisted out of the loop body.
            representable, fraction = gate_a_representable(
                reference.base_pairs, list(problem.variable_map)
            )
            return {
                "sequence_id": record.sequence_id,
                "length": record.length,
                "encoding": encoding,
                "stem_mode": stem_mode,
                "min_stem_length": min_stem_length,
                "num_variables": problem.num_variables,
                "num_quadratic_terms": len(problem.quadratic),
                "qubo_density": problem.density,
                "representable": representable,
                "representable_fraction": fraction,
                "mfe_energy": reference.mfe_energy,
            }

        # Pair encoding: the RQ2 baseline the stem encoding must beat.
        rows.append(
            _row(
                "pair",
                "pair",
                None,
                build_pair_qubo(record.sequence, backend),
                record=record,
                reference=reference,
            )
        )

        for stem_mode in ("maximal", "substems"):
            for min_stem_length in (1, 2) if quick else (1, 2, 3):
                config = FoldQConfig(
                    seed=seed,
                    min_stem_length=min_stem_length,
                    expand_substems=(stem_mode == "substems"),
                )
                problem = FoldQPipeline(config).build_problem(record.sequence)
                rows.append(
                    _row(
                        "stem",
                        stem_mode,
                        min_stem_length,
                        problem,
                        record=record,
                        reference=reference,
                    )
                )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
