import numpy as np
import pandas as pd
import pytest

from foldq.analysis.drivers import (
    learning_curve,
    marginal_effects,
    out_of_fold_fit,
    pareto_frontier,
    permutation_importance,
)


@pytest.fixture
def frame():
    rng = np.random.default_rng(0)
    n = 240
    signal = rng.normal(size=n)
    noise = rng.normal(size=n)
    return pd.DataFrame(
        {
            "y": np.where(signal > 0, 3 * signal, 0.2 * signal) + rng.normal(scale=0.1, size=n),
            "signal": signal,
            "noise": noise,
        }
    )


def test_out_of_fold_predictions_are_not_in_sample(frame):
    fit = out_of_fold_fit(frame, "y", ["signal", "noise"], folds=5)
    assert fit.n == len(frame)
    assert fit.generalises
    # A forest fitted and scored on the same rows would sit near 1.0. Out of
    # fold it must be clearly below that even on an easy signal.
    assert 0.5 < fit.r2 < 0.99
    assert len(fit.actual) == len(fit.predicted) == fit.n


def test_pure_noise_does_not_generalise():
    rng = np.random.default_rng(3)
    frame = pd.DataFrame({"y": rng.normal(size=200), "noise": rng.normal(size=200)})
    fit = out_of_fold_fit(frame, "y", ["noise"], folds=5)
    # The guard that matters: with no signal, out-of-fold R2 must not be positive.
    assert fit.r2 < 0.1
    assert not fit.generalises


def test_permutation_importance_separates_signal_from_noise(frame):
    ranked = permutation_importance(frame, "y", ["signal", "noise"], repeats=10)
    assert ranked[0].feature == "signal"
    assert ranked[0].importance > ranked[1].importance


def test_learning_curve_reports_increasing_train_sizes(frame):
    curve = learning_curve(frame, "y", ["signal", "noise"])
    sizes = [p.train_size for p in curve]
    assert sizes == sorted(sizes)
    assert len(curve) == 5


def test_marginal_effects_are_exact_group_means():
    # E1 is a factorial design, so this is the partial dependence itself, not an
    # approximation of it.
    frame = pd.DataFrame(
        {
            "model": ["a", "a", "b", "b"],
            "policy": ["x", "y", "x", "y"],
            "score": [1.0, 3.0, 5.0, 7.0],
        }
    )
    effects = {
        (e.factor, e.level): e for e in marginal_effects(frame, "score", ["model", "policy"])
    }
    assert effects[("model", "a")].mean == pytest.approx(2.0)
    assert effects[("model", "b")].mean == pytest.approx(6.0)
    assert effects[("policy", "x")].mean == pytest.approx(3.0)
    assert effects[("model", "a")].n == 2


def test_pareto_keeps_only_undominated_points():
    frame = pd.DataFrame(
        {
            "name": ["cheap-bad", "mid", "costly-best", "dominated"],
            "cost": [1.0, 5.0, 10.0, 6.0],
            "benefit": [0.2, 0.7, 0.95, 0.6],
        }
    )
    points = {
        p.label: p for p in pareto_frontier(frame, label="name", cost="cost", benefit="benefit")
    }
    assert points["cheap-bad"].on_frontier
    assert points["mid"].on_frontier
    assert points["costly-best"].on_frontier
    # Costs more than `mid` and delivers less: dominated.
    assert not points["dominated"].on_frontier
