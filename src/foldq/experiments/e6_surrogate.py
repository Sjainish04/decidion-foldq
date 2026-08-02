"""E6: within-sequence fidelity of the QUBO surrogate.

Answers the question E1-E5 leave open. The pooled correlation reported for RQ4
compares one QUBO energy against one ViennaRNA energy per sequence, across
sequences of 30-100 nt. Longer sequences have more stems and more negative
energies, so that statistic is partly measuring length.

The optimizer never chooses between sequences. It chooses among candidate
structures for one sequence, which makes within-sequence ordering the property
that actually matters. This experiment builds a candidate ensemble per sequence
by sampling the QUBO, rescores every candidate with ViennaRNA, and reports rank
correlation, regret and top-k agreement within each sequence.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import asdict
from pathlib import Path

from foldq.analysis.surrogate import (
    CandidateEnergies,
    SequenceFidelity,
    evaluate_sequence,
    summarise,
)
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.decoding.decode import decode_sample
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.solvers.base import SolverConfig

FIELDS = [
    "sequence_id",
    "sequence_length",
    "candidate_count",
    "pearson",
    "spearman",
    "kendall_tau",
    "top1_match",
    "top5_overlap",
    "regret_kcal_mol",
    "best_qubo_candidate_vienna_energy",
    "best_vienna_candidate_energy",
]


def evaluate(
    config: FoldQConfig,
    lengths: tuple[int, ...],
    per_length: int,
    num_reads: int,
) -> list[SequenceFidelity]:
    pipeline = FoldQPipeline(config)
    records = generate_benchmark_set(
        list(lengths), per_length, seed=config.seed, backend=pipeline.backend
    )

    results: list[SequenceFidelity] = []
    for record in records:
        problem = pipeline.build_problem(record.sequence)
        if problem.num_variables == 0:
            continue

        # Sampling, not enumeration: the ensemble should be the candidates the
        # optimizer actually visits, so the measured ranking error is the one the
        # pipeline is exposed to rather than one over structures it never sees.
        solver = SOLVER_REGISTRY["simulated_annealing"]()
        solver_result = solver.solve(problem, SolverConfig(num_reads=num_reads, seed=config.seed))

        # `unique_samples` is a count, so dedupe here: an ensemble that repeats
        # the same bitstring 200 times would weight one structure 200-fold in the
        # rank correlation and make the surrogate look far more consistent than it
        # is. Each distinct structure gets exactly one vote.
        seen: set[tuple[int, ...]] = set()
        energies: list[CandidateEnergies] = []
        for sample in solver_result.samples:
            if sample.bits in seen:
                continue
            seen.add(sample.bits)
            candidate = decode_sample(
                sample,
                problem,
                pipeline.backend,
                repair=config.repair_invalid,
                forbid_crossing=config.forbid_crossing,
            )
            # A repaired candidate is a different structure from the one sampled,
            # so its QUBO energy no longer corresponds to the decoded structure.
            # Including it would score the repair step, not the surrogate.
            if candidate.was_repaired or candidate.is_pseudoknotted:
                continue
            energies.append(
                CandidateEnergies(
                    qubo_energy=candidate.qubo_energy,
                    vienna_energy=candidate.vienna_energy,
                )
            )

        results.append(evaluate_sequence(record.sequence_id, record.length, energies))

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="results/e6")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--quick", action="store_true", help="reduced sweep for CI")
    args = parser.parse_args()

    lengths = (30, 40) if args.quick else (30, 40, 50, 60, 80)
    per_length = 2 if args.quick else 6
    num_reads = 40 if args.quick else 300

    config = FoldQConfig(seed=args.seed)
    results = evaluate(config, lengths, per_length, num_reads)
    summary = summarise(results)

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    path = output / "e6_surrogate.csv"
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for result in results:
            writer.writerow({k: v for k, v in asdict(result).items() if k in FIELDS})

    print(f"wrote {path} ({len(results)} sequences, {summary.degenerate} degenerate)")
    print()
    print(summary.headline())
    print()
    print(f"  median Spearman      {summary.median_spearman}")
    print(f"  median Kendall tau   {summary.median_kendall}")
    print(f"  mean regret          {summary.mean_regret} kcal/mol")
    print(f"  median regret        {summary.median_regret:.4g} kcal/mol")
    print(f"  top-1 agreement      {summary.top1_rate}")
    print(f"  mean top-5 overlap   {summary.mean_top5_overlap}")
    print(
        f"  within 0.5/1/2 kcal  {summary.within_half_kcal:.0%} / "
        f"{summary.within_one_kcal:.0%} / {summary.within_two_kcal:.0%}"
    )


if __name__ == "__main__":
    main()
