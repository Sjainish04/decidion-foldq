"""E5: pseudoknot reach.

The differentiator. Disabling the crossing penalty lets the formulation
express structures ViennaRNA cannot represent at all, validated against each
curated record's reference structure via base-pair precision/recall/F1 --
never via an energy gap, because ViennaRNA cannot score a crossing structure
in the first place (MANDATORY CORRECTION 1, below).

MANDATORY CORRECTION 2 -- fixture provenance. Two of the four curated records
(`pk_htype_constructed_28`, `pk_htype_constructed_33`) are CONSTRUCTED for
this project, not published and not literature-derived;
`data/fixtures/curated.json` states this explicitly in each record's
`source` field, which this runner carries straight through into the
`source` column below. Do not describe these two records as published,
literature-derived, or sourced from any database -- here, in any other
docstring, or in any output -- an earlier draft of the fixture file made
exactly that false claim before it was caught. Cited literature pseudoknots
should be substituted for these two constructed records before publication.

MANDATORY CORRECTION 1 -- NaN energies are correct, not missing. ViennaRNA
cannot score a crossing structure at all: `eval_structure` requires legal
single-bracket dot-bracket notation, which a crossing structure has no way
to satisfy. `decode_sample` reflects that honestly rather than hiding it --
a candidate whose selected stems actually cross gets
`FoldCandidate.is_pseudoknotted = True` and `FoldCandidate.vienna_energy =
NaN` by construction (see `src/foldq/decoding/decode.py`). This runner
therefore never evaluates Tier P through an energy gap. Concretely:
  * `base_pair_f1_vs_reference` / `_precision` / `_recall` are computed
    directly from `bits_to_stems(...) -> stems_to_pairs(...)` against each
    record's known pairs, bypassing dot-bracket rendering entirely. A
    genuinely crossing candidate's `dot_bracket` is masked to all dots by
    `decode_sample` (crossing pairs cannot be written in single-bracket
    notation at all), so scoring the rendered dot-bracket instead of the
    raw stem selection would silently lose the very pairs this table exists
    to measure.
  * `candidate_is_pseudoknotted` and `candidate_vienna_energy` are recorded
    per row specifically so a reader can tell a legitimate NaN
    (`candidate_is_pseudoknotted=True`) apart from an actual bug (NaN with
    `candidate_is_pseudoknotted=False`, which the test suite asserts never
    happens). Energy columns being empty on those rows is not a gap in the
    results table; it is what a faithful classical score of an
    unrepresentable structure looks like.

MANDATORY CORRECTION 4 -- NaN-aware aggregation. Nothing is aggregated
inside this runner (same posture as E1-E3), but any caller that summarizes
`candidate_vienna_energy` -- e.g. a later figures/decision-cards step --
must skip NaN rather than propagate it (pandas' default `skipna=True`
mean, or `numpy.nanmean`): the pseudoknot-mode rows on the two constructed
records genuinely produce NaN here, and a naive `sum(...) / len(...)` would
turn one legitimate NaN into a NaN for the whole column.

ViennaRNA comparison columns -- `vienna_f1_vs_reference` / `vienna_recall`
score ViennaRNA's own fold (`vienna`, already computed above for
`vienna_recovers_crossing_pairs`) against each record's known pairs, via the
same `base_pair_metrics` used for the FoldQ columns. This is computed under
whichever `dangles` model `backend` (a plain `ViennaBackend()`, default
`dangles=2`) is configured with, and the value is model-dependent: on the 33
nt fixture `pk_htype_constructed_33`, ViennaRNA's `dangles=2` fold shares 0
of the reference's 10 pairs (F1 0.000, recall 0.000) but its `dangles=0` fold
shares 5 of 10 (F1 0.667, recall 0.500) -- see that record's `notes` field in
`data/fixtures/curated.json`. `dangles=2` is what this runner reports because
it is what `FoldQPipeline` and standard ViennaRNA/RNAfold both use by
default; a table built from a different `dangles` setting is not comparable
to it.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.biology.dotbracket import stems_to_pairs
from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.decoding.decode import bits_to_stems
from foldq.evaluation.gates import gate_a_representable
from foldq.evaluation.metrics import base_pair_metrics
from foldq.io.fixtures import load_curated
from foldq.pipeline import FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

NAME = "e5_pseudoknot"


def parse_extended_structure(structure: str) -> frozenset[tuple[int, int]]:
    """Parse dot-bracket that uses a second bracket layer, `[ ]`, for a
    crossing helix that cannot be written with `( )` alone.
    """
    pairs: set[tuple[int, int]] = set()
    for opener, closer in (("(", ")"), ("[", "]"), ("{", "}")):
        stack: list[int] = []
        for index, char in enumerate(structure):
            if char == opener:
                stack.append(index)
            elif char == closer:
                pairs.add((stack.pop(), index))
    return frozenset(pairs)


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    curated = load_curated()
    if quick:
        curated = [record for record in curated if len(record.sequence) <= 40]

    rows = []
    for entry in curated:
        record = SequenceRecord(
            sequence_id=entry.sequence_id, sequence=entry.sequence, source_type="curated"
        )
        known_pairs = parse_extended_structure(entry.known_structure)
        vienna = backend.fold(entry.sequence)

        # The bracket layer (`[ ]`) is exactly the pairs that cross the `( )`
        # layer by construction of these H-type pseudoknot fixtures -- not a
        # claim about what ViennaRNA happens to fold. ViennaRNA's own output
        # can never contain two pairs that cross each other (dotbracket_to_pairs
        # only ever parses single-bracket, i.e. nested, notation), so any
        # overlap it does have with `known_pairs` is necessarily confined to
        # one nested layer or the other -- this checks whether that overlap
        # includes the crossing layer specifically.
        nested_layer_pairs = parse_extended_structure(
            entry.known_structure.replace("[", ".").replace("]", ".")
        )
        crossing_pairs = known_pairs - nested_layer_pairs
        vienna_recovers = bool(crossing_pairs & vienna.base_pairs)
        vienna_metrics = base_pair_metrics(vienna.base_pairs, known_pairs)

        for forbid_crossing in (True, False):
            config = FoldQConfig(
                seed=seed, forbid_crossing=forbid_crossing, num_reads=100 if quick else 1000
            )
            result = FoldQPipeline(config).predict(record, solver="simulated_annealing")
            representable, fraction = gate_a_representable(
                known_pairs, list(result.problem.variable_map)
            )
            predicted_pairs = stems_to_pairs(
                bits_to_stems(result.solver_result.best.bits, result.problem)
            )
            metrics = base_pair_metrics(predicted_pairs, known_pairs)

            rows.append(
                {
                    "sequence_id": entry.sequence_id,
                    "length": record.length,
                    "has_pseudoknot": entry.has_pseudoknot,
                    "source": entry.source,
                    "forbid_crossing": forbid_crossing,
                    "num_variables": result.problem.num_variables,
                    "qubo_density": result.problem.density,
                    "representable_against_reference": representable,
                    "representable_fraction": fraction,
                    "base_pair_f1_vs_reference": metrics.f1,
                    "base_pair_precision": metrics.precision,
                    "base_pair_recall": metrics.recall,
                    "candidate_is_pseudoknotted": result.best_candidate.is_pseudoknotted,
                    "candidate_vienna_energy": result.best_candidate.vienna_energy,
                    "vienna_structure": vienna.mfe_structure,
                    "vienna_energy": vienna.mfe_energy,
                    "vienna_f1_vs_reference": vienna_metrics.f1,
                    "vienna_recall": vienna_metrics.recall,
                    "vienna_recovers_crossing_pairs": vienna_recovers,
                    "num_crossing_pairs_in_reference": len(crossing_pairs),
                }
            )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
