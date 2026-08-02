"""Multivariate statistics over this project's own experiment output.

The experiments report one outcome at a time — Gate B here, base-pair F1 there.
That leaves the obvious question unanswered: of the knobs this project exposes,
which ones actually move the result, and which look like they do only because
they travel with something else?

The tools here answer that on the committed CSVs:

- a correlation matrix, to see what moves together at all;
- variance inflation factors, because several predictors are near-duplicates —
  variable count and sequence length carry much of the same information, and an
  unregularised regression will split their shared effect arbitrarily between
  them and report both as weak;
- standardised OLS with t statistics, so coefficients are comparable across
  predictors measured in different units;
- PCA, to show how many independent directions the instance space really has.

Implemented on numpy rather than statsmodels: these are closed-form, the
matrices are tiny, and it keeps the analysis extra to one dependency.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Correlation:
    columns: list[str]
    matrix: list[list[float]]
    method: str = "pearson"

    def strongest(self, limit: int = 8) -> list[tuple[str, str, float]]:
        """Off-diagonal pairs by absolute correlation, strongest first."""
        pairs: list[tuple[str, str, float]] = []
        for i, a in enumerate(self.columns):
            for j, b in enumerate(self.columns):
                if j <= i:
                    continue
                pairs.append((a, b, self.matrix[i][j]))
        return sorted(pairs, key=lambda p: -abs(p[2]))[:limit]


def correlation_matrix(
    frame: pd.DataFrame, columns: list[str], method: str = "pearson"
) -> Correlation:
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce").dropna()
    matrix = numeric.corr(method=method)
    return Correlation(
        columns=list(matrix.columns),
        matrix=[[float(v) for v in row] for row in matrix.to_numpy()],
        method=method,
    )


@dataclass(frozen=True)
class VarianceInflation:
    column: str
    vif: float

    @property
    def severity(self) -> str:
        """Conventional reading: >10 is severe, >5 worth noting."""
        if not np.isfinite(self.vif):
            return "perfectly collinear"
        if self.vif > 10:
            return "severe"
        if self.vif > 5:
            return "moderate"
        return "acceptable"


def variance_inflation(frame: pd.DataFrame, columns: list[str]) -> list[VarianceInflation]:
    """VIF per predictor: 1 / (1 - R²) of that predictor on the others.

    Reported because this project's predictors genuinely overlap. Sequence length
    largely determines variable count, which largely determines the number of
    quadratic terms. A regression fitted on all three does not have three
    independent pieces of evidence, and its individual coefficients should not be
    read as though it did.
    """
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce").dropna()
    results: list[VarianceInflation] = []

    for column in columns:
        others = [c for c in columns if c != column]
        if not others:
            results.append(VarianceInflation(column, 1.0))
            continue
        X = np.column_stack([np.ones(len(numeric)), numeric[others].to_numpy(float)])
        y = numeric[column].to_numpy(float)
        if np.allclose(y, y[0]):
            results.append(VarianceInflation(column, float("nan")))
            continue
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        residual = y - X @ beta
        ss_res = float(residual @ residual)
        ss_tot = float(((y - y.mean()) ** 2).sum())
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        vif = float("inf") if r2 >= 1.0 else 1.0 / (1.0 - r2)
        results.append(VarianceInflation(column, vif))

    return sorted(results, key=lambda v: -v.vif if np.isfinite(v.vif) else -1e18)


@dataclass(frozen=True)
class Coefficient:
    name: str
    beta: float
    std_error: float
    t: float
    p_value: float

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05


@dataclass(frozen=True)
class Regression:
    outcome: str
    coefficients: list[Coefficient]
    r_squared: float
    adjusted_r_squared: float
    n: int
    note: str = ""

    def drivers(self) -> list[Coefficient]:
        """Predictors ordered by absolute standardised effect."""
        return sorted(self.coefficients, key=lambda c: -abs(c.beta))


def standardised_ols(frame: pd.DataFrame, outcome: str, predictors: list[str]) -> Regression:
    """OLS on z-scored predictors, so coefficients compare across units.

    Standardising is what makes "which knob moves this most" answerable at all:
    a raw coefficient on sequence length (tens of nt) and one on QUBO density
    (0-1) are not on the same scale and cannot be ranked against each other.
    """
    columns = [outcome, *predictors]
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce").dropna()
    n = len(numeric)

    y = numeric[outcome].to_numpy(float)
    raw = numeric[predictors].to_numpy(float)

    # Drop predictors with no variance; they carry no information and would make
    # the design matrix singular.
    keep = [i for i in range(raw.shape[1]) if raw[:, i].std() > 0]
    names = [predictors[i] for i in keep]
    raw = raw[:, keep]

    X = (raw - raw.mean(axis=0)) / raw.std(axis=0)
    X = np.column_stack([np.ones(n), X])

    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    residual = y - X @ beta
    dof = n - X.shape[1]
    ss_res = float(residual @ residual)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    adj = 1.0 - (1.0 - r2) * (n - 1) / dof if dof > 0 else float("nan")

    sigma2 = ss_res / dof if dof > 0 else float("nan")
    covariance = sigma2 * np.linalg.pinv(X.T @ X)
    errors = np.sqrt(np.clip(np.diag(covariance), 0, None))

    from scipy import stats

    coefficients = []
    for i, name in enumerate(names, start=1):
        se = float(errors[i])
        t = float(beta[i] / se) if se > 0 else float("nan")
        p = (
            float(2 * (1 - stats.t.cdf(abs(t), dof)))
            if dof > 0 and np.isfinite(t)
            else float("nan")
        )
        coefficients.append(Coefficient(name, float(beta[i]), se, t, p))

    return Regression(outcome, coefficients, r2, adj, n)


@dataclass(frozen=True)
class PrincipalComponents:
    columns: list[str]
    explained_variance_ratio: list[float]
    loadings: list[list[float]] = field(default_factory=list)
    scores: list[list[float]] = field(default_factory=list)

    def components_for(self, proportion: float = 0.9) -> int:
        """How many components are needed to reach `proportion` of the variance."""
        total = 0.0
        for i, ratio in enumerate(self.explained_variance_ratio, start=1):
            total += ratio
            if total >= proportion:
                return i
        return len(self.explained_variance_ratio)


def principal_components(
    frame: pd.DataFrame, columns: list[str], keep: int = 2
) -> PrincipalComponents:
    """PCA on z-scored columns, via SVD.

    Standardised first, because these columns differ by orders of magnitude —
    unscaled, the component structure would just recover whichever column has the
    largest raw variance.
    """
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce").dropna()
    raw = numeric.to_numpy(float)
    keep_cols = [i for i in range(raw.shape[1]) if raw[:, i].std() > 0]
    names = [columns[i] for i in keep_cols]
    raw = raw[:, keep_cols]

    X = (raw - raw.mean(axis=0)) / raw.std(axis=0)
    _, singular, vt = np.linalg.svd(X, full_matrices=False)
    variance = singular**2
    ratio = (variance / variance.sum()).tolist()

    scores = (X @ vt[:keep].T).tolist()
    return PrincipalComponents(
        columns=names,
        explained_variance_ratio=[float(r) for r in ratio],
        loadings=[[float(v) for v in row] for row in vt[:keep]],
        scores=[[float(v) for v in row] for row in scores],
    )
