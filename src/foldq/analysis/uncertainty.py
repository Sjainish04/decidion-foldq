"""Uncertainty estimates for reported statistics.

Every headline number in this project is computed from a sample — 19 instances,
30 determinate solver runs, 27 circuits. Reporting a point estimate without an
interval invites a reader to treat 89.5% and 88.1% as different findings when the
sample cannot distinguish them.

Two estimators, chosen for what they are actually valid on:

- `bootstrap_ci` for means of continuous quantities (base-pair F1, energy gap,
  correlation). It assumes only that observations are exchangeable, which is the
  right assumption for independent instances.
- `wilson_ci` for proportions (gate pass rates, ground-state rates). The textbook
  normal-approximation interval is badly wrong exactly where this project lives:
  small n and rates near 0 or 1. At 30/30 it returns [1.0, 1.0], claiming
  certainty from 30 observations, and below n=30 it can extend past 1.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class Interval:
    """A point estimate with a confidence interval."""

    estimate: float
    low: float
    high: float
    confidence: float = 0.95
    n: int = 0

    def __str__(self) -> str:
        return f"{self.estimate:.4g} [{self.low:.4g}, {self.high:.4g}]"

    @property
    def width(self) -> float:
        return self.high - self.low


def bootstrap_ci(
    values: Sequence[float],
    *,
    statistic: str = "mean",
    confidence: float = 0.95,
    resamples: int = 10_000,
    seed: int = 42,
) -> Interval:
    """Percentile bootstrap interval for a statistic of `values`.

    Seeded, so a reported interval is reproducible rather than shifting slightly
    on every run of the analysis.
    """
    array = np.asarray([v for v in values if not math.isnan(v)], dtype=float)
    if array.size == 0:
        return Interval(float("nan"), float("nan"), float("nan"), confidence, 0)
    if array.size == 1:
        only = float(array[0])
        return Interval(only, only, only, confidence, 1)

    # Annotated rather than left to inference: a bare dict of numpy ufuncs types
    # as object, and mypy then rejects every call through it.
    reducers: dict[str, Callable[..., Any]] = {"mean": np.mean, "median": np.median}
    func = reducers[statistic]
    rng = np.random.default_rng(seed)
    indices = rng.integers(0, array.size, size=(resamples, array.size))
    draws = func(array[indices], axis=1)

    tail = (1.0 - confidence) / 2.0
    low, high = np.quantile(draws, [tail, 1.0 - tail])
    return Interval(float(func(array)), float(low), float(high), confidence, int(array.size))


def wilson_ci(successes: int, trials: int, *, confidence: float = 0.95) -> Interval:
    """Wilson score interval for a binomial proportion.

    Used instead of the normal approximation because this project's rates sit at
    the boundary. Gate B is 17/19 and several solvers are 30/30; the normal
    interval gives 30/30 a width of zero, which would report certainty the data
    does not support.
    """
    if trials <= 0:
        return Interval(float("nan"), float("nan"), float("nan"), confidence, 0)

    z = {0.90: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004}.get(
        confidence
    )
    if z is None:
        raise ValueError(f"unsupported confidence {confidence!r}; use 0.90, 0.95 or 0.99")

    proportion = successes / trials
    denominator = 1.0 + z**2 / trials
    centre = (proportion + z**2 / (2 * trials)) / denominator
    spread = (
        z * math.sqrt(proportion * (1 - proportion) / trials + z**2 / (4 * trials**2)) / denominator
    )
    return Interval(
        proportion,
        max(0.0, centre - spread),
        min(1.0, centre + spread),
        confidence,
        trials,
    )


def format_rate(successes: int, trials: int, *, confidence: float = 0.95) -> str:
    """`17/19 = 89.5% [69.2%, 97.1%]` — the form used in the README tables."""
    interval = wilson_ci(successes, trials, confidence=confidence)
    if trials == 0:
        return "0/0 = n/a"
    return (
        f"{successes}/{trials} = {interval.estimate:.1%} [{interval.low:.1%}, {interval.high:.1%}]"
    )
