import math

import pytest

from foldq.evaluation.metrics import base_pair_metrics, energy_gap, relative_energy_gap


def test_perfect_prediction_scores_one():
    pairs = frozenset({(0, 9), (1, 8)})
    metrics = base_pair_metrics(pairs, pairs)
    assert metrics.precision == 1.0
    assert metrics.recall == 1.0
    assert metrics.f1 == 1.0


def test_empty_prediction_against_real_reference_scores_zero():
    metrics = base_pair_metrics(frozenset(), frozenset({(0, 9)}))
    assert metrics.recall == 0.0
    assert metrics.f1 == 0.0
    assert metrics.false_negatives == 1


def test_both_empty_is_perfect_by_convention():
    """Predicting 'no structure' for an unstructured sequence is correct, not undefined."""
    metrics = base_pair_metrics(frozenset(), frozenset())
    assert metrics.f1 == 1.0


def test_partial_overlap_computes_standard_prf():
    predicted = frozenset({(0, 9), (1, 8), (2, 7)})
    reference = frozenset({(0, 9), (1, 8), (30, 40)})
    metrics = base_pair_metrics(predicted, reference)
    assert metrics.true_positives == 2
    assert metrics.false_positives == 1
    assert metrics.false_negatives == 1
    assert metrics.precision == pytest.approx(2 / 3)
    assert metrics.recall == pytest.approx(2 / 3)
    assert metrics.f1 == pytest.approx(2 / 3)


def test_energy_gap_is_signed_difference_from_reference():
    assert energy_gap(-8.0, -10.0) == pytest.approx(2.0)
    assert energy_gap(-10.0, -10.0) == pytest.approx(0.0)


def test_relative_gap_normalises_by_reference_magnitude():
    assert relative_energy_gap(-8.0, -10.0) == pytest.approx(0.2)


def test_relative_gap_handles_zero_reference():
    assert relative_energy_gap(-1.0, 0.0) == 0.0 or math.isinf(relative_energy_gap(-1.0, 0.0))


def test_nan_candidate_energy_propagates_as_nan():
    assert math.isnan(energy_gap(float("nan"), -10.0))
