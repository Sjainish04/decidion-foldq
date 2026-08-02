import numpy as np
import pandas as pd
import pytest

from foldq.analysis.multivariate import (
    correlation_matrix,
    principal_components,
    standardised_ols,
    variance_inflation,
)


@pytest.fixture
def frame():
    rng = np.random.default_rng(0)
    n = 200
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n)
    duplicate = x1 * 0.99 + rng.normal(scale=0.01, size=n)  # near-collinear with x1
    y = 2.0 * x1 - 1.0 * x2 + rng.normal(scale=0.1, size=n)
    return pd.DataFrame({"y": y, "x1": x1, "x2": x2, "duplicate": duplicate})


def test_standardised_coefficients_rank_by_true_effect(frame):
    result = standardised_ols(frame, "y", ["x1", "x2"])
    drivers = result.drivers()
    assert drivers[0].name == "x1"
    assert abs(drivers[0].beta) > abs(drivers[1].beta)
    assert result.r_squared > 0.95
    assert all(c.significant for c in result.coefficients)


def test_standardising_makes_units_comparable():
    # Same relationship, one predictor rescaled by 1000. Raw coefficients would
    # differ by 1000x; standardised ones must not.
    rng = np.random.default_rng(1)
    x = rng.normal(size=300)
    frame = pd.DataFrame({"y": 3 * x, "small": x, "large": x * 1000})
    a = standardised_ols(frame, "y", ["small"]).coefficients[0].beta
    b = standardised_ols(frame, "y", ["large"]).coefficients[0].beta
    assert a == pytest.approx(b, abs=1e-6)


def test_vif_flags_a_near_duplicate_predictor(frame):
    # This is why VIF is reported: `duplicate` carries almost the same
    # information as x1, and a regression on both would split their shared
    # effect arbitrarily and report each as weaker than it is.
    results = {v.column: v for v in variance_inflation(frame, ["x1", "x2", "duplicate"])}
    assert results["duplicate"].vif > 10
    assert results["duplicate"].severity == "severe"
    assert results["x2"].severity == "acceptable"


def test_vif_is_one_for_independent_predictors(frame):
    results = {v.column: v for v in variance_inflation(frame, ["x1", "x2"])}
    assert results["x1"].vif == pytest.approx(1.0, abs=0.1)


def test_correlation_finds_the_strongest_pair(frame):
    correlation = correlation_matrix(frame, ["x1", "x2", "duplicate"])
    a, b, r = correlation.strongest(1)[0]
    assert {a, b} == {"x1", "duplicate"}
    assert r > 0.99


def test_pca_collapses_redundant_dimensions(frame):
    # x1 and duplicate are nearly the same direction, so two components should
    # already carry almost all the variance of three columns.
    pca = principal_components(frame, ["x1", "x2", "duplicate"])
    assert sum(pca.explained_variance_ratio) == pytest.approx(1.0, abs=1e-9)
    assert pca.components_for(0.9) <= 2


def test_ols_drops_a_constant_predictor_rather_than_failing():
    frame = pd.DataFrame({"y": [1.0, 2, 3, 4], "x": [1.0, 2, 3, 4], "constant": [7.0, 7, 7, 7]})
    result = standardised_ols(frame, "y", ["x", "constant"])
    assert [c.name for c in result.coefficients] == ["x"]
