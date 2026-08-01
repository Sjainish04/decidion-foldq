"""Structural and energetic comparison metrics."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PairMetrics:
    """Standard precision / recall / F1 over predicted base pairs."""

    precision: float
    recall: float
    f1: float
    true_positives: int
    false_positives: int
    false_negatives: int


def base_pair_metrics(
    predicted: frozenset[tuple[int, int]],
    reference: frozenset[tuple[int, int]],
) -> PairMetrics:
    """Compare two base-pair sets.

    Predicting nothing for a genuinely unstructured reference scores 1.0 rather
    than being undefined, since that is the correct answer.
    """
    true_positives = len(predicted & reference)
    false_positives = len(predicted - reference)
    false_negatives = len(reference - predicted)

    if not predicted and not reference:
        return PairMetrics(1.0, 1.0, 1.0, 0, 0, 0)

    precision = true_positives / len(predicted) if predicted else 0.0
    recall = true_positives / len(reference) if reference else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return PairMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        true_positives=true_positives,
        false_positives=false_positives,
        false_negatives=false_negatives,
    )


def energy_gap(candidate: float, reference: float) -> float:
    """How much worse the candidate is than the reference, in kcal/mol."""
    return candidate - reference


def relative_energy_gap(candidate: float, reference: float) -> float:
    """Energy gap normalised by the reference magnitude."""
    if reference == 0.0:
        return 0.0 if candidate == 0.0 else math.inf
    return abs(candidate - reference) / abs(reference)
