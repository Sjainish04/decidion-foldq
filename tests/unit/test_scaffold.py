# tests/unit/test_scaffold.py
import foldq
from foldq.constants import CANONICAL_PAIRS, DEKACAL_PER_KCAL, WOBBLE_PAIRS


def test_package_exposes_version():
    assert foldq.__version__ == "0.1.0"


def test_dekacal_conversion_is_hundred():
    assert DEKACAL_PER_KCAL == 100.0


def test_pair_tables_are_disjoint_and_symmetric():
    assert not (CANONICAL_PAIRS & WOBBLE_PAIRS)
    for a, b in CANONICAL_PAIRS | WOBBLE_PAIRS:
        assert (b, a) in CANONICAL_PAIRS | WOBBLE_PAIRS


def test_scientific_stack_imports():
    import dimod  # noqa: F401
    import networkx  # noqa: F401
    import RNA

    assert RNA.fold("GGGAAAUCCCU")[0] == "(((....)))."
