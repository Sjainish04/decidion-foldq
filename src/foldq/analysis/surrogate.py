"""Within-sequence fidelity of the QUBO surrogate.

The project previously reported one pooled Pearson correlation between QUBO
energy and ViennaRNA energy across sequences of 30-100 nt. That number is real
but it answers a weaker question than it appears to.

Longer sequences have more stems, more base pairs and more negative total
energies. A statistic pooled across lengths is therefore partly measuring
length, and a high value is compatible with the surrogate ranking candidates
*within* a single sequence no better than chance. Ranking within a sequence is
what the optimizer actually relies on: it picks among candidate structures for
one RNA, never across different RNAs.

This module answers the question the optimizer cares about. For each sequence it
takes an ensemble of decoded candidates, and reports:

- rank correlation between QUBO and ViennaRNA energy **within** that sequence;
- regret: how much worse, in kcal/mol, the QUBO's pick is than the best
  candidate in the ensemble as ViennaRNA scores it;
- top-k agreement between the two orderings.

Regret is the most directly interpretable of the three. A correlation of 0.9 and
a regret of 3 kcal/mol together mean the surrogate has the right shape and still
picks a materially worse structure.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy import stats

from foldq.analysis.uncertainty import Interval, bootstrap_ci


@dataclass(frozen=True)
class CandidateEnergies:
    """One candidate's energy under the surrogate and under ViennaRNA."""

    qubo_energy: float
    vienna_energy: float


@dataclass(frozen=True)
class SequenceFidelity:
    """Within-sequence agreement between the surrogate and ViennaRNA."""

    sequence_id: str
    sequence_length: int
    candidate_count: int
    pearson: float
    spearman: float
    kendall_tau: float
    top1_match: bool
    top5_overlap: float
    regret_kcal_mol: float
    best_qubo_candidate_vienna_energy: float
    best_vienna_candidate_energy: float

    @property
    def is_degenerate(self) -> bool:
        """True when the ensemble is too small or too flat to rank.

        A single candidate, or an ensemble where every candidate has the same
        energy, yields an undefined correlation. Those sequences are reported and
        excluded from aggregates rather than silently counted as agreement.
        """
        return self.candidate_count < 3 or not np.isfinite(self.spearman)


def evaluate_sequence(
    sequence_id: str,
    sequence_length: int,
    candidates: Sequence[CandidateEnergies],
) -> SequenceFidelity:
    """Score how well the surrogate orders one sequence's candidate ensemble.

    Both energies are minimised, so the best candidate is the smallest. Rank
    correlations are computed on the raw energies; because both are minimised,
    a positive correlation means agreement.
    """
    usable = [c for c in candidates if np.isfinite(c.qubo_energy) and np.isfinite(c.vienna_energy)]
    count = len(usable)

    if count == 0:
        nan = float("nan")
        return SequenceFidelity(
            sequence_id, sequence_length, 0, nan, nan, nan, False, nan, nan, nan, nan
        )

    qubo = np.array([c.qubo_energy for c in usable], dtype=float)
    vienna = np.array([c.vienna_energy for c in usable], dtype=float)

    if count < 3 or np.all(qubo == qubo[0]) or np.all(vienna == vienna[0]):
        pearson = spearman = kendall = float("nan")
    else:
        pearson = float(stats.pearsonr(qubo, vienna).statistic)
        spearman = float(stats.spearmanr(qubo, vienna).statistic)
        kendall = float(stats.kendalltau(qubo, vienna).statistic)

    qubo_pick = int(np.argmin(qubo))
    vienna_best = int(np.argmin(vienna))

    # Regret is defined against the ensemble's own best, not against the global
    # MFE: it isolates the surrogate's ranking error from the candidate
    # generator's coverage, which Gate A already measures separately.
    regret = float(vienna[qubo_pick] - vienna[vienna_best])

    k = min(5, count)
    top_qubo = set(np.argsort(qubo, kind="stable")[:k].tolist())
    top_vienna = set(np.argsort(vienna, kind="stable")[:k].tolist())
    overlap = len(top_qubo & top_vienna) / k

    return SequenceFidelity(
        sequence_id=sequence_id,
        sequence_length=sequence_length,
        candidate_count=count,
        pearson=pearson,
        spearman=spearman,
        kendall_tau=kendall,
        top1_match=qubo_pick == vienna_best,
        top5_overlap=overlap,
        regret_kcal_mol=regret,
        best_qubo_candidate_vienna_energy=float(vienna[qubo_pick]),
        best_vienna_candidate_energy=float(vienna[vienna_best]),
    )


@dataclass(frozen=True)
class FidelitySummary:
    """Aggregate across sequences, with intervals rather than bare means."""

    sequences: int
    degenerate: int
    median_spearman: Interval
    median_kendall: Interval
    mean_regret: Interval
    median_regret: float
    top1_rate: Interval
    mean_top5_overlap: Interval
    within_half_kcal: float
    within_one_kcal: float
    within_two_kcal: float

    def headline(self) -> str:
        """The sentence that should replace the pooled-correlation claim."""
        return (
            f"Across candidate ensembles for {self.sequences} sequences, the median "
            f"within-sequence Spearman correlation was {self.median_spearman.estimate:.3f} "
            f"[{self.median_spearman.low:.3f}, {self.median_spearman.high:.3f}]. The "
            f"QUBO-selected candidate was within 1 kcal/mol of the best "
            f"ViennaRNA-rescored candidate in {self.within_one_kcal:.0%} of sequences, "
            f"and was the best candidate outright in "
            f"{self.top1_rate.estimate:.0%} "
            f"[{self.top1_rate.low:.0%}, {self.top1_rate.high:.0%}]."
        )


def summarise(results: Sequence[SequenceFidelity]) -> FidelitySummary:
    """Aggregate per-sequence fidelity, excluding ensembles too small to rank."""
    usable = [r for r in results if not r.is_degenerate]
    degenerate = len(results) - len(usable)

    if not usable:
        nan_interval = Interval(float("nan"), float("nan"), float("nan"), 0.95, 0)
        return FidelitySummary(
            0,
            degenerate,
            nan_interval,
            nan_interval,
            nan_interval,
            float("nan"),
            nan_interval,
            nan_interval,
            float("nan"),
            float("nan"),
            float("nan"),
        )

    regrets = [r.regret_kcal_mol for r in usable]
    within = lambda limit: sum(1 for g in regrets if g <= limit) / len(regrets)  # noqa: E731

    return FidelitySummary(
        sequences=len(usable),
        degenerate=degenerate,
        median_spearman=bootstrap_ci([r.spearman for r in usable], statistic="median"),
        median_kendall=bootstrap_ci([r.kendall_tau for r in usable], statistic="median"),
        mean_regret=bootstrap_ci(regrets),
        median_regret=float(np.median(regrets)),
        top1_rate=bootstrap_ci([1.0 if r.top1_match else 0.0 for r in usable]),
        mean_top5_overlap=bootstrap_ci([r.top5_overlap for r in usable]),
        within_half_kcal=within(0.5),
        within_one_kcal=within(1.0),
        within_two_kcal=within(2.0),
    )
