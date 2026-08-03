"""Model-based analysis of what drives this project's outcomes.

Complements `multivariate`, which is linear. A random forest picks up the
thresholds and interactions a linear model cannot: "F1 collapses once the
instance passes the exact solver's ceiling" is a step, not a slope.

Three things are reported, and each is chosen so the result cannot flatter
itself:

- **Grouped out-of-fold predictions.** Every point is predicted by a model that
  never saw it *or any other row from the same sequence*. Plain shuffled
  cross-validation is not enough here: each sequence contributes 18 rows (one per
  solver and seed), and (length, num_variables) uniquely identifies it, so a
  shuffled split lets the forest recognise a sequence it has already seen and
  reproduce its known difficulty. That scored R2 0.835 while generalising to a
  new sequence barely at all.
- **A learning curve.** Whether the ceiling is the model or the data. If the
  curve is still climbing at the full sample, the honest statement is that there
  is not enough data yet.
- **Permutation importance**, measured out-of-fold. Impurity importance is
  biased toward high-cardinality continuous predictors, which is most of the
  columns here.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class OutOfFoldFit:
    """A cross-validated fit, with per-point predictions no fold saw in training."""

    outcome: str
    features: list[str]
    n: int
    folds: int
    r2: float
    mae: float
    rmse: float
    actual: list[float]
    predicted: list[float]
    #: Column the folds were grouped on, or None for a row-wise split.
    grouped_by: str | None = None

    @property
    def generalises(self) -> bool:
        """A forest that cannot beat predicting the mean has found no signal."""
        return self.r2 > 0.0


@dataclass(frozen=True)
class FeatureImportance:
    feature: str
    importance: float
    std: float


@dataclass(frozen=True)
class LearningPoint:
    train_size: int
    train_score: float
    test_score: float


def _matrix(
    frame: pd.DataFrame, outcome: str, features: list[str]
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    columns = [outcome, *features]
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce").dropna()
    raw = numeric[features].to_numpy(float)
    keep = [i for i in range(raw.shape[1]) if raw[:, i].std() > 0]
    return raw[:, keep], numeric[outcome].to_numpy(float), [features[i] for i in keep]


def out_of_fold_fit(
    frame: pd.DataFrame,
    outcome: str,
    features: list[str],
    *,
    folds: int = 5,
    seed: int = 42,
    group: str | None = None,
) -> OutOfFoldFit:
    """Cross-validated random forest, returning predictions for every point.

    Pass `group` (e.g. "sequence_id") whenever rows are repeated measurements of
    the same underlying thing. Without it the split is row-wise, and a model can
    score well by recognising a unit it has already seen rather than by
    generalising to a new one.
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import GroupKFold, KFold, cross_val_predict

    X, y, names = _matrix(frame, outcome, features)
    model = RandomForestRegressor(n_estimators=300, random_state=seed, n_jobs=1)

    if group is not None:
        groups = frame.loc[frame[[outcome, *features]].dropna().index, group].to_numpy()
        folds = max(2, min(folds, len(set(groups))))
        splitter = GroupKFold(n_splits=folds)
        predicted = cross_val_predict(model, X, y, cv=splitter, groups=groups)
    else:
        folds = max(2, min(folds, len(y) // 2))
        predicted = cross_val_predict(model, X, y, cv=KFold(folds, shuffle=True, random_state=seed))

    residual = y - predicted
    ss_res = float(residual @ residual)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return OutOfFoldFit(
        outcome=outcome,
        features=names,
        n=len(y),
        folds=folds,
        grouped_by=group,
        r2=float(1.0 - ss_res / ss_tot) if ss_tot > 0 else float("nan"),
        mae=float(np.abs(residual).mean()),
        rmse=float(np.sqrt((residual**2).mean())),
        actual=[float(v) for v in y],
        predicted=[float(v) for v in predicted],
    )


def permutation_importance(
    frame: pd.DataFrame,
    outcome: str,
    features: list[str],
    *,
    seed: int = 42,
    repeats: int = 20,
    group: str | None = None,
) -> list[FeatureImportance]:
    """How much held-out accuracy each feature is worth.

    Permutation rather than impurity importance: impurity favours predictors with
    many distinct values, and nearly every column here is continuous, so it would
    rank them by cardinality as much as by effect.
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.inspection import permutation_importance as sk_permutation
    from sklearn.model_selection import GroupShuffleSplit, train_test_split

    X, y, names = _matrix(frame, outcome, features)
    if group is not None:
        # Hold out whole groups, or the "test" set contains rows from sequences
        # the model already trained on and every feature looks informative.
        groups = frame.loc[frame[[outcome, *features]].dropna().index, group].to_numpy()
        train_idx, test_idx = next(
            GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=seed).split(X, y, groups)
        )
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=seed)
    model = RandomForestRegressor(n_estimators=300, random_state=seed, n_jobs=1).fit(
        X_train, y_train
    )
    result = sk_permutation(model, X_test, y_test, n_repeats=repeats, random_state=seed, n_jobs=1)

    return sorted(
        (
            FeatureImportance(name, float(m), float(s))
            for name, m, s in zip(
                names, result.importances_mean, result.importances_std, strict=True
            )
        ),
        key=lambda f: -f.importance,
    )


def learning_curve(
    frame: pd.DataFrame,
    outcome: str,
    features: list[str],
    *,
    seed: int = 42,
    group: str | None = None,
) -> list[LearningPoint]:
    """Held-out accuracy against training-set size.

    Answers whether more data would help. A curve still rising at the full sample
    means the limit is the sample, not the model — which is worth saying plainly
    rather than presenting the final score as a ceiling.
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import GroupKFold, KFold
    from sklearn.model_selection import learning_curve as sk_learning_curve

    X, y, _ = _matrix(frame, outcome, features)
    groups = None
    if group is not None:
        groups = frame.loc[frame[[outcome, *features]].dropna().index, group].to_numpy()
        cv = GroupKFold(n_splits=max(2, min(5, len(set(groups)))))
    else:
        # Shuffled explicitly: the CSVs are ordered by sequence, so an unshuffled
        # split would hold out whole blocks and understate the score for a reason
        # that has nothing to do with sample size.
        cv = KFold(n_splits=min(5, max(2, len(y) // 10)), shuffle=True, random_state=seed)

    sizes, train, test = sk_learning_curve(
        RandomForestRegressor(n_estimators=200, random_state=seed, n_jobs=1),
        X,
        y,
        cv=cv,
        groups=groups,
        train_sizes=np.linspace(0.2, 1.0, 5),
        random_state=seed,
        n_jobs=1,
    )
    return [
        LearningPoint(int(s), float(tr.mean()), float(te.mean()))
        for s, tr, te in zip(sizes, train, test, strict=True)
    ]


@dataclass(frozen=True)
class MarginalEffect:
    """Mean outcome at each level of one factor."""

    factor: str
    level: str
    mean: float
    n: int


def marginal_effects(frame: pd.DataFrame, outcome: str, factors: list[str]) -> list[MarginalEffect]:
    """Partial dependence, computed exactly rather than approximated.

    E1 is a full factorial sweep over energy model, nesting policy and overlap
    penalty, so the marginal mean at each level IS the partial dependence — there
    is no need to average a model's predictions over a synthetic grid, and doing
    so would only add the model's error to a quantity the design already gives.
    """
    effects: list[MarginalEffect] = []
    for factor in factors:
        if factor not in frame.columns:
            continue
        for level, group in frame.groupby(factor):
            values = pd.to_numeric(group[outcome], errors="coerce").dropna()
            if len(values):
                effects.append(
                    MarginalEffect(factor, str(level), float(values.mean()), len(values))
                )
    return effects


@dataclass(frozen=True)
class ParetoPoint:
    label: str
    cost: float
    benefit: float
    on_frontier: bool


def pareto_frontier(
    frame: pd.DataFrame, *, label: str, cost: str, benefit: str, minimise_cost: bool = True
) -> list[ParetoPoint]:
    """Points not dominated on both axes at once.

    A configuration is on the frontier when nothing else is cheaper AND at least
    as good. This is what makes the encoding trade-off legible: the smallest
    encoding is not the best one, and the most representable is not free.
    """
    rows = frame[[label, cost, benefit]].dropna()
    points = [(str(r[label]), float(r[cost]), float(r[benefit])) for _, r in rows.iterrows()]

    result: list[ParetoPoint] = []
    for name, c, b in points:
        dominated = any(
            (oc <= c if minimise_cost else oc >= c) and ob >= b and (oc != c or ob != b)
            for _, oc, ob in points
        )
        result.append(ParetoPoint(name, c, b, not dominated))
    return sorted(result, key=lambda p: p.cost)
