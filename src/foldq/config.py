"""Experiment configuration with documented precedence.

Precedence, lowest to highest: package defaults, YAML file, CLI arguments.
Every resolved value is written into the run manifest.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

import yaml

from foldq.constants import DEFAULT_MIN_HAIRPIN, DEFAULT_MIN_STEM_LENGTH, DEFAULT_TEMPERATURE_C
from foldq.encodings.energy import EnergyModel, NestingPolicy


@dataclass(frozen=True)
class FoldQConfig:
    """Every knob that affects a run."""

    seed: int = 42
    temperature_celsius: float = DEFAULT_TEMPERATURE_C
    allow_wobble: bool = True
    min_hairpin: int = DEFAULT_MIN_HAIRPIN
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH
    expand_substems: bool = False
    energy_model: EnergyModel = "charge_refund"
    # immediate_only, not all_nestable: under all_nestable a stem inside a deep
    # nesting chain accrues one refund per ancestor. Ancestors nest, so they are
    # mutually conflict-free and their refunds stack past the hard-constraint
    # penalty, making an overlapping selection profitable. Measured: 14 of 18
    # instances at 70-150 nt had structurally invalid optima. This default must
    # stay in sync with build_stem_qubo's.
    nesting_policy: NestingPolicy = "immediate_only"
    forbid_crossing: bool = True
    overlap_penalty: float | None = None
    crossing_penalty: float | None = None
    num_reads: int = 200
    repair_invalid: bool = True
    exact_max_variables: int = 22
    no_lonely_pairs: bool = False
    # Two dangling-end settings, deliberately different. ViennaRNA's default
    # dangles=2 model adds dangling-end bonuses on unpaired nucleotides adjacent
    # to a helix; those terms attach to unpaired context rather than to any
    # stem, so a stem-indexed QUBO cannot represent them at any penalty setting
    # (measured ~1.20 kcal/mol gap on this project's demo fixture -- see
    # tests/scientific/test_vienna.py::test_dangles_gap_is_measured_not_hidden).
    # `energy_dangles` is what extracts the QUBO's energy coefficients, and
    # stays at 0, where the Turner model is exactly additive over loops --
    # exactly what the charge-and-refund construction assumes. `dangles` is
    # what folds the reference structure and rescores the decoded candidate,
    # and stays at the standard value so the benchmark comparison is against
    # ordinary ViennaRNA behaviour, not a hobbled one.
    dangles: int = 2
    energy_dangles: int = 0

    def __post_init__(self) -> None:
        if self.min_hairpin < 3:
            raise ValueError(
                f"min_hairpin must be at least 3 (got {self.min_hairpin}); "
                "Stem enforces this invariant internally and would raise during "
                "candidate generation instead"
            )
        if self.min_stem_length < 1:
            raise ValueError(
                f"min_stem_length must be at least 1 (got {self.min_stem_length})"
            )
        if self.dangles not in (0, 1, 2, 3):
            raise ValueError(f"dangles must be 0-3 (got {self.dangles})")
        if self.energy_dangles not in (0, 1, 2, 3):
            raise ValueError(f"energy_dangles must be 0-3 (got {self.energy_dangles})")

    @classmethod
    def from_yaml(cls, path: str | Path) -> FoldQConfig:
        payload = yaml.safe_load(Path(path).read_text()) or {}
        known = {key: value for key, value in payload.items() if key in cls.__annotations__}
        return cls(**known)

    def merged_with(self, **overrides: Any) -> FoldQConfig:
        """Apply CLI overrides, ignoring unset (None) values."""
        applied = {key: value for key, value in overrides.items() if value is not None}
        return replace(self, **applied)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)
