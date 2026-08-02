import math

import pytest

from foldq.analysis.uncertainty import bootstrap_ci, format_rate, wilson_ci


def test_wilson_does_not_claim_certainty_from_a_perfect_run():
    """30/30 must not report [1.0, 1.0].

    Several solvers in E3 are 30-for-30. The normal approximation gives those a
    zero-width interval, which asserts the next run cannot possibly fail -- a
    claim 30 observations do not support.
    """
    interval = wilson_ci(30, 30)
    assert interval.estimate == 1.0
    assert interval.low < 1.0
    assert interval.width > 0.05


def test_wilson_stays_inside_zero_and_one():
    for successes, trials in [(0, 5), (1, 5), (5, 5), (0, 1), (1, 1), (17, 19)]:
        interval = wilson_ci(successes, trials)
        assert 0.0 <= interval.low <= interval.high <= 1.0


def test_wilson_on_the_gate_b_headline():
    # Gate B is 17/19 = 89.5%. The interval must be wide enough to show that a
    # sample this small cannot distinguish 89% from, say, 75%.
    interval = wilson_ci(17, 19)
    assert interval.estimate == pytest.approx(0.8947, abs=1e-4)
    assert interval.low < 0.75
    assert interval.high > 0.95


def test_wilson_narrows_as_the_sample_grows():
    small = wilson_ci(9, 10)
    large = wilson_ci(90, 100)
    assert large.width < small.width


def test_bootstrap_covers_the_mean_and_is_reproducible():
    values = [0.9, 0.85, 0.95, 0.8, 1.0, 0.88, 0.92]
    first = bootstrap_ci(values)
    second = bootstrap_ci(values)
    assert first == second, "a reported interval must not move between runs"
    assert first.low < first.estimate < first.high


def test_bootstrap_ignores_nan_rather_than_propagating_it():
    # energy_gap is NaN for a pseudoknotted candidate; a NaN must not poison the
    # interval for the instances that were scorable.
    clean = bootstrap_ci([1.0, 2.0, 3.0, 4.0])
    withnan = bootstrap_ci([1.0, 2.0, float("nan"), 3.0, 4.0])
    assert withnan.n == 4
    assert withnan.estimate == pytest.approx(clean.estimate)


def test_bootstrap_degenerates_gracefully():
    empty = bootstrap_ci([])
    assert math.isnan(empty.estimate) and empty.n == 0
    single = bootstrap_ci([0.5])
    assert single.estimate == single.low == single.high == 0.5


def test_format_rate_reads_like_the_readme_tables():
    assert format_rate(17, 19).startswith("17/19 = 89.5% [")
