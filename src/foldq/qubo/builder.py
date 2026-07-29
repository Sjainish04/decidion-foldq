"""Penalty calibration shared by every encoding."""

from __future__ import annotations


def calibrate_penalty(linear: dict[int, float]) -> float:
    """A penalty large enough that no energy reward can pay for a violation.

    Selecting one extra conflicting variable gains at most `max|E_s|`, so a penalty
    strictly above that makes every violation unprofitable. The margin keeps the
    coefficient range tight, which matters for noisy and analog hardware.
    """
    largest_gain = max((abs(value) for value in linear.values()), default=0.0)
    return 2.0 * largest_gain + 1.0
