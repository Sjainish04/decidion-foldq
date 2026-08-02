import math

import pytest

from foldq.analysis.surrogate import (
    CandidateEnergies,
    evaluate_sequence,
    summarise,
)


def ensemble(pairs):
    return [CandidateEnergies(q, v) for q, v in pairs]


def test_perfect_agreement_scores_one_and_zero_regret():
    # Surrogate orders candidates exactly as ViennaRNA does.
    result = evaluate_sequence("s", 30, ensemble([(-10, -8), (-8, -6), (-6, -4), (-4, -2)]))
    assert result.spearman == pytest.approx(1.0)
    assert result.kendall_tau == pytest.approx(1.0)
    assert result.top1_match is True
    assert result.regret_kcal_mol == pytest.approx(0.0)


def test_inverted_surrogate_is_caught_by_regret_not_by_magnitude():
    """A surrogate that ranks backwards must show large regret.

    This is the case a pooled correlation across sequences can hide: the numbers
    are the right size, the ordering within the sequence is wrong.
    """
    result = evaluate_sequence("s", 30, ensemble([(-10, -2), (-8, -4), (-6, -6), (-4, -8)]))
    assert result.spearman == pytest.approx(-1.0)
    assert result.top1_match is False
    # picks -2 where -8 was available
    assert result.regret_kcal_mol == pytest.approx(6.0)


def test_regret_is_measured_against_the_ensemble_best():
    # QUBO picks the -9 candidate; the best available is -12.
    result = evaluate_sequence("s", 40, ensemble([(-5, -9), (-4, -12), (-3, -7), (-2, -6)]))
    assert result.best_qubo_candidate_vienna_energy == pytest.approx(-9.0)
    assert result.best_vienna_candidate_energy == pytest.approx(-12.0)
    assert result.regret_kcal_mol == pytest.approx(3.0)


def test_top5_overlap_is_a_fraction_of_the_available_k():
    result = evaluate_sequence("s", 30, ensemble([(-9, -9), (-8, -8), (-7, -1), (-6, -7)]))
    assert 0.0 <= result.top5_overlap <= 1.0


def test_a_flat_ensemble_is_degenerate_not_perfect():
    """Every candidate identical must not report perfect agreement.

    Correlation is undefined on a constant vector. Reporting 1.0 here would
    manufacture agreement out of an ensemble that contains no ordering at all.
    """
    result = evaluate_sequence("s", 30, ensemble([(-5, -5), (-5, -5), (-5, -5)]))
    assert math.isnan(result.spearman)
    assert result.is_degenerate is True


def test_a_two_candidate_ensemble_is_degenerate():
    result = evaluate_sequence("s", 30, ensemble([(-5, -5), (-4, -4)]))
    assert result.is_degenerate is True


def test_non_finite_energies_are_dropped_not_propagated():
    # A pseudoknotted candidate has NaN vienna_energy; it must not void the
    # sequence, only be excluded from its ranking.
    result = evaluate_sequence(
        "s", 30, ensemble([(-9, -9), (-8, float("nan")), (-7, -7), (-6, -6)])
    )
    assert result.candidate_count == 3
    assert not math.isnan(result.spearman)


def test_summary_excludes_degenerate_sequences_from_aggregates():
    good = [
        evaluate_sequence(f"g{i}", 30, ensemble([(-9, -9), (-8, -8), (-7, -7)])) for i in range(4)
    ]
    flat = [evaluate_sequence("flat", 30, ensemble([(-5, -5), (-5, -5), (-5, -5)]))]
    summary = summarise(good + flat)
    assert summary.sequences == 4
    assert summary.degenerate == 1
    assert summary.median_spearman.estimate == pytest.approx(1.0)


def test_summary_reports_regret_thresholds():
    results = [
        evaluate_sequence("a", 30, ensemble([(-5, -9), (-4, -9.2), (-3, -7)])),  # regret 0.2
        evaluate_sequence("b", 30, ensemble([(-5, -9), (-4, -12), (-3, -7)])),  # regret 3.0
    ]
    summary = summarise(results)
    assert summary.within_half_kcal == pytest.approx(0.5)
    assert summary.within_two_kcal == pytest.approx(0.5)


def test_headline_states_within_sequence_not_pooled():
    results = [
        evaluate_sequence(f"g{i}", 30, ensemble([(-9, -9), (-8, -8), (-7, -7)])) for i in range(4)
    ]
    text = summarise(results).headline()
    assert "within-sequence Spearman" in text
    assert "kcal/mol" in text
