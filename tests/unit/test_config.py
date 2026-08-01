"""Config validation at the boundary.

`Stem` enforces a minimum hairpin of 3 internally and would raise from deep
inside candidate generation with a confusing message if `min_hairpin` were let
through unchecked. `FoldQConfig.__post_init__` catches that -- and the analogous
cases for `min_stem_length` and the two `dangles` knobs -- right where the bad
value was supplied.
"""

from __future__ import annotations

import pytest

from foldq.config import FoldQConfig


def test_default_config_constructs_without_error():
    FoldQConfig()


def test_min_hairpin_below_three_is_rejected():
    with pytest.raises(ValueError, match="min_hairpin must be at least 3"):
        FoldQConfig(min_hairpin=2)


def test_min_hairpin_at_the_boundary_is_accepted():
    FoldQConfig(min_hairpin=3)


def test_min_stem_length_below_one_is_rejected():
    with pytest.raises(ValueError, match="min_stem_length must be at least 1"):
        FoldQConfig(min_stem_length=0)


def test_min_stem_length_at_the_boundary_is_accepted():
    FoldQConfig(min_stem_length=1)


@pytest.mark.parametrize("bad", [-1, 4, 10])
def test_dangles_out_of_range_is_rejected(bad):
    with pytest.raises(ValueError, match="dangles must be 0-3"):
        FoldQConfig(dangles=bad)


@pytest.mark.parametrize("bad", [-1, 4, 10])
def test_energy_dangles_out_of_range_is_rejected(bad):
    with pytest.raises(ValueError, match="energy_dangles must be 0-3"):
        FoldQConfig(energy_dangles=bad)


@pytest.mark.parametrize("value", [0, 1, 2, 3])
def test_dangles_and_energy_dangles_accept_every_valid_vienna_value(value):
    FoldQConfig(dangles=value)
    FoldQConfig(energy_dangles=value)


def test_dangles_and_energy_dangles_differ_by_default():
    """The whole point of the split: reference/rescoring stays on standard
    ViennaRNA behaviour (dangles=2) while the QUBO's energy coefficients come
    from the additive-over-loops model (energy_dangles=0)."""
    config = FoldQConfig()
    assert config.dangles == 2
    assert config.energy_dangles == 0


def test_merged_with_ignores_unset_overrides():
    base = FoldQConfig(seed=7)
    merged = base.merged_with(seed=None, min_hairpin=None)
    assert merged == base


def test_merged_with_applies_set_overrides():
    base = FoldQConfig(seed=7)
    merged = base.merged_with(seed=99)
    assert merged.seed == 99
    assert merged.min_hairpin == base.min_hairpin


def test_from_yaml_reads_known_fields_and_ignores_unknown(tmp_path):
    path = tmp_path / "config.yaml"
    path.write_text("seed: 5\nmin_hairpin: 4\nsome_future_field: 123\n")
    config = FoldQConfig.from_yaml(path)
    assert config.seed == 5
    assert config.min_hairpin == 4


def test_from_yaml_still_validates(tmp_path):
    path = tmp_path / "config.yaml"
    path.write_text("min_hairpin: 1\n")
    with pytest.raises(ValueError, match="min_hairpin must be at least 3"):
        FoldQConfig.from_yaml(path)


def test_as_dict_round_trips_every_field():
    config = FoldQConfig()
    as_dict = config.as_dict()
    assert as_dict["dangles"] == 2
    assert as_dict["energy_dangles"] == 0
    assert FoldQConfig(**as_dict) == config
