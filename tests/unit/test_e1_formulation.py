"""Unit tests for E1's penalty-conditioning and optimum-validity helpers.

Cheap and pure -- no ViennaRNA calls, no pipeline, no solver -- unlike
tests/integration/test_experiments.py, which drives the full runner.
"""

from __future__ import annotations

import math

import pytest

from foldq.experiments.e1_formulation import (
    coefficient_range,
    condition_ratio,
    selection_is_valid,
)
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import Stem


def _problem(
    linear: dict[int, float],
    quadratic: dict[tuple[int, int], float],
    variable_map: list[Stem],
) -> QuboProblem:
    return QuboProblem(
        linear=linear,
        quadratic=quadratic,
        offset=0.0,
        variable_map=tuple(variable_map),
        sequence="A" * len(variable_map),
    )


# --- coefficient_range ------------------------------------------------------


def test_coefficient_range_is_the_spread_of_absolute_magnitudes():
    problem = _problem({0: -3.0, 1: 7.0}, {(0, 1): 1.0}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    # |values| = {3.0, 7.0, 1.0}; range = 7.0 - 1.0 = 6.0
    assert coefficient_range(problem) == pytest.approx(6.0)


def test_coefficient_range_is_zero_for_a_single_coefficient():
    problem = _problem({0: -5.0}, {}, [Stem(0, 9, 1)])
    assert coefficient_range(problem) == 0.0


def test_coefficient_range_includes_zero_valued_coefficients():
    # A legitimate zero (e.g. no stacking/hairpin contribution) pulls the
    # range down to reflect real spread rather than being discarded.
    problem = _problem({0: 0.0, 1: 5.0}, {}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    assert coefficient_range(problem) == pytest.approx(5.0)


# --- condition_ratio ---------------------------------------------------------


def test_condition_ratio_divides_max_by_min_nonzero():
    problem = _problem({0: -2.0, 1: 8.0}, {}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    assert condition_ratio(problem) == pytest.approx(4.0)


def test_condition_ratio_ignores_zero_when_choosing_the_denominator():
    problem = _problem(
        {0: 0.0, 1: 2.0, 2: 8.0},
        {},
        [Stem(0, 9, 1), Stem(10, 19, 1), Stem(20, 29, 1)],
    )
    # min non-zero |value| is 2.0, not the literal 0.0.
    assert condition_ratio(problem) == pytest.approx(4.0)


def test_condition_ratio_is_nan_for_an_all_zero_qubo():
    """Degenerate edge case E1's real instances should never hit, but which
    must not raise ZeroDivisionError if one somehow does.
    """
    problem = _problem({0: 0.0, 1: 0.0}, {}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    assert math.isnan(condition_ratio(problem))


# --- selection_is_valid -------------------------------------------------------


def test_selection_is_valid_true_for_disjoint_non_crossing_stems():
    problem = _problem({0: -1.0, 1: -1.0}, {}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    assert selection_is_valid(problem, (1, 1), forbid_crossing=True) is True


def test_selection_is_valid_false_for_overlapping_stems():
    # Stem(0, 9, 2) covers nucleotides {0, 1, 8, 9}; Stem(1, 8, 1) covers {1, 8}.
    problem = _problem({0: -1.0, 1: -1.0}, {(0, 1): 5.0}, [Stem(0, 9, 2), Stem(1, 8, 1)])
    assert selection_is_valid(problem, (1, 1), forbid_crossing=True) is False


def test_selection_is_valid_false_for_crossing_stems_when_forbidden():
    # i < p < j < q: 0 < 5 < 10 < 15 -- crosses but does not overlap.
    problem = _problem({0: -1.0, 1: -1.0}, {}, [Stem(0, 10, 1), Stem(5, 15, 1)])
    assert selection_is_valid(problem, (1, 1), forbid_crossing=True) is False
    assert selection_is_valid(problem, (1, 1), forbid_crossing=False) is True


def test_selection_is_valid_true_for_an_empty_or_singleton_selection():
    problem = _problem({0: -1.0, 1: -1.0}, {}, [Stem(0, 9, 1), Stem(10, 19, 1)])
    assert selection_is_valid(problem, (0, 0), forbid_crossing=True) is True
    assert selection_is_valid(problem, (1, 0), forbid_crossing=True) is True
