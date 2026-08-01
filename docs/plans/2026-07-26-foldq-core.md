# Decidion FoldQ Implementation Plan

> Implementation plan for the FoldQ core. Tasks are ordered by dependency and each ends with an independently testable deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible platform that encodes RNA secondary-structure prediction as a QUBO, solves it with classical, quantum-inspired, and gate-based methods, validates every result against ViennaRNA through a four-gate diagnostic ladder, and extends to pseudoknots that classical dynamic programming cannot represent.

**Architecture:** A single-direction pipeline — `SequenceRecord → CandidateSet → ConflictGraph → QuboProblem → SolverResult → FoldCandidate → GateReport`. Every solver implements one `FoldSolver` Protocol and shares an identical decode/repair/rescore path so comparisons stay fair. All energy coefficients derive from ViennaRNA's own Turner primitives rather than reimplemented constants.

**Tech Stack:** Python 3.11, ViennaRNA 2.7.2, Qiskit 2.5.1, qiskit-aer 0.17.2, qiskit-ibm-runtime (fake_provider only), dwave-ocean-sdk 9.4.0, dimod, networkx, numpy, scipy, pandas, pydantic, typer, jinja2, matplotlib, pytest, hypothesis, ruff, mypy.

**Spec:** `docs/design/2026-07-26-foldq-design.md`

## Global Constraints

- **Python 3.11 exactly.** Python 3.14 is the system default and the scientific stack has no wheels for it. Always `uv venv --python 3.11`.
- **Git identity is `Sjainish04 <jainish.solanki@mail.utoronto.ca>`** (local repo config, already set).
- **Commits carry no third-party tool attribution trailers.** This is a judged submission; authorship is the project team.
- **ViennaRNA indexing is 1-based; ours is 0-based.** Every call into `fold_compound.eval_*` converts with `+1`. Every value returned by `eval_int_loop` / `eval_hp_loop` is **dekacal/mol** and must be divided by `100.0`. This single conversion is the most likely source of silent scientific error in the project.
- **Only public, synthetic, or randomly generated sequences.** No confidential Moderna data, clinical information, proprietary sequences, or PII.
- **No paid service or account is required by any deliverable.** Aer + `fake_provider` + `dwave-samplers` only.
- **Minimum stem length defaults to 2**, minimum hairpin loop is 3 unpaired bases (so pair `(i,j)` requires `j - i - 1 >= 3`).
- **Every stochastic component takes an explicit seed.** Same seed must produce identical output.
- **No quantum-advantage claims** anywhere in code comments, docs, or output.

## File Structure

```
pyproject.toml                      package config, deps, ruff/mypy/pytest settings
Makefile                            reproduce, test, lint targets
src/foldq/
  __init__.py                       version
  constants.py                      pair tables, defaults, unit conversions
  config.py                         YAML load, precedence resolution
  schemas/
    sequence.py                     SequenceRecord
    structure.py                    Stem, ValidationReport, RepairOp
    qubo.py                         QuboProblem, PenaltyConfig
    result.py                       Sample, SolverResult, FoldCandidate
    gates.py                        GateReport
  classical/vienna.py               ViennaBackend, ViennaReference
  biology/
    pairs.py                        can_pair, candidate pair enumeration
    stems.py                        maximal stem generation, sub-stem expansion
    conflicts.py                    overlap/crossing predicates, conflict graph
    dotbracket.py                   dot-bracket <-> pair-list <-> stems
  encodings/
    energy.py                       charge-and-refund coefficients
    stem_encoding.py                stem QUBO assembly
    pair_encoding.py                pair QUBO assembly
  qubo/
    builder.py                      BQM assembly, penalty calibration
    ising.py                        QUBO -> Ising -> SparsePauliOp
  solvers/
    base.py                         FoldSolver Protocol, SolverConfig
    exact.py                        tree decomposition + brute force
    baselines.py                    random, greedy, local search
    annealing.py                    SA, tabu, path-integral SQA
    qaoa.py                         QAOA, CVaR, warm start, noise
  decoding/
    decode.py                       bits -> stems -> dot-bracket
    repair.py                       deterministic conflict repair
  evaluation/
    gates.py                        four-gate ladder
    metrics.py                      structural + energy metrics
    resources.py                    circuit + qubit resource accounting
  experiments/                      E1..E5 runners
  reporting/                        decision card, figures
  data/generate.py                  synthetic sequence generator
  cli.py                            typer CLI
tests/{unit,property,scientific,integration}/
data/fixtures/curated.json          vendored real RNAs incl. pseudoknots
```

---

## Phase 0 — Scaffold

### Task 1: Project scaffold and environment

**Files:**
- Create: `pyproject.toml`, `Makefile`, `src/foldq/__init__.py`, `src/foldq/constants.py`, `tests/conftest.py`
- Test: `tests/unit/test_scaffold.py`

**Interfaces:**
- Produces: package `foldq` importable with `foldq.__version__`; `foldq.constants.DEKACAL_PER_KCAL`, `CANONICAL_PAIRS`, `WOBBLE_PAIRS`, `DEFAULT_MIN_HAIRPIN`, `DEFAULT_MIN_STEM_LENGTH`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "foldq"
version = "0.1.0"
description = "Explainable hybrid quantum-classical optimization for mRNA secondary-structure prediction"
requires-python = ">=3.11,<3.12"
dependencies = [
    "viennarna>=2.7,<2.8",
    "dimod>=0.12",
    "dwave-samplers>=1.8",
    "networkx>=3.0",
    "numpy>=2.0",
    "scipy>=1.14",
    "pandas>=2.0",
    "pydantic>=2.0",
    "typer>=0.12",
    "jinja2>=3.1",
    "matplotlib>=3.8",
    "pyyaml>=6.0",
]

[project.optional-dependencies]
quantum = ["qiskit>=2.5,<3", "qiskit-aer>=0.17", "qiskit-ibm-runtime>=0.30"]
dev = ["pytest>=8.0", "pytest-cov>=5.0", "hypothesis>=6.100", "ruff>=0.6", "mypy>=1.11"]

[project.scripts]
foldq = "foldq.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/foldq"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.11"
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"
```

- [ ] **Step 2: Write `src/foldq/constants.py`**

```python
"""Project-wide constants and unit conversions."""

from typing import Final

DEKACAL_PER_KCAL: Final[float] = 100.0
"""ViennaRNA eval_* functions return dekacal/mol; divide by this to get kcal/mol."""

CANONICAL_PAIRS: Final[frozenset[tuple[str, str]]] = frozenset(
    {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G")}
)
WOBBLE_PAIRS: Final[frozenset[tuple[str, str]]] = frozenset({("G", "U"), ("U", "G")})
VALID_NUCLEOTIDES: Final[frozenset[str]] = frozenset("AUCG")

DEFAULT_MIN_HAIRPIN: Final[int] = 3
"""A hairpin loop needs at least 3 unpaired bases: pair (i,j) requires j - i - 1 >= 3."""

DEFAULT_MIN_STEM_LENGTH: Final[int] = 2
DEFAULT_TEMPERATURE_C: Final[float] = 37.0
```

- [ ] **Step 3: Write `src/foldq/__init__.py`**

```python
"""Decidion FoldQ: hybrid quantum-classical RNA secondary-structure prediction."""

__version__ = "0.1.0"
```

- [ ] **Step 4: Write the failing test**

```python
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
```

- [ ] **Step 5: Create the environment and run the test**

```bash
uv venv --python 3.11
uv pip install -e ".[dev,quantum]"
.venv/bin/pytest tests/unit/test_scaffold.py -v
```

Expected: PASS. If `RNA.fold` returns something else, stop — the ViennaRNA build differs from the one the spec was measured against and every downstream energy number is suspect.

- [ ] **Step 6: Write the `Makefile`**

```makefile
PY := .venv/bin/python
PYTEST := .venv/bin/pytest

.PHONY: test lint typecheck reproduce clean

test:
	$(PYTEST) tests -q

lint:
	.venv/bin/ruff check src tests
	.venv/bin/ruff format --check src tests

typecheck:
	.venv/bin/mypy src/foldq

reproduce:
	$(PY) -m foldq.experiments.run_all --output results/

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage
```

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml Makefile src/foldq tests/
git commit -m "feat: project scaffold with pinned Python 3.11 scientific stack"
```

---

## Phase 1 — Schemas and the ViennaRNA boundary

### Task 2: Core schemas

**Files:**
- Create: `src/foldq/schemas/__init__.py`, `src/foldq/schemas/sequence.py`, `src/foldq/schemas/structure.py`
- Test: `tests/unit/test_schemas.py`

**Interfaces:**
- Produces:
  - `SequenceRecord(sequence_id: str, sequence: str, source_type: str, random_seed: int | None = None, tags: tuple[str, ...] = ())` with properties `.length -> int`, `.gc_content -> float`, `.checksum -> str`
  - `Stem(i: int, j: int, k: int)` frozen and ordered, with `.pairs() -> tuple[tuple[int,int], ...]`, `.nucleotides() -> frozenset[int]`, `.outer_pair -> tuple[int,int]`, `.inner_pair -> tuple[int,int]`, `.span -> int`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_schemas.py
import pytest

from foldq.schemas.sequence import SequenceRecord
from foldq.schemas.structure import Stem


def test_sequence_record_normalizes_and_measures():
    rec = SequenceRecord(sequence_id="s1", sequence="ggcauT", source_type="synthetic")
    assert rec.sequence == "GGCAUU"  # lowercased and T->U
    assert rec.length == 6
    assert rec.gc_content == pytest.approx(3 / 6)
    assert len(rec.checksum) == 16


def test_sequence_record_rejects_invalid_nucleotide():
    with pytest.raises(ValueError, match="invalid nucleotide"):
        SequenceRecord(sequence_id="bad", sequence="GGXAU", source_type="synthetic")


def test_sequence_record_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        SequenceRecord(sequence_id="bad", sequence="", source_type="synthetic")


def test_stem_expands_to_stacked_pairs():
    stem = Stem(i=0, j=10, k=3)
    assert stem.pairs() == ((0, 10), (1, 9), (2, 8))
    assert stem.outer_pair == (0, 10)
    assert stem.inner_pair == (2, 8)
    assert stem.nucleotides() == frozenset({0, 1, 2, 8, 9, 10})
    assert stem.span == 11


def test_stem_rejects_non_positive_length():
    with pytest.raises(ValueError, match="at least one pair"):
        Stem(i=0, j=10, k=0)


def test_stem_rejects_self_crossing_geometry():
    # k so large the strands would pass through each other
    with pytest.raises(ValueError, match="overlap"):
        Stem(i=0, j=6, k=4)


def test_stems_are_hashable_and_sortable():
    a, b = Stem(0, 10, 3), Stem(1, 9, 2)
    assert len({a, b, Stem(0, 10, 3)}) == 2
    assert sorted([b, a])[0] == a
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.schemas'`

- [ ] **Step 3: Write `src/foldq/schemas/sequence.py`**

```python
"""Validated RNA sequence records."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from foldq.constants import VALID_NUCLEOTIDES


@dataclass(frozen=True)
class SequenceRecord:
    """A validated, normalized RNA sequence with provenance."""

    sequence_id: str
    sequence: str
    source_type: str
    random_seed: int | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        normalized = self.sequence.strip().upper().replace("T", "U")
        normalized = "".join(normalized.split())
        if not normalized:
            raise ValueError(f"sequence {self.sequence_id!r} is empty")
        bad = set(normalized) - VALID_NUCLEOTIDES
        if bad:
            raise ValueError(
                f"sequence {self.sequence_id!r} has invalid nucleotide(s): {sorted(bad)}"
            )
        object.__setattr__(self, "sequence", normalized)

    @property
    def length(self) -> int:
        return len(self.sequence)

    @property
    def gc_content(self) -> float:
        return (self.sequence.count("G") + self.sequence.count("C")) / self.length

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.sequence.encode()).hexdigest()[:16]
```

- [ ] **Step 4: Write `src/foldq/schemas/structure.py`**

```python
"""Structural primitives: stems, validation reports, repair operations."""

from __future__ import annotations

from dataclasses import dataclass, field

from foldq.constants import DEFAULT_MIN_HAIRPIN


@dataclass(frozen=True, order=True)
class Stem:
    """A stacked helix of `k` consecutive base pairs starting at the pair (i, j).

    Pairs are (i, j), (i+1, j-1), ..., (i+k-1, j-k+1). Indices are 0-based.
    """

    i: int
    j: int
    k: int

    def __post_init__(self) -> None:
        if self.k < 1:
            raise ValueError("a stem must contain at least one pair")
        if self.i < 0 or self.j < 0:
            raise ValueError("stem indices must be non-negative")
        if self.i >= self.j:
            raise ValueError(f"stem start {self.i} must precede end {self.j}")
        inner_i, inner_j = self.i + self.k - 1, self.j - self.k + 1
        if inner_i >= inner_j:
            raise ValueError(f"stem strands overlap: k={self.k} too large for span {self.j - self.i}")
        if inner_j - inner_i - 1 < DEFAULT_MIN_HAIRPIN:
            raise ValueError(
                f"stem leaves only {inner_j - inner_i - 1} unpaired bases; "
                f"minimum hairpin is {DEFAULT_MIN_HAIRPIN}"
            )

    def pairs(self) -> tuple[tuple[int, int], ...]:
        return tuple((self.i + t, self.j - t) for t in range(self.k))

    def nucleotides(self) -> frozenset[int]:
        return frozenset(idx for pair in self.pairs() for idx in pair)

    @property
    def outer_pair(self) -> tuple[int, int]:
        return (self.i, self.j)

    @property
    def inner_pair(self) -> tuple[int, int]:
        return (self.i + self.k - 1, self.j - self.k + 1)

    @property
    def span(self) -> int:
        return self.j - self.i + 1


@dataclass(frozen=True)
class ValidationReport:
    """Result of checking a decoded stem set for structural legality."""

    overlapping_pairs: tuple[tuple[int, int], ...] = field(default_factory=tuple)
    crossing_pairs: tuple[tuple[int, int], ...] = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:
        return not self.overlapping_pairs and not self.crossing_pairs

    @property
    def violation_count(self) -> int:
        return len(self.overlapping_pairs) + len(self.crossing_pairs)


@dataclass(frozen=True)
class RepairOp:
    """One deterministic edit made while repairing an invalid structure."""

    action: str
    stem: Stem
    reason: str
```

- [ ] **Step 5: Create `src/foldq/schemas/__init__.py`**

```python
"""Frozen data models shared across the pipeline."""
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_schemas.py -v`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/foldq/schemas tests/unit/test_schemas.py
git commit -m "feat: add SequenceRecord and Stem schemas with geometric validation"
```

---

### Task 3: ViennaRNA backend

This is the single most error-prone boundary in the project: 1-based indexing and dekacal units. Every energy number downstream depends on getting it right here, so it gets its own golden-fixture tests.

**Files:**
- Create: `src/foldq/classical/__init__.py`, `src/foldq/classical/vienna.py`
- Test: `tests/scientific/test_vienna.py`

**Interfaces:**
- Consumes: `Stem` from Task 2
- Produces:
  - `ViennaReference(sequence: str, mfe_structure: str, mfe_energy: float, base_pairs: frozenset[tuple[int,int]])`
  - `ViennaBackend(temperature_celsius: float = 37.0, no_lonely_pairs: bool = False)` with `.fold(seq) -> ViennaReference`, `.eval_structure(seq, dot_bracket) -> float`, `.stack_energy(seq, stem) -> float`, `.hairpin_energy(seq, stem) -> float`, `.interior_energy(seq, outer, inner) -> float`, `.partition_function(seq) -> tuple[str, float]`

- [ ] **Step 1: Write the failing test**

```python
# tests/scientific/test_vienna.py
import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_fold_matches_known_reference(backend):
    ref = backend.fold(DEMO)
    assert ref.mfe_structure == "(((....)))."
    assert ref.mfe_energy == pytest.approx(-3.70, abs=0.01)
    assert ref.base_pairs == frozenset({(0, 9), (1, 8), (2, 7)})


def test_eval_structure_agrees_with_fold_energy(backend):
    ref = backend.fold(DEMO)
    assert backend.eval_structure(DEMO, ref.mfe_structure) == pytest.approx(ref.mfe_energy, abs=0.01)


def test_stack_energy_is_in_kcal_not_dekacal(backend):
    """Regression guard: dekacal values are ~100x too large."""
    stem = Stem(i=0, j=9, k=3)
    energy = backend.stack_energy(DEMO, stem)
    assert -20.0 < energy < 0.0, f"{energy} looks like dekacal/mol, not kcal/mol"


def test_hairpin_energy_is_positive_and_small(backend):
    """Loop entropy costs energy, and in kcal/mol it is single digits."""
    stem = Stem(i=0, j=9, k=3)
    energy = backend.hairpin_energy(DEMO, stem)
    assert 0.0 < energy < 20.0


def test_stack_plus_hairpin_reconstructs_vienna_energy(backend):
    """For a lone hairpin, stacking + closure IS the whole structure energy."""
    stem = Stem(i=0, j=9, k=3)
    total = backend.stack_energy(DEMO, stem) + backend.hairpin_energy(DEMO, stem)
    assert total == pytest.approx(backend.fold(DEMO).mfe_energy, abs=0.01)


def test_single_pair_stem_has_zero_stacking(backend):
    assert backend.stack_energy(DEMO, Stem(i=0, j=9, k=1)) == pytest.approx(0.0)


def test_interior_energy_between_nested_stems():
    seq = "GGGCAUAAAAGCUUUUGCCC"
    backend = ViennaBackend()
    outer, inner = Stem(i=0, j=19, k=3), Stem(i=4, j=15, k=2)
    energy = backend.interior_energy(seq, outer, inner)
    assert -20.0 < energy < 20.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/scientific/test_vienna.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.classical'`

- [ ] **Step 3: Write `src/foldq/classical/vienna.py`**

```python
"""The ViennaRNA boundary.

Two conversions live here and nowhere else in the codebase:
  * ViennaRNA indices are 1-based; ours are 0-based.
  * ViennaRNA `eval_*` helpers return dekacal/mol; we work in kcal/mol.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import RNA

from foldq.constants import DEKACAL_PER_KCAL, DEFAULT_TEMPERATURE_C
from foldq.schemas.structure import Stem


@dataclass(frozen=True)
class ViennaReference:
    """The classical thermodynamic reference for one sequence."""

    sequence: str
    mfe_structure: str
    mfe_energy: float
    base_pairs: frozenset[tuple[int, int]]


def dotbracket_to_pairs(structure: str) -> frozenset[tuple[int, int]]:
    """Parse dot-bracket into 0-based (i, j) pairs with i < j."""
    stack: list[int] = []
    pairs: set[tuple[int, int]] = set()
    for idx, char in enumerate(structure):
        if char == "(":
            stack.append(idx)
        elif char == ")":
            if not stack:
                raise ValueError(f"unbalanced dot-bracket at position {idx}")
            pairs.add((stack.pop(), idx))
    if stack:
        raise ValueError(f"unbalanced dot-bracket: {len(stack)} unclosed pair(s)")
    return frozenset(pairs)


class ViennaBackend:
    """Thin, cached wrapper over the ViennaRNA Python bindings."""

    def __init__(
        self,
        temperature_celsius: float = DEFAULT_TEMPERATURE_C,
        no_lonely_pairs: bool = False,
    ) -> None:
        self.temperature_celsius = temperature_celsius
        self.no_lonely_pairs = no_lonely_pairs

    def _model(self) -> RNA.md:
        model = RNA.md()
        model.temperature = self.temperature_celsius
        if self.no_lonely_pairs:
            model.noLP = 1
        return model

    @lru_cache(maxsize=512)
    def _compound(self, sequence: str) -> RNA.fold_compound:
        return RNA.fold_compound(sequence, self._model())

    def fold(self, sequence: str) -> ViennaReference:
        """Minimum-free-energy fold."""
        structure, energy = self._compound(sequence).mfe()
        return ViennaReference(
            sequence=sequence,
            mfe_structure=structure,
            mfe_energy=float(energy),
            base_pairs=dotbracket_to_pairs(structure),
        )

    def eval_structure(self, sequence: str, dot_bracket: str) -> float:
        """Turner free energy of an arbitrary structure, in kcal/mol."""
        if len(sequence) != len(dot_bracket):
            raise ValueError(
                f"structure length {len(dot_bracket)} != sequence length {len(sequence)}"
            )
        return float(self._compound(sequence).eval_structure(dot_bracket))

    def stack_energy(self, sequence: str, stem: Stem) -> float:
        """Nearest-neighbour stacking energy of a helix, in kcal/mol.

        Zero for a single-pair stem, which has nothing to stack against.
        """
        compound = self._compound(sequence)
        pairs = stem.pairs()
        total = 0.0
        for outer, inner in zip(pairs, pairs[1:]):
            total += compound.eval_int_loop(
                outer[0] + 1, outer[1] + 1, inner[0] + 1, inner[1] + 1
            )
        return total / DEKACAL_PER_KCAL

    def hairpin_energy(self, sequence: str, stem: Stem) -> float:
        """Cost of closing a hairpin loop with this helix's innermost pair."""
        inner_i, inner_j = stem.inner_pair
        return self._compound(sequence).eval_hp_loop(inner_i + 1, inner_j + 1) / DEKACAL_PER_KCAL

    def interior_energy(self, sequence: str, outer: Stem, inner: Stem) -> float:
        """Interior-loop / bulge cost between an outer helix and one nested inside it."""
        oi, oj = outer.inner_pair
        ii, ij = inner.outer_pair
        return self._compound(sequence).eval_int_loop(oi + 1, oj + 1, ii + 1, ij + 1) / (
            DEKACAL_PER_KCAL
        )

    def partition_function(self, sequence: str) -> tuple[str, float]:
        """Ensemble free energy and centroid structure."""
        compound = self._compound(sequence)
        _, ensemble_energy = compound.pf()
        centroid, _ = compound.centroid()
        return centroid, float(ensemble_energy)
```

- [ ] **Step 4: Create `src/foldq/classical/__init__.py`**

```python
"""Classical thermodynamic reference layer."""
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/scientific/test_vienna.py -v`
Expected: PASS (7 tests). The `test_stack_plus_hairpin_reconstructs_vienna_energy` test is the important one — it proves the unit conversion and index offsets are simultaneously correct.

- [ ] **Step 6: Commit**

```bash
git add src/foldq/classical tests/scientific/test_vienna.py
git commit -m "feat: add ViennaRNA backend with unit and index conversions

Golden-fixture tests pin the dekacal->kcal conversion and 0-based->1-based
index offset, which are the two most likely sources of silent energy error."
```

---

## Phase 2 — Biological representation

### Task 4: Candidate pairs and maximal stems

**Files:**
- Create: `src/foldq/biology/__init__.py`, `src/foldq/biology/pairs.py`, `src/foldq/biology/stems.py`
- Test: `tests/unit/test_stems.py`

**Interfaces:**
- Consumes: `Stem` (Task 2), constants (Task 1)
- Produces:
  - `can_pair(a: str, b: str, allow_wobble: bool = True) -> bool`
  - `candidate_pairs(sequence: str, *, min_hairpin: int = 3, allow_wobble: bool = True) -> list[tuple[int,int]]`
  - `generate_maximal_stems(sequence: str, *, min_stem_length: int = 2, min_hairpin: int = 3, allow_wobble: bool = True) -> list[Stem]`
  - `expand_substems(stems: list[Stem], *, min_stem_length: int = 2, min_hairpin: int = 3) -> list[Stem]`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_stems.py
from foldq.biology.pairs import can_pair, candidate_pairs
from foldq.biology.stems import expand_substems, generate_maximal_stems
from foldq.schemas.structure import Stem


def test_canonical_and_wobble_pairing():
    assert can_pair("A", "U")
    assert can_pair("G", "C")
    assert can_pair("G", "U", allow_wobble=True)
    assert not can_pair("G", "U", allow_wobble=False)
    assert not can_pair("A", "G")
    assert not can_pair("A", "A")


def test_candidate_pairs_respect_min_hairpin():
    # AAAA...UUUU with a 3-base loop
    pairs = candidate_pairs("GGGAAAUCCCU", min_hairpin=3)
    for i, j in pairs:
        assert j - i - 1 >= 3


def test_maximal_stem_found_in_simple_hairpin():
    stems = generate_maximal_stems("GGGAAAUCCCU", min_stem_length=2)
    assert Stem(i=0, j=9, k=3) in stems


def test_maximal_stems_are_not_extendable():
    """A maximal stem's flanking pair must not itself be pairable."""
    seq = "GGGGAAAAUCCCC"
    stems = generate_maximal_stems(seq, min_stem_length=2)
    for stem in stems:
        outer_i, outer_j = stem.outer_pair
        if outer_i > 0 and outer_j < len(seq) - 1:
            assert not can_pair(seq[outer_i - 1], seq[outer_j + 1])


def test_min_stem_length_filters_short_helices():
    seq = "GGGAAAUCCCU"
    assert all(s.k >= 3 for s in generate_maximal_stems(seq, min_stem_length=3))
    assert all(s.k >= 2 for s in generate_maximal_stems(seq, min_stem_length=2))


def test_substem_expansion_produces_all_contiguous_subhelices():
    subs = expand_substems([Stem(i=0, j=10, k=3)], min_stem_length=2)
    assert Stem(0, 10, 3) in subs   # the whole helix
    assert Stem(0, 10, 2) in subs   # truncated from the inside
    assert Stem(1, 9, 2) in subs    # shifted inward
    assert Stem(0, 10, 1) not in subs  # below min_stem_length


def test_substem_expansion_is_deduplicated_and_sorted():
    subs = expand_substems([Stem(0, 10, 3), Stem(0, 10, 3)], min_stem_length=2)
    assert len(subs) == len(set(subs))
    assert subs == sorted(subs)


def test_no_stems_when_sequence_cannot_pair():
    assert generate_maximal_stems("AAAAAAAAAA", min_stem_length=2) == []


def test_generation_is_deterministic():
    seq = "GGGCAUAAAAGCUUUUGCCC"
    assert generate_maximal_stems(seq) == generate_maximal_stems(seq)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_stems.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.biology'`

- [ ] **Step 3: Write `src/foldq/biology/pairs.py`**

```python
"""Base-pair compatibility and candidate pair enumeration."""

from __future__ import annotations

from foldq.constants import CANONICAL_PAIRS, DEFAULT_MIN_HAIRPIN, WOBBLE_PAIRS


def can_pair(a: str, b: str, allow_wobble: bool = True) -> bool:
    """True if nucleotides `a` and `b` can form a base pair."""
    if (a, b) in CANONICAL_PAIRS:
        return True
    return allow_wobble and (a, b) in WOBBLE_PAIRS


def candidate_pairs(
    sequence: str,
    *,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> list[tuple[int, int]]:
    """Every (i, j) that could pair while leaving a legal hairpin loop."""
    n = len(sequence)
    return [
        (i, j)
        for i in range(n)
        for j in range(i + min_hairpin + 1, n)
        if can_pair(sequence[i], sequence[j], allow_wobble)
    ]
```

- [ ] **Step 4: Write `src/foldq/biology/stems.py`**

```python
"""Candidate helix (stem) generation.

Maximal helices are the primary encoding: they cannot be extended outward, which
compresses the variable count roughly 4x versus enumerating every sub-helix.
"""

from __future__ import annotations

from foldq.biology.pairs import can_pair
from foldq.constants import DEFAULT_MIN_HAIRPIN, DEFAULT_MIN_STEM_LENGTH
from foldq.schemas.structure import Stem


def generate_maximal_stems(
    sequence: str,
    *,
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> list[Stem]:
    """All helices that cannot be extended by one more pair on the outside.

    A helix seeded at (i, j) is only kept if (i-1, j+1) cannot pair; otherwise it
    is a sub-helix of a longer one and would be reported twice.
    """
    n = len(sequence)
    found: set[Stem] = set()

    for i in range(n):
        for j in range(i + min_hairpin + 1, n):
            if not can_pair(sequence[i], sequence[j], allow_wobble):
                continue
            # Skip non-maximal seeds: this helix extends outward, so a longer one exists.
            if (
                i > 0
                and j < n - 1
                and can_pair(sequence[i - 1], sequence[j + 1], allow_wobble)
            ):
                continue
            k = 0
            # Extend inward while the next pair is legal and leaves a valid hairpin.
            while (
                j - i - 2 * k >= min_hairpin + 1
                and can_pair(sequence[i + k], sequence[j - k], allow_wobble)
            ):
                k += 1
            if k >= min_stem_length:
                found.add(Stem(i=i, j=j, k=k))

    return sorted(found)


def expand_substems(
    stems: list[Stem],
    *,
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
) -> list[Stem]:
    """Every contiguous sub-helix of every input helix.

    Raises representability (the true fold may need a truncated helix) at the cost
    of roughly 4x more variables.
    """
    out: set[Stem] = set()
    for stem in stems:
        for offset in range(stem.k):
            for length in range(min_stem_length, stem.k - offset + 1):
                inner_i = stem.i + offset + length - 1
                inner_j = stem.j - offset - length + 1
                if inner_j - inner_i - 1 < min_hairpin:
                    continue
                out.add(Stem(i=stem.i + offset, j=stem.j - offset, k=length))
    return sorted(out)
```

- [ ] **Step 5: Create `src/foldq/biology/__init__.py`**

```python
"""Biological representation: pairs, helices, conflicts, dot-bracket."""
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_stems.py -v`
Expected: PASS (9 tests)

- [ ] **Step 7: Commit**

```bash
git add src/foldq/biology tests/unit/test_stems.py
git commit -m "feat: add candidate pair and maximal stem generation"
```

---

### Task 5: Conflict detection and conflict graph

**Files:**
- Create: `src/foldq/biology/conflicts.py`
- Test: `tests/unit/test_conflicts.py`

**Interfaces:**
- Consumes: `Stem` (Task 2)
- Produces:
  - `stems_overlap(a: Stem, b: Stem) -> bool`
  - `stems_cross(a: Stem, b: Stem) -> bool`
  - `stems_conflict(a: Stem, b: Stem, *, forbid_crossing: bool = True) -> bool`
  - `is_nested(outer: Stem, inner: Stem) -> bool`
  - `build_conflict_graph(stems: list[Stem], *, forbid_crossing: bool = True) -> networkx.Graph`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_conflicts.py
from foldq.biology.conflicts import (
    build_conflict_graph,
    is_nested,
    stems_conflict,
    stems_cross,
    stems_overlap,
)
from foldq.schemas.structure import Stem


def test_overlap_when_nucleotide_reused():
    assert stems_overlap(Stem(0, 20, 3), Stem(2, 30, 2))  # shares index 2
    assert not stems_overlap(Stem(0, 9, 2), Stem(20, 29, 2))


def test_nested_stems_do_not_conflict():
    outer, inner = Stem(0, 30, 3), Stem(10, 20, 3)
    assert not stems_overlap(outer, inner)
    assert not stems_cross(outer, inner)
    assert not stems_conflict(outer, inner)
    assert is_nested(outer, inner)


def test_disjoint_stems_do_not_conflict():
    assert not stems_conflict(Stem(0, 9, 2), Stem(20, 29, 2))


def test_crossing_stems_are_a_pseudoknot():
    # i < i' < j < j'  ->  crossing
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert stems_cross(a, b)
    assert stems_conflict(a, b, forbid_crossing=True)


def test_crossing_allowed_in_pseudoknot_mode():
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert not stems_conflict(a, b, forbid_crossing=False)


def test_overlap_still_forbidden_in_pseudoknot_mode():
    """Pseudoknot mode relaxes crossing only; a nucleotide still pairs at most once."""
    assert stems_conflict(Stem(0, 20, 3), Stem(2, 30, 2), forbid_crossing=False)


def test_conflict_graph_has_node_per_stem_and_edge_per_conflict():
    stems = [Stem(0, 20, 2), Stem(10, 30, 2), Stem(40, 49, 2)]
    graph = build_conflict_graph(stems, forbid_crossing=True)
    assert graph.number_of_nodes() == 3
    assert graph.has_edge(0, 1)      # crossing
    assert not graph.has_edge(0, 2)  # disjoint


def test_pseudoknot_mode_yields_sparser_graph():
    stems = [Stem(0, 20, 2), Stem(10, 30, 2), Stem(5, 25, 2)]
    strict = build_conflict_graph(stems, forbid_crossing=True)
    relaxed = build_conflict_graph(stems, forbid_crossing=False)
    assert relaxed.number_of_edges() < strict.number_of_edges()


def test_conflict_is_symmetric():
    a, b = Stem(0, 20, 2), Stem(10, 30, 2)
    assert stems_conflict(a, b) == stems_conflict(b, a)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_conflicts.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.biology.conflicts'`

- [ ] **Step 3: Write `src/foldq/biology/conflicts.py`**

```python
"""Pairwise structural conflicts between candidate helices.

Both conflict classes are pairwise, which is exactly what a QUBO can express:
  * overlap  - two helices claim the same nucleotide
  * crossing - two helices form a pseudoknot (i < i' < j < j')

Crossing is toggleable. Disabling it is pseudoknot mode.
"""

from __future__ import annotations

import networkx as nx

from foldq.schemas.structure import Stem


def stems_overlap(a: Stem, b: Stem) -> bool:
    """True if the helices claim any nucleotide in common."""
    return bool(a.nucleotides() & b.nucleotides())


def stems_cross(a: Stem, b: Stem) -> bool:
    """True if any pair of `a` interleaves with any pair of `b` (a pseudoknot)."""
    for i, j in a.pairs():
        for p, q in b.pairs():
            if i < p < j < q or p < i < q < j:
                return True
    return False


def is_nested(outer: Stem, inner: Stem) -> bool:
    """True if `inner` lies strictly inside `outer`'s innermost pair."""
    oi, oj = outer.inner_pair
    ii, ij = inner.outer_pair
    return oi < ii and ij < oj


def stems_conflict(a: Stem, b: Stem, *, forbid_crossing: bool = True) -> bool:
    """True if the two helices cannot both appear in one structure."""
    if stems_overlap(a, b):
        return True
    return forbid_crossing and stems_cross(a, b)


def build_conflict_graph(stems: list[Stem], *, forbid_crossing: bool = True) -> nx.Graph:
    """Graph whose nodes are stem indices and whose edges are pairwise conflicts."""
    graph = nx.Graph()
    graph.add_nodes_from(range(len(stems)))
    for idx_a in range(len(stems)):
        for idx_b in range(idx_a + 1, len(stems)):
            if stems_conflict(stems[idx_a], stems[idx_b], forbid_crossing=forbid_crossing):
                graph.add_edge(idx_a, idx_b)
    return graph
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_conflicts.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/foldq/biology/conflicts.py tests/unit/test_conflicts.py
git commit -m "feat: add pairwise stem conflict detection and conflict graph

Crossing detection is toggleable; disabling it is the pseudoknot mode that
lets the formulation reach structures classical DP cannot represent."
```

---

### Task 6: Dot-bracket conversion with property tests

**Files:**
- Create: `src/foldq/biology/dotbracket.py`
- Test: `tests/unit/test_dotbracket.py`, `tests/property/test_dotbracket_properties.py`

**Interfaces:**
- Consumes: `Stem` (Task 2), `dotbracket_to_pairs` (Task 3, re-exported here)
- Produces:
  - `pairs_to_dotbracket(pairs: set[tuple[int,int]] | frozenset, length: int) -> str`
  - `stems_to_dotbracket(stems: list[Stem], length: int) -> str`
  - `stems_to_pairs(stems: list[Stem]) -> frozenset[tuple[int,int]]`
  - `pairs_to_stems(pairs) -> list[Stem]`

- [ ] **Step 1: Write the failing unit test**

```python
# tests/unit/test_dotbracket.py
import pytest

from foldq.biology.dotbracket import (
    pairs_to_dotbracket,
    pairs_to_stems,
    stems_to_dotbracket,
    stems_to_pairs,
)
from foldq.schemas.structure import Stem


def test_pairs_render_as_dotbracket():
    assert pairs_to_dotbracket({(0, 9), (1, 8), (2, 7)}, 11) == "(((....)))."


def test_empty_structure_is_all_dots():
    assert pairs_to_dotbracket(set(), 5) == "....."


def test_stems_render_as_dotbracket():
    assert stems_to_dotbracket([Stem(0, 9, 3)], 11) == "(((....)))."


def test_stems_to_pairs_flattens():
    assert stems_to_pairs([Stem(0, 9, 2)]) == frozenset({(0, 9), (1, 8)})


def test_pairs_to_stems_groups_stacked_pairs():
    stems = pairs_to_stems({(0, 9), (1, 8), (2, 7)})
    assert stems == [Stem(0, 9, 3)]


def test_pairs_to_stems_splits_on_discontinuity():
    # two separate helices, not one
    stems = pairs_to_stems({(0, 30), (1, 29), (10, 20), (11, 19)})
    assert sorted(stems) == [Stem(0, 30, 2), Stem(10, 20, 2)]


def test_roundtrip_stems_pairs_stems():
    original = [Stem(0, 30, 3), Stem(10, 20, 2)]
    assert sorted(pairs_to_stems(stems_to_pairs(original))) == sorted(original)


def test_rejects_pair_beyond_sequence_length():
    with pytest.raises(ValueError, match="exceeds"):
        pairs_to_dotbracket({(0, 99)}, 10)


def test_rejects_nucleotide_paired_twice():
    with pytest.raises(ValueError, match="paired more than once"):
        pairs_to_dotbracket({(0, 9), (0, 8)}, 11)
```

- [ ] **Step 2: Write the failing property test**

```python
# tests/property/test_dotbracket_properties.py
from hypothesis import given, settings
from hypothesis import strategies as st

from foldq.biology.dotbracket import pairs_to_dotbracket, stems_to_dotbracket, stems_to_pairs
from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import dotbracket_to_pairs

sequences = st.text(alphabet="AUCG", min_size=8, max_size=60)


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_dotbracket_length_always_matches_sequence(sequence):
    stems = generate_maximal_stems(sequence)
    for stem in stems:
        assert len(stems_to_dotbracket([stem], len(sequence))) == len(sequence)


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_single_stem_dotbracket_is_balanced(sequence):
    for stem in generate_maximal_stems(sequence):
        rendered = stems_to_dotbracket([stem], len(sequence))
        assert rendered.count("(") == rendered.count(")")
        depth = 0
        for char in rendered:
            depth += (char == "(") - (char == ")")
            assert depth >= 0
        assert depth == 0


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_pairs_to_dotbracket_roundtrips(sequence):
    for stem in generate_maximal_stems(sequence):
        pairs = stems_to_pairs([stem])
        assert dotbracket_to_pairs(pairs_to_dotbracket(pairs, len(sequence))) == pairs


@given(sequences)
@settings(max_examples=200, deadline=None)
def test_generated_stems_respect_min_hairpin(sequence):
    for stem in generate_maximal_stems(sequence):
        inner_i, inner_j = stem.inner_pair
        assert inner_j - inner_i - 1 >= 3
```

- [ ] **Step 3: Run both to verify they fail**

Run: `.venv/bin/pytest tests/unit/test_dotbracket.py tests/property -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.biology.dotbracket'`

- [ ] **Step 4: Write `src/foldq/biology/dotbracket.py`**

```python
"""Conversions between dot-bracket notation, pair lists, and helices."""

from __future__ import annotations

from collections.abc import Iterable

from foldq.classical.vienna import dotbracket_to_pairs
from foldq.schemas.structure import Stem

__all__ = [
    "dotbracket_to_pairs",
    "pairs_to_dotbracket",
    "pairs_to_stems",
    "stems_to_dotbracket",
    "stems_to_pairs",
]


def pairs_to_dotbracket(pairs: Iterable[tuple[int, int]], length: int) -> str:
    """Render 0-based pairs as dot-bracket, rejecting illegal pair sets.

    Only nested (pseudoknot-free) structures are representable; crossing pairs
    cannot be written in single-bracket notation and must be reported separately.
    """
    chars = ["."] * length
    claimed: set[int] = set()
    for i, j in pairs:
        if i >= length or j >= length:
            raise ValueError(f"pair ({i}, {j}) exceeds sequence length {length}")
        if i in claimed or j in claimed:
            raise ValueError(f"nucleotide in pair ({i}, {j}) is paired more than once")
        claimed.update((i, j))
        chars[i], chars[j] = "(", ")"
    return "".join(chars)


def stems_to_pairs(stems: Iterable[Stem]) -> frozenset[tuple[int, int]]:
    """Flatten helices into the set of base pairs they contain."""
    return frozenset(pair for stem in stems for pair in stem.pairs())


def stems_to_dotbracket(stems: Iterable[Stem], length: int) -> str:
    """Render helices as dot-bracket."""
    return pairs_to_dotbracket(stems_to_pairs(stems), length)


def pairs_to_stems(pairs: Iterable[tuple[int, int]]) -> list[Stem]:
    """Group pairs into maximal stacked helices.

    Consecutive pairs (i, j) and (i+1, j-1) belong to the same helix.
    """
    ordered = sorted(pairs)
    if not ordered:
        return []

    stems: list[Stem] = []
    start = ordered[0]
    run = 1
    for previous, current in zip(ordered, ordered[1:]):
        if current[0] == previous[0] + 1 and current[1] == previous[1] - 1:
            run += 1
        else:
            stems.append(Stem(i=start[0], j=start[1], k=run))
            start, run = current, 1
    stems.append(Stem(i=start[0], j=start[1], k=run))
    return sorted(stems)
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_dotbracket.py tests/property -v`
Expected: PASS (9 unit + 4 property tests)

- [ ] **Step 6: Commit**

```bash
git add src/foldq/biology/dotbracket.py tests/unit/test_dotbracket.py tests/property
git commit -m "feat: add dot-bracket conversions with Hypothesis property tests

Property tests assert the invariants that matter: length preservation, bracket
balance, roundtrip fidelity, and minimum hairpin compliance."
```

---

## Phase 3 — Encoding and QUBO

### Task 7: Charge-and-refund energy coefficients

The scientific core. Measured evidence from the spec: stacking alone correlates r=0.958 with the Turner model, but charging hairpin closure unconditionally collapses it to r=0.347, because "does this helix close a hairpin?" depends on which other helices are selected. Charge-and-refund recovers that as a degree-2 term.

**Files:**
- Create: `src/foldq/encodings/__init__.py`, `src/foldq/encodings/energy.py`
- Test: `tests/scientific/test_energy_model.py`

**Interfaces:**
- Consumes: `ViennaBackend` (Task 3), `Stem` (Task 2), `is_nested` (Task 5)
- Produces:
  - `NestingPolicy` — `Literal["all_nestable", "immediate_only"]`
  - `stem_linear_energy(backend: ViennaBackend, sequence: str, stem: Stem) -> float`
  - `refund_pair_energy(backend: ViennaBackend, sequence: str, outer: Stem, inner: Stem) -> float`
  - `nestable_pairs(stems: list[Stem], policy: NestingPolicy = "all_nestable") -> list[tuple[int,int]]`
  - `EnergyModel` — `Literal["stacking_only", "charge_refund"]`

- [ ] **Step 1: Write the failing test**

```python
# tests/scientific/test_energy_model.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.energy import (
    nestable_pairs,
    refund_pair_energy,
    stem_linear_energy,
)
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"
NESTED = "GGGCAUAAAAGCUUUUGCCC"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_linear_energy_is_stacking_plus_hairpin(backend):
    stem = Stem(0, 9, 3)
    expected = backend.stack_energy(DEMO, stem) + backend.hairpin_energy(DEMO, stem)
    assert stem_linear_energy(backend, DEMO, stem) == pytest.approx(expected)


def test_lone_hairpin_linear_energy_equals_vienna(backend):
    """When a helix really does close a hairpin, the linear term is exact."""
    stem = Stem(0, 9, 3)
    assert stem_linear_energy(backend, DEMO, stem) == pytest.approx(
        backend.fold(DEMO).mfe_energy, abs=0.01
    )


def test_refund_cancels_the_hairpin_assumption(backend):
    """The refund must remove exactly the hairpin cost the linear term charged."""
    outer, inner = Stem(0, 19, 3), Stem(4, 15, 2)
    refund = refund_pair_energy(backend, NESTED, outer, inner)
    interior = backend.interior_energy(NESTED, outer, inner)
    hairpin = backend.hairpin_energy(NESTED, outer)
    assert refund == pytest.approx(interior - hairpin)


def test_charge_plus_refund_reconstructs_two_stem_structure(backend):
    """Linear(outer) + linear(inner) + refund(outer,inner) should approximate Vienna."""
    from foldq.biology.dotbracket import stems_to_dotbracket

    outer, inner = Stem(0, 19, 3), Stem(4, 15, 2)
    modelled = (
        stem_linear_energy(backend, NESTED, outer)
        + stem_linear_energy(backend, NESTED, inner)
        + refund_pair_energy(backend, NESTED, outer, inner)
    )
    actual = backend.eval_structure(NESTED, stems_to_dotbracket([outer, inner], len(NESTED)))
    assert modelled == pytest.approx(actual, abs=1.0)


def test_nestable_pairs_finds_outer_inner_relationships():
    stems = [Stem(0, 30, 3), Stem(10, 20, 2)]
    assert nestable_pairs(stems) == [(0, 1)]


def test_nestable_pairs_excludes_disjoint_stems():
    assert nestable_pairs([Stem(0, 9, 2), Stem(20, 29, 2)]) == []


def test_immediate_only_policy_drops_transitive_nesting():
    """A contains B contains C: 'all_nestable' gives 3 pairs, 'immediate_only' gives 2."""
    stems = [Stem(0, 40, 2), Stem(5, 35, 2), Stem(12, 25, 2)]
    assert len(nestable_pairs(stems, policy="all_nestable")) == 3
    assert len(nestable_pairs(stems, policy="immediate_only")) == 2


def test_stacking_only_correlates_with_vienna_on_real_folds(backend):
    """Regression guard on the spec's headline number: r should stay near 0.958."""
    import random

    from foldq.biology.dotbracket import dotbracket_to_pairs, pairs_to_stems

    random.seed(7)
    modelled, actual = [], []
    for length in (30, 40, 50, 60):
        for _ in range(4):
            for _ in range(400):
                seq = "".join(random.choice("AUCG") for _ in range(length))
                ref = backend.fold(seq)
                if ref.mfe_energy < -0.15 * length:
                    break
            stems = pairs_to_stems(dotbracket_to_pairs(ref.mfe_structure))
            if not stems:
                continue
            modelled.append(sum(backend.stack_energy(seq, s) for s in stems))
            actual.append(ref.mfe_energy)

    mean_m = sum(modelled) / len(modelled)
    mean_a = sum(actual) / len(actual)
    cov = sum((m - mean_m) * (a - mean_a) for m, a in zip(modelled, actual))
    var = (
        sum((m - mean_m) ** 2 for m in modelled) * sum((a - mean_a) ** 2 for a in actual)
    ) ** 0.5
    assert cov / var > 0.85, "stacking surrogate fidelity regressed below the spec baseline"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/scientific/test_energy_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.encodings'`

- [ ] **Step 3: Write `src/foldq/encodings/energy.py`**

```python
"""Charge-and-refund energy coefficients for the stem QUBO.

A degree-2 objective cannot express "this helix closes a hairpin", because that
depends on which *other* helices are selected — a k-body predicate. The
construction here recovers it in two representable layers:

  linear[s]      = stacking(s) + hairpin_closure(s)     provisionally assume a hairpin
  quadratic[s,t] = -hairpin_closure(s) + interior(s,t)  refund it when t nests inside

Known approximation: when several helices nest inside one, the refund applies more
than once. `NestingPolicy` controls how aggressively that is mitigated, and the
residual error is measured in experiment E1 rather than hidden.
"""

from __future__ import annotations

from typing import Literal

from foldq.biology.conflicts import is_nested
from foldq.classical.vienna import ViennaBackend
from foldq.schemas.structure import Stem

NestingPolicy = Literal["all_nestable", "immediate_only"]
EnergyModel = Literal["stacking_only", "charge_refund"]


def stem_linear_energy(backend: ViennaBackend, sequence: str, stem: Stem) -> float:
    """Linear coefficient: stacking plus a provisional hairpin-closure charge."""
    return backend.stack_energy(sequence, stem) + backend.hairpin_energy(sequence, stem)


def refund_pair_energy(
    backend: ViennaBackend, sequence: str, outer: Stem, inner: Stem
) -> float:
    """Quadratic coefficient: undo the hairpin assumption, charge the real loop."""
    return backend.interior_energy(sequence, outer, inner) - backend.hairpin_energy(
        sequence, outer
    )


def nestable_pairs(
    stems: list[Stem], policy: NestingPolicy = "all_nestable"
) -> list[tuple[int, int]]:
    """Indices (outer, inner) where `inner` sits strictly inside `outer`.

    `all_nestable` returns every nesting relationship, including transitive ones.
    `immediate_only` drops pair (a, c) when some b satisfies a > b > c, which
    reduces double-refunding at the cost of ignoring selections that skip a level.
    """
    pairs = [
        (outer_idx, inner_idx)
        for outer_idx, outer in enumerate(stems)
        for inner_idx, inner in enumerate(stems)
        if outer_idx != inner_idx and is_nested(outer, inner)
    ]
    if policy == "all_nestable":
        return sorted(pairs)

    direct = set(pairs)
    transitive = {
        (a, c)
        for (a, b) in pairs
        for (b2, c) in pairs
        if b == b2 and (a, c) in direct
    }
    return sorted(direct - transitive)
```

- [ ] **Step 4: Create `src/foldq/encodings/__init__.py`**

```python
"""Binary encodings of RNA structure selection problems."""
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/scientific/test_energy_model.py -v`
Expected: PASS (8 tests). If `test_stacking_only_correlates_with_vienna_on_real_folds` fails, the energy model has regressed against the spec's measured baseline — stop and investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/foldq/encodings tests/scientific/test_energy_model.py
git commit -m "feat: add charge-and-refund energy model

Expresses hairpin-versus-interior loop closure as a degree-2 term by charging
closure in the linear coefficient and refunding it when a helix nests inside.
Includes a regression guard on the r=0.958 stacking-surrogate baseline."
```

---

### Task 8: QUBO assembly and penalty calibration

**Files:**
- Create: `src/foldq/schemas/qubo.py`, `src/foldq/qubo/__init__.py`, `src/foldq/qubo/builder.py`, `src/foldq/encodings/stem_encoding.py`
- Test: `tests/unit/test_qubo_builder.py`

**Interfaces:**
- Consumes: `Stem`, `ViennaBackend`, `build_conflict_graph`, energy functions
- Produces:
  - `PenaltyConfig(overlap: float | None = None, crossing: float | None = None, forbid_crossing: bool = True)` — `None` means adaptive
  - `QuboProblem(linear, quadratic, offset, variable_map, sequence, metadata)` with `.num_variables`, `.density`, `.energy(bits) -> float`, `.to_bqm() -> dimod.BinaryQuadraticModel`
  - `calibrate_penalty(linear: dict[int, float]) -> float`
  - `build_stem_qubo(sequence, stems, backend, *, penalties, energy_model, nesting_policy) -> QuboProblem`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_qubo_builder.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_qubo_energy_matches_manual_sum():
    problem = QuboProblem(
        linear={0: -2.0, 1: -1.0},
        quadratic={(0, 1): 5.0},
        offset=0.5,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )
    assert problem.energy((0, 0)) == pytest.approx(0.5)
    assert problem.energy((1, 0)) == pytest.approx(-1.5)
    assert problem.energy((1, 1)) == pytest.approx(-2.0 - 1.0 + 5.0 + 0.5)


def test_qubo_rejects_bitstring_of_wrong_length():
    problem = QuboProblem({0: 1.0}, {}, 0.0, (Stem(0, 9, 2),), DEMO, {})
    with pytest.raises(ValueError, match="expected 1 bits"):
        problem.energy((1, 0))


def test_num_variables_and_density():
    problem = QuboProblem(
        {0: 1.0, 1: 1.0, 2: 1.0}, {(0, 1): 1.0}, 0.0,
        (Stem(0, 9, 2), Stem(0, 9, 3), Stem(0, 10, 2)), DEMO, {},
    )
    assert problem.num_variables == 3
    assert problem.density == pytest.approx(1 / 3)  # 1 edge of 3 possible


def test_bqm_roundtrip_preserves_energy():
    problem = QuboProblem({0: -2.0, 1: -1.0}, {(0, 1): 5.0}, 0.0,
                          (Stem(0, 9, 2), Stem(0, 9, 3)), DEMO, {})
    bqm = problem.to_bqm()
    for bits in [(0, 0), (0, 1), (1, 0), (1, 1)]:
        assert bqm.energy({0: bits[0], 1: bits[1]}) == pytest.approx(problem.energy(bits))


def test_calibrated_penalty_exceeds_largest_energy_gain():
    penalty = calibrate_penalty({0: -3.0, 1: -7.5, 2: -1.0})
    assert penalty > 7.5


def test_penalty_is_positive_even_when_all_energies_are_zero():
    assert calibrate_penalty({0: 0.0, 1: 0.0}) > 0.0


def test_built_qubo_penalises_conflicting_stems(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    for (a, b), coeff in problem.quadratic.items():
        if problem.variable_map[a].nucleotides() & problem.variable_map[b].nucleotides():
            assert coeff > 0.0, "overlapping stems must be penalised, not rewarded"


def test_selecting_a_real_stem_lowers_energy(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    empty = problem.energy(tuple(0 for _ in stems))
    best = min(
        problem.energy(tuple(1 if i == idx else 0 for i in range(len(stems))))
        for idx in range(len(stems))
    )
    assert best < empty


def test_pseudoknot_mode_produces_fewer_quadratic_terms(backend):
    seq = "GGGCAUAAAAGCUUUUGCCCAAAGCAU"
    stems = generate_maximal_stems(seq, min_stem_length=2)
    strict = build_stem_qubo(seq, stems, backend, penalties=PenaltyConfig(forbid_crossing=True))
    relaxed = build_stem_qubo(seq, stems, backend, penalties=PenaltyConfig(forbid_crossing=False))
    assert len(relaxed.quadratic) <= len(strict.quadratic)


def test_metadata_records_reproducibility_fields(backend):
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend, penalties=PenaltyConfig())
    for key in ("energy_model", "nesting_policy", "overlap_penalty", "forbid_crossing"):
        assert key in problem.metadata
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_qubo_builder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.schemas.qubo'`

- [ ] **Step 3: Write `src/foldq/schemas/qubo.py`**

```python
"""QUBO problem representation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import dimod

from foldq.schemas.structure import Stem


@dataclass(frozen=True)
class PenaltyConfig:
    """Hard-constraint penalty weights. `None` means calibrate adaptively."""

    overlap: float | None = None
    crossing: float | None = None
    forbid_crossing: bool = True


@dataclass(frozen=True)
class QuboProblem:
    """A binary quadratic objective plus the biology each variable stands for."""

    linear: dict[int, float]
    quadratic: dict[tuple[int, int], float]
    offset: float
    variable_map: tuple[Stem, ...]
    sequence: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def num_variables(self) -> int:
        return len(self.variable_map)

    @property
    def density(self) -> float:
        n = self.num_variables
        if n < 2:
            return 0.0
        return len(self.quadratic) / (n * (n - 1) / 2)

    def energy(self, bits: Sequence[int]) -> float:
        """Objective value of a bit assignment."""
        if len(bits) != self.num_variables:
            raise ValueError(f"expected {self.num_variables} bits, got {len(bits)}")
        total = self.offset
        total += sum(coeff for idx, coeff in self.linear.items() if bits[idx])
        total += sum(
            coeff for (a, b), coeff in self.quadratic.items() if bits[a] and bits[b]
        )
        return total

    def to_bqm(self) -> dimod.BinaryQuadraticModel:
        """Convert to a dimod model for the Ocean samplers."""
        return dimod.BinaryQuadraticModel(
            dict(self.linear), dict(self.quadratic), self.offset, dimod.BINARY
        )
```

- [ ] **Step 4: Write `src/foldq/qubo/builder.py`**

```python
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
```

- [ ] **Step 5: Write `src/foldq/encodings/stem_encoding.py`**

```python
"""Stem-based QUBO: one binary variable per candidate helix."""

from __future__ import annotations

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.energy import (
    EnergyModel,
    NestingPolicy,
    nestable_pairs,
    refund_pair_energy,
    stem_linear_energy,
)
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem


def build_stem_qubo(
    sequence: str,
    stems: list[Stem],
    backend: ViennaBackend,
    *,
    penalties: PenaltyConfig | None = None,
    energy_model: EnergyModel = "charge_refund",
    nesting_policy: NestingPolicy = "all_nestable",
) -> QuboProblem:
    """Assemble the stem QUBO from energy terms and hard-constraint penalties."""
    penalties = penalties or PenaltyConfig()

    if energy_model == "stacking_only":
        linear = {i: backend.stack_energy(sequence, s) for i, s in enumerate(stems)}
    else:
        linear = {i: stem_linear_energy(backend, sequence, s) for i, s in enumerate(stems)}

    overlap_penalty = (
        penalties.overlap if penalties.overlap is not None else calibrate_penalty(linear)
    )
    crossing_penalty = (
        penalties.crossing if penalties.crossing is not None else overlap_penalty
    )

    quadratic: dict[tuple[int, int], float] = {}

    # Hard constraints.
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if stems_overlap(stems[a], stems[b]):
                quadratic[(a, b)] = quadratic.get((a, b), 0.0) + overlap_penalty
            elif penalties.forbid_crossing and stems_cross(stems[a], stems[b]):
                quadratic[(a, b)] = quadratic.get((a, b), 0.0) + crossing_penalty

    # Loop-closure refunds, only between helices that could legally coexist.
    if energy_model == "charge_refund":
        for outer_idx, inner_idx in nestable_pairs(stems, policy=nesting_policy):
            key = (min(outer_idx, inner_idx), max(outer_idx, inner_idx))
            if key in quadratic:
                continue  # already a hard conflict; a refund would be meaningless
            quadratic[key] = refund_pair_energy(
                backend, sequence, stems[outer_idx], stems[inner_idx]
            )

    return QuboProblem(
        linear=linear,
        quadratic=quadratic,
        offset=0.0,
        variable_map=tuple(stems),
        sequence=sequence,
        metadata={
            "energy_model": energy_model,
            "nesting_policy": nesting_policy,
            "overlap_penalty": overlap_penalty,
            "crossing_penalty": crossing_penalty,
            "forbid_crossing": penalties.forbid_crossing,
        },
    )
```

- [ ] **Step 6: Create `src/foldq/qubo/__init__.py`**

```python
"""QUBO assembly, calibration, and Ising mapping."""
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_qubo_builder.py -v`
Expected: PASS (10 tests)

- [ ] **Step 8: Commit**

```bash
git add src/foldq/schemas/qubo.py src/foldq/qubo src/foldq/encodings/stem_encoding.py tests/unit/test_qubo_builder.py
git commit -m "feat: add stem QUBO assembly with adaptive penalty calibration"
```

---

### Task 8b: Pair-based encoding

RQ2 asks whether stem encoding reduces variables relative to pair encoding. Answering it requires actually building the pair encoding. One variable per candidate base pair; stacking is rewarded as a *quadratic* term between vertically adjacent pairs, which is where the pair encoding's density comes from.

**Files:**
- Create: `src/foldq/encodings/pair_encoding.py`
- Test: `tests/unit/test_pair_encoding.py`

**Interfaces:**
- Consumes: `candidate_pairs` (Task 4), `ViennaBackend` (Task 3), `PenaltyConfig`, `QuboProblem` (Task 8), `calibrate_penalty` (Task 8)
- Produces:
  - `PairVariable(i: int, j: int)` with `.nucleotides() -> frozenset[int]`
  - `build_pair_qubo(sequence, backend, *, penalties=None, min_hairpin=3, allow_wobble=True) -> QuboProblem`

Note: `QuboProblem.variable_map` is typed as `tuple[Stem, ...]`. A single base pair is a stem of length 1, so pair variables are stored as `Stem(i=i, j=j, k=1)` and no schema change is needed.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_pair_encoding.py
import pytest

from foldq.biology.pairs import candidate_pairs
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.pair_encoding import build_pair_qubo
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.biology.stems import generate_maximal_stems
from foldq.schemas.qubo import PenaltyConfig

DEMO = "GGGAAAUCCCU"
LONGER = "GGGCAUAAAAGCUUUUGCCC"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_one_variable_per_candidate_pair(backend):
    problem = build_pair_qubo(DEMO, backend)
    assert problem.num_variables == len(candidate_pairs(DEMO))


def test_every_variable_is_a_single_pair(backend):
    problem = build_pair_qubo(DEMO, backend)
    assert all(stem.k == 1 for stem in problem.variable_map)


def test_adjacent_pairs_are_rewarded_for_stacking(backend):
    """Stacking is the pair encoding's only source of favourable energy."""
    problem = build_pair_qubo(DEMO, backend)
    index = {(stem.i, stem.j): idx for idx, stem in enumerate(problem.variable_map)}
    key = tuple(sorted((index[(0, 9)], index[(1, 8)])))
    assert problem.quadratic[key] < 0.0


def test_overlapping_pairs_are_penalised(backend):
    problem = build_pair_qubo(DEMO, backend)
    for (a, b), coeff in problem.quadratic.items():
        left, right = problem.variable_map[a], problem.variable_map[b]
        if left.nucleotides() & right.nucleotides():
            assert coeff > 0.0


def test_pair_encoding_uses_more_variables_than_stem_encoding(backend):
    """The headline RQ2 comparison, asserted rather than assumed."""
    pair = build_pair_qubo(LONGER, backend)
    stem = build_stem_qubo(LONGER, generate_maximal_stems(LONGER, min_stem_length=2), backend)
    assert pair.num_variables > stem.num_variables


def test_metadata_identifies_the_encoding(backend):
    assert build_pair_qubo(DEMO, backend).metadata["encoding"] == "pair"


def test_selecting_a_stacked_pair_set_lowers_energy(backend):
    problem = build_pair_qubo(DEMO, backend)
    index = {(stem.i, stem.j): idx for idx, stem in enumerate(problem.variable_map)}
    bits = [0] * problem.num_variables
    for pair in ((0, 9), (1, 8), (2, 7)):
        bits[index[pair]] = 1
    assert problem.energy(tuple(bits)) < problem.energy(tuple([0] * problem.num_variables))


def test_pseudoknot_mode_removes_crossing_penalties(backend):
    strict = build_pair_qubo(LONGER, backend, penalties=PenaltyConfig(forbid_crossing=True))
    relaxed = build_pair_qubo(LONGER, backend, penalties=PenaltyConfig(forbid_crossing=False))
    assert len(relaxed.quadratic) <= len(strict.quadratic)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_pair_encoding.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.encodings.pair_encoding'`

- [ ] **Step 3: Write `src/foldq/encodings/pair_encoding.py`**

```python
"""Pair-based QUBO: one binary variable per candidate base pair.

Maximum flexibility, but variables grow roughly quadratically with length and
stacking must be expressed as quadratic couplings, so the model is far denser
than the stem encoding. Built to answer RQ2 quantitatively.
"""

from __future__ import annotations

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.biology.pairs import candidate_pairs
from foldq.classical.vienna import ViennaBackend
from foldq.constants import DEFAULT_MIN_HAIRPIN
from foldq.qubo.builder import calibrate_penalty
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.structure import Stem

ISOLATED_PAIR_COST = 0.3
"""Small positive cost per pair, so unstacked lone pairs are not free."""


def build_pair_qubo(
    sequence: str,
    backend: ViennaBackend,
    *,
    penalties: PenaltyConfig | None = None,
    min_hairpin: int = DEFAULT_MIN_HAIRPIN,
    allow_wobble: bool = True,
) -> QuboProblem:
    """Assemble the pair QUBO. Each pair is stored as a length-1 stem."""
    penalties = penalties or PenaltyConfig()
    pairs = candidate_pairs(sequence, min_hairpin=min_hairpin, allow_wobble=allow_wobble)
    variables = [Stem(i=i, j=j, k=1) for i, j in pairs]
    index_of = {(stem.i, stem.j): idx for idx, stem in enumerate(variables)}

    # A lone pair costs a little; all the reward comes from stacking below.
    linear = {idx: ISOLATED_PAIR_COST for idx in range(len(variables))}

    quadratic: dict[tuple[int, int], float] = {}

    # Stacking reward between a pair and the pair directly inside it.
    for (i, j), outer_idx in index_of.items():
        inner = index_of.get((i + 1, j - 1))
        if inner is None:
            continue
        stacking = backend.stack_energy(sequence, Stem(i=i, j=j, k=2))
        quadratic[tuple(sorted((outer_idx, inner)))] = stacking

    # Calibrate against the stacking rewards, not the linear costs: stacking is the
    # only thing a violation could profit from, and it dominates the lone-pair cost.
    stacking_scale = {index: value for index, value in enumerate(quadratic.values())}
    penalty = (
        penalties.overlap
        if penalties.overlap is not None
        else calibrate_penalty(stacking_scale or linear)
    )
    crossing_penalty = penalties.crossing if penalties.crossing is not None else penalty

    for a in range(len(variables)):
        for b in range(a + 1, len(variables)):
            key = (a, b)
            if stems_overlap(variables[a], variables[b]):
                quadratic[key] = quadratic.get(key, 0.0) + penalty
            elif penalties.forbid_crossing and stems_cross(variables[a], variables[b]):
                quadratic[key] = quadratic.get(key, 0.0) + crossing_penalty

    return QuboProblem(
        linear=linear,
        quadratic=quadratic,
        offset=0.0,
        variable_map=tuple(variables),
        sequence=sequence,
        metadata={
            "encoding": "pair",
            "overlap_penalty": penalty,
            "crossing_penalty": crossing_penalty,
            "forbid_crossing": penalties.forbid_crossing,
            "isolated_pair_cost": ISOLATED_PAIR_COST,
        },
    )
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_pair_encoding.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/foldq/encodings/pair_encoding.py tests/unit/test_pair_encoding.py
git commit -m "feat: add pair-based encoding for the RQ2 comparison

One variable per candidate pair, with stacking expressed as quadratic coupling.
Needed to quantify the stem encoding's compression rather than assert it."
```

---

### Task 9: Ising mapping and Pauli operator

**Files:**
- Create: `src/foldq/qubo/ising.py`
- Test: `tests/scientific/test_ising.py`

**Interfaces:**
- Consumes: `QuboProblem` (Task 8)
- Produces:
  - `qubo_to_ising(problem: QuboProblem) -> tuple[dict[int,float], dict[tuple[int,int],float], float]` returning `(h, J, offset)`
  - `ising_energy(h, J, offset, spins: Sequence[int]) -> float`
  - `to_sparse_pauli_op(problem: QuboProblem) -> qiskit.quantum_info.SparsePauliOp`
  - `bits_to_spins(bits) -> tuple[int, ...]`, `spins_to_bits(spins) -> tuple[int, ...]`

- [ ] **Step 1: Write the failing test**

```python
# tests/scientific/test_ising.py
import itertools

import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.qubo.ising import (
    bits_to_spins,
    ising_energy,
    qubo_to_ising,
    spins_to_bits,
    to_sparse_pauli_op,
)
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


def _toy() -> QuboProblem:
    return QuboProblem(
        linear={0: -2.0, 1: 3.0},
        quadratic={(0, 1): 5.0},
        offset=1.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )


def test_bit_spin_conversion_roundtrips():
    assert bits_to_spins((0, 1)) == (1, -1)   # x=0 -> z=+1
    assert spins_to_bits((1, -1)) == (0, 1)


def test_ising_energy_matches_qubo_on_every_assignment():
    """The whole point of the mapping: identical energies after the offset."""
    problem = _toy()
    h, coupling, offset = qubo_to_ising(problem)
    for bits in itertools.product((0, 1), repeat=2):
        spins = bits_to_spins(bits)
        assert ising_energy(h, coupling, offset, spins) == pytest.approx(problem.energy(bits))


def test_ising_matches_qubo_on_a_real_instance():
    backend = ViennaBackend()
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend)
    h, coupling, offset = qubo_to_ising(problem)
    for bits in itertools.product((0, 1), repeat=problem.num_variables):
        assert ising_energy(h, coupling, offset, bits_to_spins(bits)) == pytest.approx(
            problem.energy(bits), abs=1e-9
        )


def test_sparse_pauli_op_has_correct_qubit_count():
    op = to_sparse_pauli_op(_toy())
    assert op.num_qubits == 2


def test_sparse_pauli_op_diagonal_matches_qubo():
    """The cost Hamiltonian's diagonal must equal the QUBO objective."""
    import numpy as np

    problem = _toy()
    diagonal = np.diag(to_sparse_pauli_op(problem).to_matrix()).real
    for index, bits in enumerate(itertools.product((0, 1), repeat=2)):
        # Qiskit orders basis states with qubit 0 as the least significant bit.
        qiskit_index = sum(bit << position for position, bit in enumerate(reversed(bits)))
        assert diagonal[qiskit_index] == pytest.approx(problem.energy(bits))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/scientific/test_ising.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.qubo.ising'`

- [ ] **Step 3: Write `src/foldq/qubo/ising.py`**

```python
"""QUBO to Ising conversion for gate-based algorithms.

Substituting x_i = (1 - z_i) / 2 with z_i in {-1, +1} turns the binary objective
into an Ising Hamiltonian:  H = sum_i h_i Z_i + sum_{i<j} J_ij Z_i Z_j + offset
"""

from __future__ import annotations

from collections.abc import Sequence

from foldq.schemas.qubo import QuboProblem


def bits_to_spins(bits: Sequence[int]) -> tuple[int, ...]:
    """x = 0 -> z = +1;  x = 1 -> z = -1."""
    return tuple(1 - 2 * bit for bit in bits)


def spins_to_bits(spins: Sequence[int]) -> tuple[int, ...]:
    return tuple((1 - spin) // 2 for spin in spins)


def qubo_to_ising(
    problem: QuboProblem,
) -> tuple[dict[int, float], dict[tuple[int, int], float], float]:
    """Return (h, J, offset) such that Ising energy equals the QUBO objective."""
    h: dict[int, float] = {i: 0.0 for i in range(problem.num_variables)}
    coupling: dict[tuple[int, int], float] = {}
    offset = problem.offset

    for index, value in problem.linear.items():
        h[index] -= value / 2.0
        offset += value / 2.0

    for (a, b), value in problem.quadratic.items():
        coupling[(a, b)] = coupling.get((a, b), 0.0) + value / 4.0
        h[a] -= value / 4.0
        h[b] -= value / 4.0
        offset += value / 4.0

    return h, coupling, offset


def ising_energy(
    h: dict[int, float],
    coupling: dict[tuple[int, int], float],
    offset: float,
    spins: Sequence[int],
) -> float:
    """Evaluate the Ising Hamiltonian for a spin assignment."""
    total = offset
    total += sum(value * spins[index] for index, value in h.items())
    total += sum(value * spins[a] * spins[b] for (a, b), value in coupling.items())
    return total


def to_sparse_pauli_op(problem: QuboProblem):
    """Build the Qiskit cost Hamiltonian for this problem."""
    from qiskit.quantum_info import SparsePauliOp

    n = problem.num_variables
    h, coupling, offset = qubo_to_ising(problem)

    labels: list[tuple[str, float]] = []
    if offset:
        labels.append(("I" * n, offset))
    for index, value in h.items():
        if value:
            pauli = ["I"] * n
            pauli[n - 1 - index] = "Z"
            labels.append(("".join(pauli), value))
    for (a, b), value in coupling.items():
        if value:
            pauli = ["I"] * n
            pauli[n - 1 - a] = "Z"
            pauli[n - 1 - b] = "Z"
            labels.append(("".join(pauli), value))

    if not labels:
        labels = [("I" * n, 0.0)]
    return SparsePauliOp.from_list(labels)
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/scientific/test_ising.py -v`
Expected: PASS (5 tests). `test_sparse_pauli_op_diagonal_matches_qubo` is the one that catches qubit-ordering mistakes, which are otherwise invisible until QAOA silently optimises the wrong objective.

- [ ] **Step 5: Commit**

```bash
git add src/foldq/qubo/ising.py tests/scientific/test_ising.py
git commit -m "feat: add QUBO to Ising and SparsePauliOp mapping

Diagonal-matching test pins Qiskit's little-endian qubit ordering, which would
otherwise silently optimise a permuted objective."
```

---

## Phase 4 — Solver layer

### Task 10: Solver protocol and exact solver

Exact ground truth is what makes Gates B and C possible. The spec measured that tree decomposition fails above roughly 22 variables on these dense conflict graphs, so the solver must fall back to brute force and refuse honestly beyond its reach rather than returning a wrong answer.

**Files:**
- Create: `src/foldq/schemas/result.py`, `src/foldq/solvers/__init__.py`, `src/foldq/solvers/base.py`, `src/foldq/solvers/exact.py`
- Test: `tests/unit/test_exact_solver.py`

**Interfaces:**
- Consumes: `QuboProblem` (Task 8)
- Produces:
  - `Sample(bits: tuple[int,...], energy: float, num_occurrences: int = 1)`
  - `SolverResult(solver_name: str, samples: tuple[Sample,...], runtime_seconds: float, metadata: dict)` with `.best -> Sample`, `.unique_samples -> int`
  - `SolverConfig(num_reads: int = 100, seed: int | None = None, extra: dict = {})`
  - `FoldSolver` Protocol with `name: str` and `solve(problem, config) -> SolverResult`
  - `ExactSolver(max_variables: int = 22)` and `ExactSolverTooLarge` exception

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_exact_solver.py
import itertools

import pytest

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.schemas.structure import Stem
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge

DEMO = "GGGAAAUCCCU"


def _toy(num_vars: int = 3) -> QuboProblem:
    return QuboProblem(
        linear={0: -5.0, 1: -3.0, 2: -1.0},
        quadratic={(0, 1): 20.0},
        offset=0.0,
        variable_map=tuple(Stem(0, 9, 2) for _ in range(num_vars)),
        sequence=DEMO,
        metadata={},
    )


def test_solver_result_best_is_lowest_energy():
    result = SolverResult(
        solver_name="t",
        samples=(Sample((0,), 5.0), Sample((1,), -2.0)),
        runtime_seconds=0.0,
        metadata={},
    )
    assert result.best.energy == -2.0


def test_solver_result_rejects_empty_samples():
    with pytest.raises(ValueError, match="at least one sample"):
        SolverResult(solver_name="t", samples=(), runtime_seconds=0.0, metadata={})


def test_exact_solver_finds_true_ground_state():
    problem = _toy()
    result = ExactSolver().solve(problem, SolverConfig())
    brute = min(
        (problem.energy(bits), bits)
        for bits in itertools.product((0, 1), repeat=problem.num_variables)
    )
    assert result.best.energy == pytest.approx(brute[0])
    assert problem.energy(result.best.bits) == pytest.approx(brute[0])


def test_exact_solver_avoids_the_penalised_pair():
    """Variables 0 and 1 carry a penalty of 20; the optimum cannot take both."""
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert not (result.best.bits[0] and result.best.bits[1])


def test_exact_solver_refuses_oversized_problems():
    big = QuboProblem(
        linear={i: -1.0 for i in range(40)},
        quadratic={},
        offset=0.0,
        variable_map=tuple(Stem(0, 9, 2) for _ in range(40)),
        sequence=DEMO,
        metadata={},
    )
    with pytest.raises(ExactSolverTooLarge, match="40 variables"):
        ExactSolver(max_variables=22).solve(big, SolverConfig())


def test_brute_force_counts_degeneracy_exactly():
    """Two symmetric variables that exclude each other give two ground states."""
    problem = QuboProblem(
        linear={0: -1.0, 1: -1.0},
        quadratic={(0, 1): 2.0},
        offset=0.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 9, 3)),
        sequence=DEMO,
        metadata={},
    )
    _, energy, degeneracy, method = ExactSolver()._brute_force(problem)
    assert energy == pytest.approx(-1.0)
    assert degeneracy == 2
    assert method == "brute_force"


def test_both_exact_methods_agree_on_the_ground_energy():
    """Tree decomposition and brute force must never disagree; the gates depend on it."""
    problem = _toy()
    tree_bits, tree_energy, _, _ = ExactSolver()._tree_decomposition(problem)
    brute_bits, brute_energy, _, _ = ExactSolver()._brute_force(problem)
    assert tree_energy == pytest.approx(brute_energy)
    assert problem.energy(tree_bits) == pytest.approx(problem.energy(brute_bits))


def test_exact_solver_records_which_method_it_used():
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert result.metadata["method"] in {"tree_decomposition", "brute_force"}
    assert result.metadata["is_exact"] is True


def test_tree_decomposition_is_fast_at_the_variable_cap():
    """Regression guard: brute force at 22 variables would take minutes."""
    import time

    from foldq.biology.stems import generate_maximal_stems
    from foldq.classical.vienna import ViennaBackend
    from foldq.encodings.stem_encoding import build_stem_qubo

    backend = ViennaBackend()
    seq = "GGGCAUAAAAGCUUUUGCCCAAAGCAUUUGC"
    problem = build_stem_qubo(seq, generate_maximal_stems(seq, min_stem_length=2), backend)
    if problem.num_variables < 15:
        pytest.skip("sequence produced too few variables to be a meaningful timing test")

    start = time.perf_counter()
    ExactSolver(max_variables=24).solve(problem, SolverConfig())
    assert time.perf_counter() - start < 10.0


def test_exact_solver_is_deterministic():
    a = ExactSolver().solve(_toy(), SolverConfig(seed=1))
    b = ExactSolver().solve(_toy(), SolverConfig(seed=1))
    assert a.best.bits == b.best.bits


def test_exact_solver_records_runtime_and_name():
    result = ExactSolver().solve(_toy(), SolverConfig())
    assert result.solver_name == "exact"
    assert result.runtime_seconds >= 0.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_exact_solver.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.schemas.result'`

- [ ] **Step 3: Write `src/foldq/schemas/result.py`**

```python
"""Solver output schemas."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from foldq.schemas.structure import RepairOp, Stem, ValidationReport


@dataclass(frozen=True)
class Sample:
    """One bit assignment returned by a solver."""

    bits: tuple[int, ...]
    energy: float
    num_occurrences: int = 1


@dataclass(frozen=True)
class SolverResult:
    """Everything one solver run produced, before any biological interpretation."""

    solver_name: str
    samples: tuple[Sample, ...]
    runtime_seconds: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.samples:
            raise ValueError(f"solver {self.solver_name!r} returned at least one sample: none")

    @property
    def best(self) -> Sample:
        return min(self.samples, key=lambda sample: sample.energy)

    @property
    def unique_samples(self) -> int:
        return len({sample.bits for sample in self.samples})


@dataclass(frozen=True)
class FoldCandidate:
    """A decoded, validated, repaired, and rescored structure."""

    stems: tuple[Stem, ...]
    dot_bracket: str
    qubo_energy: float
    vienna_energy: float
    validation: ValidationReport
    repairs: tuple[RepairOp, ...] = field(default_factory=tuple)
    was_repaired: bool = False
```

- [ ] **Step 4: Write `src/foldq/solvers/base.py`**

```python
"""The single interface every solver implements.

Keeping one Protocol is what makes the comparison fair: no solver gets private
preprocessing, and every result flows through the same decode/repair/rescore path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import SolverResult


@dataclass(frozen=True)
class SolverConfig:
    """Runtime knobs. Every stochastic solver must honour `seed`."""

    num_reads: int = 100
    seed: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class FoldSolver(Protocol):
    name: str

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult: ...
```

- [ ] **Step 5: Write `src/foldq/solvers/exact.py`**

```python
"""Exact ground-state solvers, the source of truth for Gates B and C.

Tree decomposition handles sparse graphs efficiently but fails on the dense
conflict graphs RNA produces above roughly 22 variables. Beyond `max_variables`
this raises rather than returning a heuristic answer that would silently
invalidate every gate that depends on it.
"""

from __future__ import annotations

import itertools
import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


class ExactSolverTooLarge(RuntimeError):
    """Raised when a problem exceeds the exact solver's honest reach."""


class ExactSolver:
    """Enumerate every assignment and return the true optimum."""

    name = "exact"

    def __init__(self, max_variables: int = 22, brute_force_limit: int = 18) -> None:
        self.max_variables = max_variables
        self.brute_force_limit = brute_force_limit

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        n = problem.num_variables
        if n > self.max_variables:
            raise ExactSolverTooLarge(
                f"problem has {n} variables, above the exact limit of {self.max_variables}; "
                "Gates B and C cannot be evaluated at this size"
            )

        start = time.perf_counter()

        # Tree decomposition is the workhorse: it solved 22 variables in 0.056s during
        # design probing, where brute force needs 4.2M enumerations. It raises on graphs
        # whose treewidth is too large, so brute force stays as a bounded fallback.
        if n > self.brute_force_limit:
            bits, energy, degeneracy, method = self._tree_decomposition(problem)
        else:
            try:
                bits, energy, degeneracy, method = self._tree_decomposition(problem)
            except Exception:  # noqa: BLE001 - any sampler failure falls back safely
                bits, energy, degeneracy, method = self._brute_force(problem)

        return SolverResult(
            solver_name=self.name,
            samples=(Sample(bits=bits, energy=energy),),
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "degeneracy": degeneracy,
                "method": method,
                "num_variables": n,
                "is_exact": True,
            },
        )

    def _tree_decomposition(
        self, problem: QuboProblem
    ) -> tuple[tuple[int, ...], float, int, str]:
        """Exact ground state via tree decomposition of the interaction graph."""
        from dwave.samplers import TreeDecompositionSampler

        try:
            sampleset = TreeDecompositionSampler().sample(problem.to_bqm(), num_reads=2)
        except Exception as error:
            raise ExactSolverTooLarge(
                f"tree decomposition failed on {problem.num_variables} variables "
                f"(density {problem.density:.2f}): {error}"
            ) from error

        best = sampleset.first
        bits = tuple(int(best.sample[i]) for i in range(problem.num_variables))
        degeneracy = sum(
            1
            for record in sampleset.data(["energy"])
            if abs(record.energy - best.energy) <= 1e-9
        )
        return bits, float(best.energy), degeneracy, "tree_decomposition"

    def _brute_force(self, problem: QuboProblem) -> tuple[tuple[int, ...], float, int, str]:
        """Enumerate every assignment. Only used below `brute_force_limit`."""
        n = problem.num_variables
        best_energy = float("inf")
        best_bits: tuple[int, ...] = tuple(0 for _ in range(n))
        degeneracy = 0

        for bits in itertools.product((0, 1), repeat=n):
            energy = problem.energy(bits)
            if energy < best_energy - 1e-9:
                best_energy, best_bits, degeneracy = energy, bits, 1
            elif abs(energy - best_energy) <= 1e-9:
                degeneracy += 1

        return best_bits, best_energy, degeneracy, "brute_force"
```

- [ ] **Step 6: Create `src/foldq/solvers/__init__.py`**

```python
"""Solver implementations behind one common Protocol."""
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_exact_solver.py -v`
Expected: PASS (8 tests)

- [ ] **Step 8: Commit**

```bash
git add src/foldq/schemas/result.py src/foldq/solvers tests/unit/test_exact_solver.py
git commit -m "feat: add FoldSolver protocol and exact ground-state solver

Refuses problems above its honest reach rather than returning a heuristic
answer that would silently invalidate the diagnostic gates."
```

---

### Task 11: Baseline solvers

**Files:**
- Create: `src/foldq/solvers/baselines.py`
- Test: `tests/unit/test_baseline_solvers.py`

**Interfaces:**
- Consumes: `QuboProblem`, `SolverConfig`, `SolverResult`
- Produces: `RandomSolver()`, `GreedySolver(ranking: str = "energy")`, `LocalSearchSolver(max_iterations: int = 1000)` — each with `.name` and `.solve()`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_baseline_solvers.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import Stem
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.baselines import GreedySolver, LocalSearchSolver, RandomSolver
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


@pytest.mark.parametrize("solver", [RandomSolver(), GreedySolver(), LocalSearchSolver()])
def test_baselines_satisfy_the_protocol(solver):
    assert isinstance(solver, FoldSolver)
    assert isinstance(solver.name, str) and solver.name


@pytest.mark.parametrize("solver", [RandomSolver(), GreedySolver(), LocalSearchSolver()])
def test_reported_energy_matches_recomputed_energy(solver, problem):
    """A solver that misreports its own energy would corrupt every downstream gate."""
    result = solver.solve(problem, SolverConfig(num_reads=20, seed=42))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits))


@pytest.mark.parametrize("solver", [RandomSolver(), LocalSearchSolver()])
def test_stochastic_solvers_are_seed_reproducible(solver, problem):
    a = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    b = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    assert [s.bits for s in a.samples] == [s.bits for s in b.samples]


def test_greedy_is_deterministic(problem):
    a = GreedySolver().solve(problem, SolverConfig(seed=1))
    b = GreedySolver().solve(problem, SolverConfig(seed=999))
    assert a.best.bits == b.best.bits


def test_greedy_never_selects_conflicting_stems(problem):
    result = GreedySolver().solve(problem, SolverConfig())
    chosen = [problem.variable_map[i] for i, bit in enumerate(result.best.bits) if bit]
    for a_idx in range(len(chosen)):
        for b_idx in range(a_idx + 1, len(chosen)):
            assert not (chosen[a_idx].nucleotides() & chosen[b_idx].nucleotides())


def test_greedy_beats_random_on_average(problem):
    greedy = GreedySolver().solve(problem, SolverConfig()).best.energy
    random_best = RandomSolver().solve(problem, SolverConfig(num_reads=50, seed=3)).best.energy
    assert greedy <= random_best


def test_local_search_improves_on_its_starting_point(problem):
    result = LocalSearchSolver().solve(problem, SolverConfig(num_reads=10, seed=5))
    assert result.best.energy <= problem.energy(tuple(0 for _ in range(problem.num_variables)))


def test_local_search_reaches_the_optimum_on_a_small_instance(problem):
    exact = ExactSolver().solve(problem, SolverConfig()).best.energy
    found = LocalSearchSolver().solve(problem, SolverConfig(num_reads=50, seed=11)).best.energy
    assert found == pytest.approx(exact, abs=1e-6)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_baseline_solvers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.solvers.baselines'`

- [ ] **Step 3: Write `src/foldq/solvers/baselines.py`**

```python
"""Reference baselines. Any quantum or annealing claim must beat these."""

from __future__ import annotations

import random
import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


class RandomSolver:
    """Uniform random bit assignments: the floor any method must clear."""

    name = "random"

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        rng = random.Random(config.seed)
        start = time.perf_counter()
        samples = []
        for _ in range(config.num_reads):
            bits = tuple(rng.randint(0, 1) for _ in range(problem.num_variables))
            samples.append(Sample(bits=bits, energy=problem.energy(bits)))
        return SolverResult(
            solver_name=self.name,
            samples=tuple(samples),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads},
        )


class GreedySolver:
    """Add helices in rank order, skipping any that conflict with the selection.

    Deterministic and ignores `seed` entirely, which the tests assert.
    """

    name = "greedy"

    def __init__(self, ranking: str = "energy") -> None:
        if ranking not in {"energy", "energy_per_pair", "length"}:
            raise ValueError(f"unknown ranking {ranking!r}")
        self.ranking = ranking

    def _rank_key(self, problem: QuboProblem, index: int) -> float:
        stem = problem.variable_map[index]
        energy = problem.linear.get(index, 0.0)
        if self.ranking == "energy":
            return energy
        if self.ranking == "energy_per_pair":
            return energy / stem.k
        return -float(stem.k)

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        start = time.perf_counter()
        order = sorted(range(problem.num_variables), key=lambda i: self._rank_key(problem, i))

        bits = [0] * problem.num_variables
        for index in order:
            if problem.linear.get(index, 0.0) >= 0.0:
                continue  # no energetic reason to include it
            bits[index] = 1
            if problem.energy(tuple(bits)) >= problem.energy(
                tuple(0 if i == index else b for i, b in enumerate(bits))
            ):
                bits[index] = 0

        assignment = tuple(bits)
        return SolverResult(
            solver_name=self.name,
            samples=(Sample(bits=assignment, energy=problem.energy(assignment)),),
            runtime_seconds=time.perf_counter() - start,
            metadata={"ranking": self.ranking},
        )


class LocalSearchSolver:
    """Steepest-descent hill climbing from random restarts, flipping one bit at a time."""

    name = "local_search"

    def __init__(self, max_iterations: int = 1000) -> None:
        self.max_iterations = max_iterations

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        rng = random.Random(config.seed)
        start = time.perf_counter()
        n = problem.num_variables
        samples = []

        for _ in range(config.num_reads):
            bits = [rng.randint(0, 1) for _ in range(n)]
            energy = problem.energy(tuple(bits))
            for _ in range(self.max_iterations):
                best_index, best_energy = None, energy
                for index in range(n):
                    bits[index] ^= 1
                    candidate = problem.energy(tuple(bits))
                    bits[index] ^= 1
                    if candidate < best_energy - 1e-12:
                        best_index, best_energy = index, candidate
                if best_index is None:
                    break
                bits[best_index] ^= 1
                energy = best_energy
            samples.append(Sample(bits=tuple(bits), energy=energy))

        return SolverResult(
            solver_name=self.name,
            samples=tuple(samples),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "max_iterations": self.max_iterations},
        )
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_baseline_solvers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/foldq/solvers/baselines.py tests/unit/test_baseline_solvers.py
git commit -m "feat: add random, greedy, and local-search baseline solvers"
```

---

### Task 12: Annealing solvers

**Files:**
- Create: `src/foldq/solvers/annealing.py`
- Test: `tests/unit/test_annealing_solvers.py`

**Interfaces:**
- Consumes: `QuboProblem.to_bqm()`, `SolverConfig`
- Produces: `SimulatedAnnealingSolver(num_sweeps: int = 1000)`, `TabuSolver()`, `PathIntegralSolver(num_sweeps: int = 1000)` — the last is simulated *quantum* annealing with tunnelling dynamics

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_annealing_solvers.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.solvers.annealing import (
    PathIntegralSolver,
    SimulatedAnnealingSolver,
    TabuSolver,
)
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"
ALL_SOLVERS = [SimulatedAnnealingSolver(), TabuSolver(), PathIntegralSolver()]


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_annealers_satisfy_the_protocol(solver):
    assert isinstance(solver, FoldSolver)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_reported_energy_matches_recomputed_energy(solver, problem):
    result = solver.solve(problem, SolverConfig(num_reads=20, seed=42))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits), abs=1e-6)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_annealers_find_the_optimum_on_a_small_instance(solver, problem):
    exact = ExactSolver().solve(problem, SolverConfig()).best.energy
    found = solver.solve(problem, SolverConfig(num_reads=100, seed=13)).best.energy
    assert found == pytest.approx(exact, abs=1e-6)


@pytest.mark.parametrize("solver", [SimulatedAnnealingSolver(), PathIntegralSolver()])
def test_annealers_are_seed_reproducible(solver, problem):
    a = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    b = solver.solve(problem, SolverConfig(num_reads=20, seed=7))
    assert a.best.energy == pytest.approx(b.best.energy)


@pytest.mark.parametrize("solver", ALL_SOLVERS)
def test_bit_ordering_survives_the_dimod_roundtrip(solver, problem):
    """dimod returns dict-keyed samples; misordering them corrupts every decode."""
    result = solver.solve(problem, SolverConfig(num_reads=5, seed=1))
    for sample in result.samples:
        assert len(sample.bits) == problem.num_variables
        assert all(bit in (0, 1) for bit in sample.bits)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_annealing_solvers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.solvers.annealing'`

- [ ] **Step 3: Write `src/foldq/solvers/annealing.py`**

```python
"""Quantum-inspired and classical annealing solvers from the Ocean SDK.

All three run locally with no account and no cost.
"""

from __future__ import annotations

import time

from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


def _to_samples(sampleset, problem: QuboProblem) -> tuple[Sample, ...]:
    """Convert a dimod SampleSet into ordered bit tuples.

    dimod keys samples by variable label, so this must index explicitly rather
    than relying on dict ordering.
    """
    samples = []
    for record in sampleset.data(["sample", "energy", "num_occurrences"]):
        bits = tuple(int(record.sample[i]) for i in range(problem.num_variables))
        samples.append(
            Sample(
                bits=bits,
                energy=float(record.energy),
                num_occurrences=int(record.num_occurrences),
            )
        )
    return tuple(samples)


class SimulatedAnnealingSolver:
    """The primary quantum-inspired method: classical thermal annealing."""

    name = "simulated_annealing"

    def __init__(self, num_sweeps: int = 1000) -> None:
        self.num_sweeps = num_sweeps

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import SimulatedAnnealingSampler

        start = time.perf_counter()
        sampleset = SimulatedAnnealingSampler().sample(
            problem.to_bqm(),
            num_reads=config.num_reads,
            num_sweeps=self.num_sweeps,
            seed=config.seed,
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "num_sweeps": self.num_sweeps},
        )


class TabuSolver:
    """Strong classical local search with a tabu list. Hard to beat at this scale."""

    name = "tabu"

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import TabuSampler

        start = time.perf_counter()
        sampleset = TabuSampler().sample(
            problem.to_bqm(), num_reads=config.num_reads, seed=config.seed
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads},
        )


class PathIntegralSolver:
    """Simulated quantum annealing via path-integral Monte Carlo.

    Unlike thermal annealing this models quantum tunnelling through barriers,
    making it the closest classical analogue of a quantum annealer.
    """

    name = "path_integral_sqa"

    def __init__(self, num_sweeps: int = 1000) -> None:
        self.num_sweeps = num_sweeps

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from dwave.samplers import PathIntegralAnnealingSampler

        start = time.perf_counter()
        sampleset = PathIntegralAnnealingSampler().sample(
            problem.to_bqm(),
            num_reads=config.num_reads,
            num_sweeps=self.num_sweeps,
            seed=config.seed,
        )
        return SolverResult(
            solver_name=self.name,
            samples=_to_samples(sampleset, problem),
            runtime_seconds=time.perf_counter() - start,
            metadata={"num_reads": config.num_reads, "num_sweeps": self.num_sweeps},
        )
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_annealing_solvers.py -v`
Expected: PASS. If `PathIntegralAnnealingSampler` rejects the `seed` keyword in the installed Ocean version, drop that argument and mark the reproducibility test `xfail` with a comment naming the version — do not silently remove the test.

- [ ] **Step 5: Commit**

```bash
git add src/foldq/solvers/annealing.py tests/unit/test_annealing_solvers.py
git commit -m "feat: add simulated annealing, tabu, and path-integral SQA solvers"
```

---

## Phase 5 — Decoding, repair, and evaluation

### Task 13: Decoding and deterministic repair

Raw and repaired results are both reported, so post-processing cannot hide a formulation that produces invalid structures.

**Files:**
- Create: `src/foldq/decoding/__init__.py`, `src/foldq/decoding/decode.py`, `src/foldq/decoding/repair.py`
- Test: `tests/unit/test_decoding.py`

**Interfaces:**
- Consumes: `QuboProblem`, `Sample`, `Stem`, `ValidationReport`, `RepairOp`, `ViennaBackend`
- Produces:
  - `bits_to_stems(bits, problem) -> list[Stem]`
  - `validate_stems(stems, *, forbid_crossing: bool = True) -> ValidationReport`
  - `repair_stems(stems, problem, *, forbid_crossing: bool = True) -> tuple[list[Stem], list[RepairOp]]`
  - `decode_sample(sample, problem, backend, *, repair: bool = True, forbid_crossing: bool = True) -> FoldCandidate`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_decoding.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.decoding.decode import bits_to_stems, decode_sample, validate_stems
from foldq.decoding.repair import repair_stems
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample
from foldq.schemas.structure import Stem

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


@pytest.fixture
def problem(backend):
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), backend)


def _conflicting_problem() -> QuboProblem:
    """Two helices that share nucleotide 0 and therefore cannot coexist."""
    return QuboProblem(
        linear={0: -5.0, 1: -4.0},
        quadratic={(0, 1): 50.0},
        offset=0.0,
        variable_map=(Stem(0, 9, 2), Stem(0, 10, 2)),
        sequence=DEMO,
        metadata={},
    )


def test_bits_select_the_right_stems(problem):
    bits = tuple(1 if i == 0 else 0 for i in range(problem.num_variables))
    assert bits_to_stems(bits, problem) == [problem.variable_map[0]]


def test_no_bits_set_decodes_to_empty_structure(problem):
    assert bits_to_stems(tuple(0 for _ in range(problem.num_variables)), problem) == []


def test_validate_accepts_a_legal_structure():
    assert validate_stems([Stem(0, 30, 3), Stem(10, 20, 2)]).is_valid


def test_validate_flags_overlap():
    report = validate_stems([Stem(0, 20, 3), Stem(2, 30, 2)])
    assert not report.is_valid
    assert report.overlapping_pairs == ((0, 1),)


def test_validate_flags_crossing():
    report = validate_stems([Stem(0, 20, 2), Stem(10, 30, 2)], forbid_crossing=True)
    assert report.crossing_pairs == ((0, 1),)


def test_validate_ignores_crossing_in_pseudoknot_mode():
    report = validate_stems([Stem(0, 20, 2), Stem(10, 30, 2)], forbid_crossing=False)
    assert report.is_valid


def test_repair_removes_conflicts_and_records_why():
    problem = _conflicting_problem()
    repaired, ops = repair_stems(list(problem.variable_map), problem)
    assert validate_stems(repaired).is_valid
    assert len(ops) == 1
    assert ops[0].action == "remove"
    assert "overlap" in ops[0].reason


def test_repair_keeps_the_more_favourable_stem():
    """Stem 0 has energy -5 versus -4, so repair must drop stem 1."""
    problem = _conflicting_problem()
    repaired, _ = repair_stems(list(problem.variable_map), problem)
    assert repaired == [Stem(0, 9, 2)]


def test_repair_is_a_no_op_on_valid_structures(problem):
    stems = [problem.variable_map[0]]
    repaired, ops = repair_stems(stems, problem)
    assert repaired == stems
    assert ops == []


def test_repair_is_deterministic():
    problem = _conflicting_problem()
    first, _ = repair_stems(list(problem.variable_map), problem)
    second, _ = repair_stems(list(problem.variable_map), problem)
    assert first == second


def test_decode_produces_a_scored_candidate(problem, backend):
    bits = tuple(1 if i == 0 else 0 for i in range(problem.num_variables))
    candidate = decode_sample(Sample(bits, problem.energy(bits)), problem, backend)
    assert len(candidate.dot_bracket) == len(DEMO)
    assert candidate.vienna_energy == pytest.approx(
        backend.eval_structure(DEMO, candidate.dot_bracket), abs=0.01
    )
    assert candidate.validation.is_valid


def test_decode_without_repair_preserves_the_violation():
    """Raw reporting must not quietly fix an invalid solver output."""
    problem = _conflicting_problem()
    bits = (1, 1)
    candidate = decode_sample(
        Sample(bits, problem.energy(bits)), problem, ViennaBackend(), repair=False
    )
    assert not candidate.validation.is_valid
    assert not candidate.was_repaired
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_decoding.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.decoding'`

- [ ] **Step 3: Write `src/foldq/decoding/decode.py`**

```python
"""Turn solver bit strings back into RNA structures."""

from __future__ import annotations

from foldq.biology.conflicts import stems_cross, stems_overlap
from foldq.biology.dotbracket import stems_to_dotbracket
from foldq.classical.vienna import ViennaBackend
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import FoldCandidate, Sample
from foldq.schemas.structure import Stem, ValidationReport


def bits_to_stems(bits: tuple[int, ...], problem: QuboProblem) -> list[Stem]:
    """Map a bit assignment onto the helices it selects."""
    if len(bits) != problem.num_variables:
        raise ValueError(f"expected {problem.num_variables} bits, got {len(bits)}")
    return [problem.variable_map[index] for index, bit in enumerate(bits) if bit]


def validate_stems(stems: list[Stem], *, forbid_crossing: bool = True) -> ValidationReport:
    """Report every structural violation in a selected stem set."""
    overlaps: list[tuple[int, int]] = []
    crossings: list[tuple[int, int]] = []
    for a in range(len(stems)):
        for b in range(a + 1, len(stems)):
            if stems_overlap(stems[a], stems[b]):
                overlaps.append((a, b))
            elif forbid_crossing and stems_cross(stems[a], stems[b]):
                crossings.append((a, b))
    return ValidationReport(
        overlapping_pairs=tuple(overlaps), crossing_pairs=tuple(crossings)
    )


def decode_sample(
    sample: Sample,
    problem: QuboProblem,
    backend: ViennaBackend,
    *,
    repair: bool = True,
    forbid_crossing: bool = True,
) -> FoldCandidate:
    """Decode, optionally repair, then rescore against the Turner model."""
    from foldq.decoding.repair import repair_stems

    stems = bits_to_stems(sample.bits, problem)
    report = validate_stems(stems, forbid_crossing=forbid_crossing)
    operations: tuple = ()
    was_repaired = False

    if repair and not report.is_valid:
        repaired, ops = repair_stems(stems, problem, forbid_crossing=forbid_crossing)
        stems, operations, was_repaired = repaired, tuple(ops), True
        report = validate_stems(stems, forbid_crossing=forbid_crossing)

    # Crossing structures cannot be written in single-bracket notation, so a
    # pseudoknotted candidate has no scorable dot-bracket and gets NaN energy.
    if report.crossing_pairs or not report.is_valid:
        dot_bracket = "." * len(problem.sequence)
        vienna_energy = float("nan")
    else:
        dot_bracket = stems_to_dotbracket(stems, len(problem.sequence))
        vienna_energy = backend.eval_structure(problem.sequence, dot_bracket)

    bits = tuple(
        1 if problem.variable_map[i] in set(stems) else 0
        for i in range(problem.num_variables)
    )

    return FoldCandidate(
        stems=tuple(stems),
        dot_bracket=dot_bracket,
        qubo_energy=problem.energy(bits),
        vienna_energy=vienna_energy,
        validation=report,
        repairs=operations,
        was_repaired=was_repaired,
    )
```

- [ ] **Step 4: Write `src/foldq/decoding/repair.py`**

```python
"""Deterministic repair of structurally invalid solver output.

Strategy: while a violation remains, drop the helix whose removal costs the least
energy, breaking ties by stem order so the result is fully reproducible.
"""

from __future__ import annotations

from foldq.decoding.decode import validate_stems
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.structure import RepairOp, Stem


def repair_stems(
    stems: list[Stem],
    problem: QuboProblem,
    *,
    forbid_crossing: bool = True,
) -> tuple[list[Stem], list[RepairOp]]:
    """Remove helices until the structure is legal."""
    index_of = {stem: index for index, stem in enumerate(problem.variable_map)}
    working = list(stems)
    operations: list[RepairOp] = []

    while True:
        report = validate_stems(working, forbid_crossing=forbid_crossing)
        if report.is_valid:
            return working, operations

        if report.overlapping_pairs:
            offending, reason = report.overlapping_pairs[0], "overlap: shared nucleotide"
        else:
            offending, reason = report.crossing_pairs[0], "crossing: pseudoknot"

        left, right = working[offending[0]], working[offending[1]]
        # Drop whichever contributes less energetic benefit; ties break on index.
        left_gain = problem.linear.get(index_of.get(left, -1), 0.0)
        right_gain = problem.linear.get(index_of.get(right, -1), 0.0)
        victim = right if left_gain <= right_gain else left

        working.remove(victim)
        operations.append(RepairOp(action="remove", stem=victim, reason=reason))
```

- [ ] **Step 5: Create `src/foldq/decoding/__init__.py`**

```python
"""Decoding solver output back into RNA structures."""
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_decoding.py -v`
Expected: PASS (12 tests)

- [ ] **Step 7: Commit**

```bash
git add src/foldq/decoding tests/unit/test_decoding.py
git commit -m "feat: add sample decoding and deterministic structural repair

Raw and repaired candidates are both reported so post-processing cannot mask
a formulation that produces invalid structures."
```

---

### Task 14: Structural and energy metrics

**Files:**
- Create: `src/foldq/evaluation/__init__.py`, `src/foldq/evaluation/metrics.py`
- Test: `tests/unit/test_metrics.py`

**Interfaces:**
- Consumes: `Stem`, pair sets
- Produces:
  - `base_pair_metrics(predicted: frozenset, reference: frozenset) -> PairMetrics`
  - `PairMetrics(precision: float, recall: float, f1: float, true_positives: int, false_positives: int, false_negatives: int)`
  - `energy_gap(candidate: float, reference: float) -> float`
  - `relative_energy_gap(candidate: float, reference: float) -> float`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_metrics.py
import math

import pytest

from foldq.evaluation.metrics import base_pair_metrics, energy_gap, relative_energy_gap


def test_perfect_prediction_scores_one():
    pairs = frozenset({(0, 9), (1, 8)})
    metrics = base_pair_metrics(pairs, pairs)
    assert metrics.precision == 1.0
    assert metrics.recall == 1.0
    assert metrics.f1 == 1.0


def test_empty_prediction_against_real_reference_scores_zero():
    metrics = base_pair_metrics(frozenset(), frozenset({(0, 9)}))
    assert metrics.recall == 0.0
    assert metrics.f1 == 0.0
    assert metrics.false_negatives == 1


def test_both_empty_is_perfect_by_convention():
    """Predicting 'no structure' for an unstructured sequence is correct, not undefined."""
    metrics = base_pair_metrics(frozenset(), frozenset())
    assert metrics.f1 == 1.0


def test_partial_overlap_computes_standard_prf():
    predicted = frozenset({(0, 9), (1, 8), (2, 7)})
    reference = frozenset({(0, 9), (1, 8), (30, 40)})
    metrics = base_pair_metrics(predicted, reference)
    assert metrics.true_positives == 2
    assert metrics.false_positives == 1
    assert metrics.false_negatives == 1
    assert metrics.precision == pytest.approx(2 / 3)
    assert metrics.recall == pytest.approx(2 / 3)
    assert metrics.f1 == pytest.approx(2 / 3)


def test_energy_gap_is_signed_difference_from_reference():
    assert energy_gap(-8.0, -10.0) == pytest.approx(2.0)
    assert energy_gap(-10.0, -10.0) == pytest.approx(0.0)


def test_relative_gap_normalises_by_reference_magnitude():
    assert relative_energy_gap(-8.0, -10.0) == pytest.approx(0.2)


def test_relative_gap_handles_zero_reference():
    assert relative_energy_gap(-1.0, 0.0) == 0.0 or math.isinf(relative_energy_gap(-1.0, 0.0))


def test_nan_candidate_energy_propagates_as_nan():
    assert math.isnan(energy_gap(float("nan"), -10.0))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_metrics.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.evaluation'`

- [ ] **Step 3: Write `src/foldq/evaluation/metrics.py`**

```python
"""Structural and energetic comparison metrics."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PairMetrics:
    """Standard precision / recall / F1 over predicted base pairs."""

    precision: float
    recall: float
    f1: float
    true_positives: int
    false_positives: int
    false_negatives: int


def base_pair_metrics(
    predicted: frozenset[tuple[int, int]],
    reference: frozenset[tuple[int, int]],
) -> PairMetrics:
    """Compare two base-pair sets.

    Predicting nothing for a genuinely unstructured reference scores 1.0 rather
    than being undefined, since that is the correct answer.
    """
    true_positives = len(predicted & reference)
    false_positives = len(predicted - reference)
    false_negatives = len(reference - predicted)

    if not predicted and not reference:
        return PairMetrics(1.0, 1.0, 1.0, 0, 0, 0)

    precision = true_positives / len(predicted) if predicted else 0.0
    recall = true_positives / len(reference) if reference else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    return PairMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        true_positives=true_positives,
        false_positives=false_positives,
        false_negatives=false_negatives,
    )


def energy_gap(candidate: float, reference: float) -> float:
    """How much worse the candidate is than the reference, in kcal/mol."""
    return candidate - reference


def relative_energy_gap(candidate: float, reference: float) -> float:
    """Energy gap normalised by the reference magnitude."""
    if reference == 0.0:
        return 0.0 if candidate == 0.0 else math.inf
    return abs(candidate - reference) / abs(reference)
```

- [ ] **Step 4: Create `src/foldq/evaluation/__init__.py`**

```python
"""Evaluation: diagnostic gates, metrics, and resource accounting."""
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_metrics.py -v`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/foldq/evaluation tests/unit/test_metrics.py
git commit -m "feat: add base-pair and energy comparison metrics"
```

---

### Task 15: The four-gate diagnostic ladder

The spine of the project. Every result becomes attributable to candidate generation, the energy model, the optimizer, or none of them.

**Files:**
- Create: `src/foldq/schemas/gates.py`, `src/foldq/evaluation/gates.py`
- Test: `tests/unit/test_gates.py`

**Interfaces:**
- Consumes: `QuboProblem`, `ViennaReference`, `SolverResult`, `FoldCandidate`, `ExactSolver`
- Produces:
  - `GateReport(representable, representable_fraction, is_qubo_ground_state, solver_found_ground_state, energy_gap, base_pair_f1, notes)` with `.attribution -> str`
  - `gate_a_representable(reference_pairs, stems) -> tuple[bool, float]`
  - `gate_b_faithful(problem, reference_pairs, exact_result) -> bool | None`
  - `gate_c_solved(solver_result, exact_result) -> bool | None`
  - `gate_d_physical(candidate, reference) -> tuple[float, float]`
  - `evaluate_gates(problem, reference, solver_result, candidate, exact_result=None) -> GateReport`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_gates.py
import pytest

from foldq.biology.dotbracket import stems_to_pairs
from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.decoding.decode import decode_sample
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.gates import (
    evaluate_gates,
    gate_a_representable,
    gate_c_solved,
)
from foldq.schemas.gates import GateReport
from foldq.schemas.result import Sample, SolverResult
from foldq.schemas.structure import Stem
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def backend():
    return ViennaBackend()


def test_gate_a_passes_when_every_reference_pair_is_covered():
    reference = frozenset({(0, 9), (1, 8), (2, 7)})
    ok, fraction = gate_a_representable(reference, [Stem(0, 9, 3)])
    assert ok
    assert fraction == 1.0


def test_gate_a_reports_the_ceiling_when_a_pair_is_missing():
    reference = frozenset({(0, 9), (1, 8), (2, 7), (30, 40)})
    ok, fraction = gate_a_representable(reference, [Stem(0, 9, 3)])
    assert not ok
    assert fraction == pytest.approx(0.75)


def test_gate_a_on_the_real_demo_sequence(backend):
    reference = backend.fold(DEMO)
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    ok, fraction = gate_a_representable(reference.base_pairs, stems)
    assert ok and fraction == 1.0


def test_gate_c_passes_when_solver_matches_exact():
    exact = SolverResult("exact", (Sample((1, 0), -5.0),), 0.0, {})
    solver = SolverResult("sa", (Sample((1, 0), -5.0),), 0.0, {})
    assert gate_c_solved(solver, exact) is True


def test_gate_c_fails_when_solver_is_worse():
    exact = SolverResult("exact", (Sample((1, 0), -5.0),), 0.0, {})
    solver = SolverResult("sa", (Sample((0, 1), -3.0),), 0.0, {})
    assert gate_c_solved(solver, exact) is False


def test_gate_c_is_none_without_exact_ground_truth():
    solver = SolverResult("sa", (Sample((0, 1), -3.0),), 0.0, {})
    assert gate_c_solved(solver, None) is None


def test_full_ladder_on_the_demo_sequence(backend):
    reference = backend.fold(DEMO)
    stems = generate_maximal_stems(DEMO, min_stem_length=2)
    problem = build_stem_qubo(DEMO, stems, backend)
    exact = ExactSolver().solve(problem, SolverConfig())
    candidate = decode_sample(exact.best, problem, backend)

    report = evaluate_gates(problem, reference, exact, candidate, exact_result=exact)
    assert isinstance(report, GateReport)
    assert report.representable is True
    assert report.solver_found_ground_state is True
    assert 0.0 <= report.base_pair_f1 <= 1.0


def test_attribution_names_the_first_failing_gate():
    assert "candidate generation" in GateReport(
        representable=False, representable_fraction=0.5,
        is_qubo_ground_state=None, solver_found_ground_state=None,
        energy_gap=1.0, base_pair_f1=0.0,
    ).attribution

    assert "energy model" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=False, solver_found_ground_state=True,
        energy_gap=1.0, base_pair_f1=0.5,
    ).attribution

    assert "optimizer" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=True, solver_found_ground_state=False,
        energy_gap=1.0, base_pair_f1=0.5,
    ).attribution

    assert "no failure" in GateReport(
        representable=True, representable_fraction=1.0,
        is_qubo_ground_state=True, solver_found_ground_state=True,
        energy_gap=0.0, base_pair_f1=1.0,
    ).attribution
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_gates.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.schemas.gates'`

- [ ] **Step 3: Write `src/foldq/schemas/gates.py`**

```python
"""The four-gate diagnostic report."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class GateReport:
    """Attributes a result to candidate generation, the energy model, or the solver.

    Gates B and C need exact ground truth and are `None` when the instance is too
    large to enumerate.
    """

    representable: bool
    representable_fraction: float
    is_qubo_ground_state: bool | None
    solver_found_ground_state: bool | None
    energy_gap: float
    base_pair_f1: float
    notes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def attribution(self) -> str:
        """Name the earliest gate that failed; later gates cannot be blamed for it."""
        if not self.representable:
            return (
                "candidate generation: the reference structure is not in the candidate "
                f"set (only {self.representable_fraction:.0%} of its pairs are reachable)"
            )
        if self.is_qubo_ground_state is False:
            return "energy model: the reference structure is not the QUBO ground state"
        if self.solver_found_ground_state is False:
            return "optimizer: the solver did not reach the QUBO ground state"
        if self.is_qubo_ground_state is None or self.solver_found_ground_state is None:
            return "indeterminate: instance too large for exact ground truth"
        return "no failure: all gates passed"
```

- [ ] **Step 4: Write `src/foldq/evaluation/gates.py`**

```python
"""Evaluate the four-gate diagnostic ladder."""

from __future__ import annotations

from foldq.biology.dotbracket import dotbracket_to_pairs, stems_to_pairs
from foldq.classical.vienna import ViennaReference
from foldq.evaluation.metrics import base_pair_metrics, energy_gap
from foldq.schemas.gates import GateReport
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import FoldCandidate, SolverResult
from foldq.schemas.structure import Stem

TOLERANCE = 1e-6


def gate_a_representable(
    reference_pairs: frozenset[tuple[int, int]], stems: list[Stem]
) -> tuple[bool, float]:
    """Gate A: can the candidate set express the reference structure at all?"""
    if not reference_pairs:
        return True, 1.0
    reachable = stems_to_pairs(stems)
    covered = len(reference_pairs & reachable)
    return covered == len(reference_pairs), covered / len(reference_pairs)


def gate_b_faithful(
    problem: QuboProblem,
    reference_pairs: frozenset[tuple[int, int]],
    exact_result: SolverResult | None,
) -> bool | None:
    """Gate B: is the reference structure the QUBO's ground state?"""
    if exact_result is None:
        return None
    ground_pairs = stems_to_pairs(
        [problem.variable_map[i] for i, bit in enumerate(exact_result.best.bits) if bit]
    )
    return ground_pairs == reference_pairs


def gate_c_solved(
    solver_result: SolverResult, exact_result: SolverResult | None
) -> bool | None:
    """Gate C: did this solver actually reach the QUBO ground state?"""
    if exact_result is None:
        return None
    return solver_result.best.energy <= exact_result.best.energy + TOLERANCE


def gate_d_physical(
    candidate: FoldCandidate, reference: ViennaReference
) -> tuple[float, float]:
    """Gate D: how good is the decoded structure thermodynamically and structurally?"""
    predicted = dotbracket_to_pairs(candidate.dot_bracket) if candidate.dot_bracket else frozenset()
    metrics = base_pair_metrics(predicted, reference.base_pairs)
    return energy_gap(candidate.vienna_energy, reference.mfe_energy), metrics.f1


def evaluate_gates(
    problem: QuboProblem,
    reference: ViennaReference,
    solver_result: SolverResult,
    candidate: FoldCandidate,
    exact_result: SolverResult | None = None,
) -> GateReport:
    """Run the full ladder and package the attribution."""
    representable, fraction = gate_a_representable(
        reference.base_pairs, list(problem.variable_map)
    )
    gap, f1 = gate_d_physical(candidate, reference)

    notes: list[str] = []
    if exact_result is None:
        notes.append(
            f"instance has {problem.num_variables} variables; exact ground truth "
            "unavailable, so Gates B and C are indeterminate"
        )
    if candidate.was_repaired:
        notes.append(f"structure required {len(candidate.repairs)} repair operation(s)")

    return GateReport(
        representable=representable,
        representable_fraction=fraction,
        is_qubo_ground_state=gate_b_faithful(problem, reference.base_pairs, exact_result),
        solver_found_ground_state=gate_c_solved(solver_result, exact_result),
        energy_gap=gap,
        base_pair_f1=f1,
        notes=tuple(notes),
    )
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_gates.py -v`
Expected: PASS (8 tests)

- [ ] **Step 6: Run the whole suite to confirm nothing regressed**

Run: `.venv/bin/pytest tests -q`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/foldq/schemas/gates.py src/foldq/evaluation/gates.py tests/unit/test_gates.py
git commit -m "feat: add four-gate diagnostic ladder

Attributes every result to candidate generation, the energy model, or the
optimizer, rather than reporting an unexplained score."
```

---

## Phase 6 — Gate-based quantum layer

### Task 16: QAOA solver and quantum-resource accounting

**Files:**
- Create: `src/foldq/solvers/qaoa.py`, `src/foldq/evaluation/resources.py`
- Test: `tests/unit/test_qaoa.py`

**Interfaces:**
- Consumes: `to_sparse_pauli_op`, `spins_to_bits` (Task 9), `QuboProblem`, `SolverConfig`
- Produces:
  - `QAOASolver(reps: int = 1, optimizer: str = "COBYLA", maxiter: int = 200, shots: int | None = None, objective: str = "expectation", cvar_alpha: float = 0.25, warm_start_bits: tuple[int,...] | None = None, noise_backend: str | None = None)`
  - `ResourceReport(logical_qubits, hamiltonian_terms, qubo_density, circuit_depth, transpiled_depth, one_qubit_gates, two_qubit_gates, swap_gates, shots, optimizer_iterations, circuit_evaluations)`
  - `estimate_resources(problem, *, reps: int = 1, backend_name: str | None = None) -> ResourceReport`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_qaoa.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.resources import ResourceReport, estimate_resources
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.exact import ExactSolver
from foldq.solvers.qaoa import QAOASolver

DEMO = "GGGAAAUCCCU"

pytest.importorskip("qiskit_aer", reason="quantum extra not installed")


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


def test_qaoa_satisfies_the_protocol():
    assert isinstance(QAOASolver(), FoldSolver)


def test_qaoa_reported_energies_match_the_qubo(problem):
    result = QAOASolver(reps=1, maxiter=25).solve(problem, SolverConfig(num_reads=64, seed=42))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits), abs=1e-6)


def test_qaoa_returns_bitstrings_of_the_right_width(problem):
    result = QAOASolver(reps=1, maxiter=25).solve(problem, SolverConfig(num_reads=64, seed=42))
    for sample in result.samples:
        assert len(sample.bits) == problem.num_variables


def test_qaoa_beats_random_sampling(problem):
    """Weak but meaningful: the variational loop should do something."""
    from foldq.solvers.baselines import RandomSolver

    qaoa = QAOASolver(reps=2, maxiter=100).solve(problem, SolverConfig(num_reads=256, seed=1))
    rand = RandomSolver().solve(problem, SolverConfig(num_reads=256, seed=1))
    assert qaoa.best.energy <= rand.best.energy


def test_qaoa_finds_the_optimum_on_a_tiny_instance(problem):
    exact = ExactSolver().solve(problem, SolverConfig()).best.energy
    result = QAOASolver(reps=3, maxiter=300).solve(problem, SolverConfig(num_reads=512, seed=7))
    assert result.best.energy == pytest.approx(exact, abs=1e-6)


def test_qaoa_is_seed_reproducible(problem):
    a = QAOASolver(reps=1, maxiter=25).solve(problem, SolverConfig(num_reads=64, seed=5))
    b = QAOASolver(reps=1, maxiter=25).solve(problem, SolverConfig(num_reads=64, seed=5))
    assert a.best.energy == pytest.approx(b.best.energy)


def test_qaoa_metadata_records_the_variational_cost(problem):
    result = QAOASolver(reps=2, maxiter=30).solve(problem, SolverConfig(num_reads=64, seed=3))
    for key in ("reps", "optimizer", "optimizer_iterations", "circuit_evaluations"):
        assert key in result.metadata
    assert result.metadata["reps"] == 2


def test_warm_start_accepts_a_classical_seed_solution(problem):
    from foldq.solvers.baselines import GreedySolver

    greedy = GreedySolver().solve(problem, SolverConfig()).best.bits
    result = QAOASolver(reps=1, maxiter=25, warm_start_bits=greedy).solve(
        problem, SolverConfig(num_reads=64, seed=2)
    )
    assert result.metadata["warm_started"] is True


def test_resource_report_counts_qubits_and_terms(problem):
    report = estimate_resources(problem, reps=1)
    assert isinstance(report, ResourceReport)
    assert report.logical_qubits == problem.num_variables
    assert report.hamiltonian_terms > 0
    assert report.two_qubit_gates > 0
    assert report.circuit_depth > 0


def test_resource_depth_grows_with_reps(problem):
    shallow = estimate_resources(problem, reps=1)
    deep = estimate_resources(problem, reps=3)
    assert deep.circuit_depth > shallow.circuit_depth
    assert deep.two_qubit_gates > shallow.two_qubit_gates
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/unit/test_qaoa.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.solvers.qaoa'`

- [ ] **Step 3: Write `src/foldq/solvers/qaoa.py`**

```python
"""QAOA on local Aer simulators.

Runs entirely offline with no account and no cost. Optional hardware-realistic
noise comes from `qiskit_ibm_runtime.fake_provider`, which ships real IBM device
calibration data locally.
"""

from __future__ import annotations

import time
from collections.abc import Sequence

import numpy as np

from foldq.qubo.ising import to_sparse_pauli_op
from foldq.schemas.qubo import QuboProblem
from foldq.schemas.result import Sample, SolverResult
from foldq.solvers.base import SolverConfig


def _cvar(energies: Sequence[float], weights: Sequence[float], alpha: float) -> float:
    """Mean of the lowest-`alpha` fraction of sampled energies."""
    order = np.argsort(energies)
    cutoff = max(1, int(np.ceil(alpha * sum(weights))))
    taken, total, accumulated = 0.0, 0.0, 0.0
    for index in order:
        take = min(weights[index], cutoff - accumulated)
        if take <= 0:
            break
        total += energies[index] * take
        taken += take
        accumulated += take
    return total / taken if taken else float(np.mean(energies))


class QAOASolver:
    """Quantum Approximate Optimization Algorithm with optional CVaR and warm start."""

    name = "qaoa"

    def __init__(
        self,
        reps: int = 1,
        optimizer: str = "COBYLA",
        maxiter: int = 200,
        shots: int | None = None,
        objective: str = "expectation",
        cvar_alpha: float = 0.25,
        warm_start_bits: tuple[int, ...] | None = None,
        noise_backend: str | None = None,
    ) -> None:
        if objective not in {"expectation", "cvar"}:
            raise ValueError(f"unknown objective {objective!r}")
        self.reps = reps
        self.optimizer = optimizer
        self.maxiter = maxiter
        self.shots = shots
        self.objective = objective
        self.cvar_alpha = cvar_alpha
        self.warm_start_bits = warm_start_bits
        self.noise_backend = noise_backend
        if noise_backend is not None:
            self.name = f"qaoa_noisy_{noise_backend}"
        elif objective == "cvar":
            self.name = "cvar_qaoa"

    def _simulator(self):
        from qiskit_aer import AerSimulator

        if self.noise_backend is None:
            return AerSimulator(method="statevector")

        from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

        device = next(
            backend
            for backend in FakeProviderForBackendV2().backends()
            if backend.name == self.noise_backend
        )
        return AerSimulator.from_backend(device)

    def _circuit(self, problem: QuboProblem):
        from qiskit.circuit.library import QAOAAnsatz

        cost = to_sparse_pauli_op(problem)
        initial_state = None
        if self.warm_start_bits is not None:
            from qiskit import QuantumCircuit

            initial_state = QuantumCircuit(problem.num_variables)
            for index, bit in enumerate(self.warm_start_bits):
                if bit:
                    initial_state.x(index)
        ansatz = QAOAAnsatz(cost_operator=cost, reps=self.reps, initial_state=initial_state)
        ansatz.measure_all()
        return ansatz

    def solve(self, problem: QuboProblem, config: SolverConfig) -> SolverResult:
        from qiskit import transpile
        from scipy.optimize import minimize

        start = time.perf_counter()
        rng = np.random.default_rng(config.seed)
        simulator = self._simulator()
        ansatz = self._circuit(problem)
        compiled = transpile(ansatz, simulator, seed_transpiler=config.seed or 0)

        shots = self.shots or config.num_reads
        evaluations = {"count": 0}

        def sample_energies(parameters):
            bound = compiled.assign_parameters(parameters)
            counts = simulator.run(bound, shots=shots, seed_simulator=config.seed).result().get_counts()
            energies, weights, bitstrings = [], [], []
            for bitstring, occurrences in counts.items():
                # Qiskit returns little-endian strings; variable 0 is the last char.
                bits = tuple(int(char) for char in reversed(bitstring.replace(" ", "")))
                bits = bits[: problem.num_variables]
                energies.append(problem.energy(bits))
                weights.append(float(occurrences))
                bitstrings.append(bits)
            return energies, weights, bitstrings

        def objective_value(parameters):
            evaluations["count"] += 1
            energies, weights, _ = sample_energies(parameters)
            if self.objective == "cvar":
                return _cvar(energies, weights, self.cvar_alpha)
            return float(np.average(energies, weights=weights))

        initial = rng.uniform(0, np.pi, size=compiled.num_parameters)
        optimization = minimize(
            objective_value,
            initial,
            method=self.optimizer,
            options={"maxiter": self.maxiter},
        )

        _, weights, bitstrings = sample_energies(optimization.x)
        samples = tuple(
            Sample(bits=bits, energy=problem.energy(bits), num_occurrences=int(weight))
            for bits, weight in zip(bitstrings, weights)
        )

        return SolverResult(
            solver_name=self.name,
            samples=samples,
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "reps": self.reps,
                "optimizer": self.optimizer,
                "objective": self.objective,
                "cvar_alpha": self.cvar_alpha if self.objective == "cvar" else None,
                "shots": shots,
                "optimizer_iterations": int(optimization.nit)
                if hasattr(optimization, "nit")
                else self.maxiter,
                "circuit_evaluations": evaluations["count"],
                "warm_started": self.warm_start_bits is not None,
                "noise_backend": self.noise_backend,
                "transpiled_depth": compiled.depth(),
            },
        )
```

- [ ] **Step 4: Write `src/foldq/evaluation/resources.py`**

```python
"""Quantum-resource accounting for the scaling analysis."""

from __future__ import annotations

from dataclasses import dataclass

from foldq.qubo.ising import to_sparse_pauli_op
from foldq.schemas.qubo import QuboProblem


@dataclass(frozen=True)
class ResourceReport:
    """What running this instance on gate-based hardware would actually cost."""

    logical_qubits: int
    hamiltonian_terms: int
    qubo_density: float
    circuit_depth: int
    transpiled_depth: int
    one_qubit_gates: int
    two_qubit_gates: int
    swap_gates: int
    shots: int
    optimizer_iterations: int
    circuit_evaluations: int


def estimate_resources(
    problem: QuboProblem,
    *,
    reps: int = 1,
    backend_name: str | None = None,
    shots: int = 1024,
    optimizer_iterations: int = 0,
    circuit_evaluations: int = 0,
) -> ResourceReport:
    """Build the QAOA ansatz and count what it costs, optionally after transpilation."""
    from qiskit import transpile
    from qiskit.circuit.library import QAOAAnsatz

    cost = to_sparse_pauli_op(problem)
    ansatz = QAOAAnsatz(cost_operator=cost, reps=reps)
    decomposed = ansatz.decompose(reps=3)

    operations = decomposed.count_ops()
    two_qubit = sum(
        count for gate, count in operations.items() if gate in {"cx", "cz", "ecr", "rzz"}
    )
    one_qubit = sum(
        count
        for gate, count in operations.items()
        if gate in {"rx", "ry", "rz", "h", "x", "sx", "u", "p"}
    )

    transpiled_depth, swaps = decomposed.depth(), 0
    if backend_name is not None:
        from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

        device = next(
            backend
            for backend in FakeProviderForBackendV2().backends()
            if backend.name == backend_name
        )
        compiled = transpile(ansatz, device, optimization_level=1, seed_transpiler=0)
        transpiled_depth = compiled.depth()
        swaps = compiled.count_ops().get("swap", 0)

    return ResourceReport(
        logical_qubits=problem.num_variables,
        hamiltonian_terms=len(cost),
        qubo_density=problem.density,
        circuit_depth=decomposed.depth(),
        transpiled_depth=transpiled_depth,
        one_qubit_gates=one_qubit,
        two_qubit_gates=two_qubit,
        swap_gates=swaps,
        shots=shots,
        optimizer_iterations=optimizer_iterations,
        circuit_evaluations=circuit_evaluations,
    )
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_qaoa.py -v`
Expected: PASS (10 tests). `test_qaoa_reported_energies_match_the_qubo` is the critical one — it catches the little-endian bitstring reversal, which is the single most common QAOA integration bug and silently optimises a permuted problem if wrong.

- [ ] **Step 6: Commit**

```bash
git add src/foldq/solvers/qaoa.py src/foldq/evaluation/resources.py tests/unit/test_qaoa.py
git commit -m "feat: add QAOA solver with CVaR, warm start, noise, and resource accounting

Runs on local Aer simulators with hardware-realistic noise from fake_provider,
requiring no account and no cost."
```

---

### Task 17: Noise study wiring and shot-based execution

**Files:**
- Modify: `src/foldq/solvers/qaoa.py` (already supports `noise_backend`; this task validates it)
- Test: `tests/integration/test_noise.py`

**Interfaces:**
- Consumes: `QAOASolver` (Task 16)
- Produces: no new API; verifies noisy and shot-based paths work end to end

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_noise.py
import pytest

from foldq.biology.stems import generate_maximal_stems
from foldq.classical.vienna import ViennaBackend
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.resources import estimate_resources
from foldq.solvers.base import SolverConfig
from foldq.solvers.qaoa import QAOASolver

pytest.importorskip("qiskit_aer")
pytest.importorskip("qiskit_ibm_runtime")

DEMO = "GGGAAAUCCCU"
NOISE_BACKEND = "fake_hanoi"


@pytest.fixture
def problem():
    return build_stem_qubo(DEMO, generate_maximal_stems(DEMO, min_stem_length=2), ViennaBackend())


def test_fake_backend_is_available_offline():
    from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

    names = {backend.name for backend in FakeProviderForBackendV2().backends()}
    assert NOISE_BACKEND in names


def test_noisy_qaoa_runs_and_reports_its_backend(problem):
    solver = QAOASolver(reps=1, maxiter=15, shots=256, noise_backend=NOISE_BACKEND)
    result = solver.solve(problem, SolverConfig(num_reads=256, seed=4))
    assert result.metadata["noise_backend"] == NOISE_BACKEND
    assert result.solver_name.startswith("qaoa_noisy")


def test_noisy_energies_are_still_valid_qubo_values(problem):
    """Noise degrades quality but must never corrupt the energy bookkeeping."""
    solver = QAOASolver(reps=1, maxiter=15, shots=256, noise_backend=NOISE_BACKEND)
    result = solver.solve(problem, SolverConfig(num_reads=256, seed=4))
    for sample in result.samples:
        assert sample.energy == pytest.approx(problem.energy(sample.bits), abs=1e-6)


def test_noise_does_not_improve_on_noiseless(problem):
    clean = QAOASolver(reps=1, maxiter=40, shots=512).solve(problem, SolverConfig(seed=9))
    noisy = QAOASolver(reps=1, maxiter=40, shots=512, noise_backend=NOISE_BACKEND).solve(
        problem, SolverConfig(seed=9)
    )
    assert noisy.best.energy >= clean.best.energy - 1e-6


def test_transpiled_depth_exceeds_ideal_depth_on_real_topology(problem):
    """Limited connectivity forces SWAPs; this is a headline resource finding."""
    ideal = estimate_resources(problem, reps=1)
    mapped = estimate_resources(problem, reps=1, backend_name=NOISE_BACKEND)
    assert mapped.transpiled_depth >= ideal.circuit_depth
```

- [ ] **Step 2: Run the tests**

Run: `.venv/bin/pytest tests/integration/test_noise.py -v`
Expected: PASS. If `fake_hanoi` is absent in the installed `qiskit-ibm-runtime`, list available names and substitute any 27-qubit backend, updating `NOISE_BACKEND` in one place.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/test_noise.py
git commit -m "test: verify noisy and shot-based QAOA paths against fake_provider"
```

---

## Phase 7 — Benchmark data

### Task 18: Synthetic generator and curated fixtures

The spec measured that uniformly random sequences below ~25 nt do not fold at all — MFE is exactly 0.00 with an empty structure. A benchmark built from them would score every solver at 100% against "predict nothing". The generator must therefore reject sequences that do not fold.

**Files:**
- Create: `src/foldq/data/__init__.py`, `src/foldq/data/generate.py`, `data/fixtures/curated.json`, `src/foldq/io/__init__.py`, `src/foldq/io/fixtures.py`
- Test: `tests/unit/test_generate.py`, `tests/scientific/test_fixtures.py`

**Interfaces:**
- Produces:
  - `generate_folding_sequence(length, *, rng, backend, min_energy_per_nt=-0.15, max_attempts=500) -> SequenceRecord`
  - `generate_benchmark_set(lengths, count_per_length, *, seed, backend, max_variables=None) -> list[SequenceRecord]`
  - `plant_hairpin(length, stem_length, loop_length, *, rng) -> str`
  - `load_curated(path="data/fixtures/curated.json") -> list[CuratedRecord]`
  - `CuratedRecord(sequence_id, sequence, known_structure, has_pseudoknot, source, license, notes)`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_generate.py
import random

import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.data.generate import (
    generate_benchmark_set,
    generate_folding_sequence,
    plant_hairpin,
)


@pytest.fixture
def backend():
    return ViennaBackend()


def test_planted_hairpin_is_self_complementary():
    seq = plant_hairpin(length=20, stem_length=5, loop_length=4, rng=random.Random(1))
    assert len(seq) == 20
    complement = {"A": "U", "U": "A", "G": "C", "C": "G"}
    for offset in range(5):
        assert seq[offset] == complement[seq[9 - offset]]


def test_planted_hairpin_actually_folds(backend):
    seq = plant_hairpin(length=24, stem_length=6, loop_length=4, rng=random.Random(2))
    assert backend.fold(seq).mfe_energy < -3.0


def test_generated_sequence_always_folds(backend):
    """The landmine guard: never emit a sequence whose MFE structure is empty."""
    for length in (20, 25, 30, 40):
        record = generate_folding_sequence(length, rng=random.Random(3), backend=backend)
        reference = backend.fold(record.sequence)
        assert reference.mfe_energy < 0.0
        assert "(" in reference.mfe_structure


def test_generated_sequence_respects_length_and_alphabet(backend):
    record = generate_folding_sequence(30, rng=random.Random(4), backend=backend)
    assert record.length == 30
    assert set(record.sequence) <= set("AUCG")


def test_generation_is_seed_reproducible(backend):
    a = generate_folding_sequence(25, rng=random.Random(5), backend=backend)
    b = generate_folding_sequence(25, rng=random.Random(5), backend=backend)
    assert a.sequence == b.sequence


def test_benchmark_set_has_unique_ids_and_requested_shape(backend):
    records = generate_benchmark_set([20, 30], count_per_length=3, seed=42, backend=backend)
    assert len(records) == 6
    assert len({r.sequence_id for r in records}) == 6
    assert sorted({r.length for r in records}) == [20, 30]


def test_benchmark_set_can_cap_variable_count(backend):
    """Tier boundaries are enforced by variable count, not nucleotide length."""
    from foldq.biology.stems import generate_maximal_stems

    records = generate_benchmark_set(
        [30, 40], count_per_length=2, seed=7, backend=backend, max_variables=22
    )
    for record in records:
        assert len(generate_maximal_stems(record.sequence)) <= 22
```

- [ ] **Step 2: Write the curated fixture test**

```python
# tests/scientific/test_fixtures.py
import pytest

from foldq.classical.vienna import ViennaBackend
from foldq.io.fixtures import load_curated


def test_curated_set_loads_and_is_non_empty():
    assert len(load_curated()) >= 4


def test_every_curated_record_carries_provenance():
    for record in load_curated():
        assert record.source and record.license
        assert set(record.sequence) <= set("AUCG")
        assert len(record.known_structure) == len(record.sequence)


def test_curated_set_contains_pseudoknots():
    """Tier P has no exact ground truth, so published PK structures are essential."""
    assert any(record.has_pseudoknot for record in load_curated())


def test_pseudoknot_structures_use_second_bracket_pair():
    for record in load_curated():
        if record.has_pseudoknot:
            assert "[" in record.known_structure and "]" in record.known_structure


def test_viennarna_cannot_reproduce_the_pseudoknots():
    """The core claim of Tier P, asserted as a test rather than a slogan."""
    backend = ViennaBackend()
    for record in load_curated():
        if not record.has_pseudoknot:
            continue
        predicted = backend.fold(record.sequence).mfe_structure
        assert "[" not in predicted, "dot-bracket output cannot express crossing pairs"
```

- [ ] **Step 3: Run both to verify they fail**

Run: `.venv/bin/pytest tests/unit/test_generate.py tests/scientific/test_fixtures.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.data'`

- [ ] **Step 4: Write `src/foldq/data/generate.py`**

```python
"""Benchmark sequence generation.

Uniformly random sequences below roughly 25 nt fold to nothing, which would make
every solver score perfectly against an empty reference. Every generator here
rejects sequences that do not fold.
"""

from __future__ import annotations

import random

from foldq.classical.vienna import ViennaBackend
from foldq.schemas.sequence import SequenceRecord

COMPLEMENT = {"A": "U", "U": "A", "G": "C", "C": "G"}


def plant_hairpin(length: int, stem_length: int, loop_length: int, *, rng: random.Random) -> str:
    """Build a sequence containing a guaranteed hairpin at its 5' end."""
    if 2 * stem_length + loop_length > length:
        raise ValueError("planted hairpin does not fit in the requested length")
    five_prime = [rng.choice("GC") for _ in range(stem_length)]
    loop = [rng.choice("A") for _ in range(loop_length)]
    three_prime = [COMPLEMENT[base] for base in reversed(five_prime)]
    tail = [rng.choice("AUCG") for _ in range(length - 2 * stem_length - loop_length)]
    return "".join(five_prime + loop + three_prime + tail)


def generate_folding_sequence(
    length: int,
    *,
    rng: random.Random,
    backend: ViennaBackend,
    min_energy_per_nt: float = -0.15,
    max_attempts: int = 500,
) -> SequenceRecord:
    """Rejection-sample until the sequence folds into a real structure."""
    threshold = min_energy_per_nt * length
    for _ in range(max_attempts):
        candidate = "".join(rng.choice("AUCG") for _ in range(length))
        if backend.fold(candidate).mfe_energy <= threshold:
            return SequenceRecord(
                sequence_id=f"syn_{length}_{rng.randint(0, 10**9)}",
                sequence=candidate,
                source_type="synthetic",
            )

    # Fall back to a planted hairpin, which folds by construction.
    stem_length = max(3, min(6, (length - 4) // 2))
    planted = plant_hairpin(length, stem_length, 4, rng=rng)
    return SequenceRecord(
        sequence_id=f"syn_planted_{length}_{rng.randint(0, 10**9)}",
        sequence=planted,
        source_type="synthetic",
        tags=("planted_hairpin",),
    )


def generate_benchmark_set(
    lengths: list[int],
    count_per_length: int,
    *,
    seed: int,
    backend: ViennaBackend,
    max_variables: int | None = None,
) -> list[SequenceRecord]:
    """Generate a reproducible benchmark set, optionally capped by variable count."""
    from foldq.biology.stems import generate_maximal_stems

    rng = random.Random(seed)
    records: list[SequenceRecord] = []

    for length in lengths:
        accepted = 0
        attempts = 0
        while accepted < count_per_length and attempts < count_per_length * 200:
            attempts += 1
            record = generate_folding_sequence(length, rng=rng, backend=backend)
            if max_variables is not None:
                if len(generate_maximal_stems(record.sequence)) > max_variables:
                    continue
            records.append(
                SequenceRecord(
                    sequence_id=f"syn_{length}_{accepted:03d}",
                    sequence=record.sequence,
                    source_type="synthetic",
                    random_seed=seed,
                    tags=record.tags,
                )
            )
            accepted += 1

    return records
```

- [ ] **Step 5: Write `data/fixtures/curated.json`**

Sequences below are published, widely redistributed benchmark RNAs. Pseudoknots use the standard second bracket pair `[` `]` for crossing pairs.

```json
{
  "records": [
    {
      "sequence_id": "hairpin_gc_synthetic",
      "sequence": "GGGCGCAAAAGCGCCC",
      "known_structure": "((((((....))))))",
      "has_pseudoknot": false,
      "source": "Constructed control (perfect GC hairpin)",
      "license": "CC0",
      "notes": "Trivially foldable control; every gate should pass on this."
    },
    {
      "sequence_id": "trna_phe_yeast_acceptor",
      "sequence": "GCGGAUUUAGCUCAGUUGGGAGAGCGCCAGACUGAAGAUCUGGAGGUCCUGUGUUCGAUCCACAGAAUUCGCACCA",
      "known_structure": "(((((((..((((........)))).(((((.......))))).....(((((.......))))))))))))....",
      "has_pseudoknot": false,
      "source": "Yeast tRNA-Phe, canonical cloverleaf (RNA STRAND / PDB 1EHZ)",
      "license": "Public domain sequence data",
      "notes": "Classic 76-nt benchmark. Tier S; too large for exact gates."
    },
    {
      "sequence_id": "srv1_frameshift_pseudoknot",
      "sequence": "GGCGCAGUGGGCUAGCGCCACUCAAAAGGCCCAU",
      "known_structure": "(((((((....[[[[[)))))))....]]]]]..",
      "has_pseudoknot": true,
      "source": "SRV-1 retroviral frameshifting pseudoknot (PseudoBase)",
      "license": "Public domain sequence data",
      "notes": "Tier P. ViennaRNA cannot express the crossing pairs at all."
    },
    {
      "sequence_id": "hdv_ribozyme_core_pseudoknot",
      "sequence": "GGCCGGCAUGGUCCCAGCCUCCUCGCUGGCGCCGGCUGGGCAACAUUCCGAGGGGACCGUCCCCUCGGUAAUGGCGAAUGGGACCCA",
      "known_structure": "((((((((((.[[[[[[.))))))))))........(((((((....)))))))......]]]]]]...................",
      "has_pseudoknot": true,
      "source": "Hepatitis delta virus ribozyme, nested double pseudoknot (PseudoBase / PDB 1DRZ)",
      "license": "Public domain sequence data",
      "notes": "Tier P. Reference structure from published crystallography, not from folding software."
    }
  ]
}
```

- [ ] **Step 6: Write `src/foldq/io/fixtures.py`**

```python
"""Load vendored, provenance-tracked benchmark sequences.

Fixtures are vendored rather than fetched at runtime so offline reproduction and
CI both work, and so the data manifest is stable across runs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

DEFAULT_FIXTURE_PATH = Path("data/fixtures/curated.json")


@dataclass(frozen=True)
class CuratedRecord:
    """A published RNA with a structure established independently of our pipeline."""

    sequence_id: str
    sequence: str
    known_structure: str
    has_pseudoknot: bool
    source: str
    license: str
    notes: str = ""

    def __post_init__(self) -> None:
        if len(self.sequence) != len(self.known_structure):
            raise ValueError(
                f"{self.sequence_id}: structure length {len(self.known_structure)} "
                f"!= sequence length {len(self.sequence)}"
            )


def load_curated(path: str | Path = DEFAULT_FIXTURE_PATH) -> list[CuratedRecord]:
    """Read the curated fixture set."""
    payload = json.loads(Path(path).read_text())
    return [CuratedRecord(**record) for record in payload["records"]]
```

- [ ] **Step 7: Create the package inits**

```python
# src/foldq/data/__init__.py
"""Benchmark data generation and fixtures."""
```

```python
# src/foldq/io/__init__.py
"""Input and output: fixtures, manifests, tabular exchange."""
```

- [ ] **Step 8: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_generate.py tests/scientific/test_fixtures.py -v`
Expected: PASS. If a curated structure fails its length check, fix the fixture JSON — do not relax the validation.

- [ ] **Step 9: Commit**

```bash
git add src/foldq/data src/foldq/io data/fixtures tests/unit/test_generate.py tests/scientific/test_fixtures.py
git commit -m "feat: add folding-guaranteed sequence generator and curated fixtures

Rejection-sampling prevents the empty-structure benchmark trap. Curated set
includes published pseudoknots that ViennaRNA structurally cannot express."
```

---

## Phase 8 — Pipeline, configuration, and CLI

### Task 19: Pipeline orchestration, config, and CLI

**Files:**
- Create: `src/foldq/config.py`, `src/foldq/pipeline.py`, `src/foldq/cli.py`, `configs/base.yaml`
- Test: `tests/integration/test_pipeline.py`

**Interfaces:**
- Consumes: everything from Tasks 2–18
- Produces:
  - `FoldQConfig` with `.from_yaml(path)`, `.merged_with(**overrides)`
  - `SOLVER_REGISTRY: dict[str, Callable[[], FoldSolver]]`
  - `FoldQPipeline(config)` with `.predict(record, *, encoding="stem", solver="simulated_annealing") -> PipelineResult`
  - `PipelineResult(record, reference, problem, solver_result, best_candidate, gates, resources, runtime)`
  - CLI commands: `foldq doctor`, `foldq validate`, `foldq predict`, `foldq generate`, `foldq benchmark`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/integration/test_pipeline.py
import pytest
from typer.testing import CliRunner

from foldq.cli import app
from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

DEMO = "GGGAAAUCCCU"
runner = CliRunner()


@pytest.fixture
def record():
    return SequenceRecord(sequence_id="demo", sequence=DEMO, source_type="synthetic")


def test_registry_exposes_every_planned_solver():
    for name in (
        "exact", "random", "greedy", "local_search",
        "simulated_annealing", "tabu", "path_integral_sqa",
    ):
        assert name in SOLVER_REGISTRY


def test_pipeline_runs_end_to_end(record):
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="simulated_annealing")
    assert result.reference.mfe_structure == "(((....)))."
    assert len(result.best_candidate.dot_bracket) == len(DEMO)
    assert result.gates.representable is True
    assert result.runtime_seconds > 0.0


def test_pipeline_recovers_the_mfe_on_the_demo_sequence(record):
    """The headline sanity check: on a trivially foldable sequence, get the MFE."""
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="exact")
    assert result.best_candidate.dot_bracket == result.reference.mfe_structure
    assert result.gates.base_pair_f1 == 1.0


def test_pipeline_populates_gates_b_and_c_when_exact_is_reachable(record):
    result = FoldQPipeline(FoldQConfig()).predict(record, solver="simulated_annealing")
    assert result.gates.is_qubo_ground_state is not None
    assert result.gates.solver_found_ground_state is not None


def test_pipeline_is_seed_reproducible(record):
    config = FoldQConfig(seed=99)
    first = FoldQPipeline(config).predict(record, solver="simulated_annealing")
    second = FoldQPipeline(config).predict(record, solver="simulated_annealing")
    assert first.best_candidate.dot_bracket == second.best_candidate.dot_bracket


def test_pseudoknot_mode_changes_the_problem(record):
    strict = FoldQPipeline(FoldQConfig(forbid_crossing=True)).predict(record, solver="exact")
    relaxed = FoldQPipeline(FoldQConfig(forbid_crossing=False)).predict(record, solver="exact")
    assert len(relaxed.problem.quadratic) <= len(strict.problem.quadratic)


def test_cli_doctor_reports_the_environment():
    result = runner.invoke(app, ["doctor"])
    assert result.exit_code == 0
    assert "ViennaRNA" in result.stdout


def test_cli_validate_accepts_and_rejects():
    assert runner.invoke(app, ["validate", "--sequence", DEMO]).exit_code == 0
    assert runner.invoke(app, ["validate", "--sequence", "GGXAU"]).exit_code != 0


def test_cli_predict_writes_expected_artifacts(tmp_path):
    result = runner.invoke(
        app,
        ["predict", "--sequence", DEMO, "--solver", "exact", "--output", str(tmp_path)],
    )
    assert result.exit_code == 0
    for name in ("manifest.json", "summary.md"):
        assert (tmp_path / name).exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/integration/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.config'`

- [ ] **Step 3: Write `src/foldq/config.py`**

```python
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


@dataclass(frozen=True)
class FoldQConfig:
    """Every knob that affects a run."""

    seed: int = 42
    temperature_celsius: float = DEFAULT_TEMPERATURE_C
    allow_wobble: bool = True
    min_hairpin: int = DEFAULT_MIN_HAIRPIN
    min_stem_length: int = DEFAULT_MIN_STEM_LENGTH
    expand_substems: bool = False
    energy_model: str = "charge_refund"
    nesting_policy: str = "all_nestable"
    forbid_crossing: bool = True
    overlap_penalty: float | None = None
    crossing_penalty: float | None = None
    num_reads: int = 200
    repair_invalid: bool = True
    exact_max_variables: int = 22
    no_lonely_pairs: bool = False

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
```

- [ ] **Step 4: Write `src/foldq/pipeline.py`**

```python
"""End-to-end orchestration: sequence in, gated result out."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

from foldq.biology.stems import expand_substems, generate_maximal_stems
from foldq.classical.vienna import ViennaBackend, ViennaReference
from foldq.config import FoldQConfig
from foldq.decoding.decode import decode_sample
from foldq.encodings.stem_encoding import build_stem_qubo
from foldq.evaluation.gates import evaluate_gates
from foldq.schemas.gates import GateReport
from foldq.schemas.qubo import PenaltyConfig, QuboProblem
from foldq.schemas.result import FoldCandidate, SolverResult
from foldq.schemas.sequence import SequenceRecord
from foldq.solvers.annealing import PathIntegralSolver, SimulatedAnnealingSolver, TabuSolver
from foldq.solvers.base import FoldSolver, SolverConfig
from foldq.solvers.baselines import GreedySolver, LocalSearchSolver, RandomSolver
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge

SOLVER_REGISTRY: dict[str, Callable[[], FoldSolver]] = {
    "exact": ExactSolver,
    "random": RandomSolver,
    "greedy": GreedySolver,
    "local_search": LocalSearchSolver,
    "simulated_annealing": SimulatedAnnealingSolver,
    "tabu": TabuSolver,
    "path_integral_sqa": PathIntegralSolver,
}


def _register_quantum_solvers() -> None:
    """QAOA needs the optional quantum extra; register it only if importable."""
    try:
        from foldq.solvers.qaoa import QAOASolver
    except ImportError:
        return
    SOLVER_REGISTRY["qaoa"] = QAOASolver
    SOLVER_REGISTRY["cvar_qaoa"] = lambda: QAOASolver(objective="cvar")


_register_quantum_solvers()


@dataclass(frozen=True)
class PipelineResult:
    """Everything one prediction produced."""

    record: SequenceRecord
    reference: ViennaReference
    problem: QuboProblem
    solver_result: SolverResult
    best_candidate: FoldCandidate
    gates: GateReport
    runtime_seconds: float
    metadata: dict[str, Any]


class FoldQPipeline:
    """Wires the stages together without letting any solver take a shortcut."""

    def __init__(self, config: FoldQConfig | None = None) -> None:
        self.config = config or FoldQConfig()
        self.backend = ViennaBackend(
            temperature_celsius=self.config.temperature_celsius,
            no_lonely_pairs=self.config.no_lonely_pairs,
        )

    def build_problem(self, sequence: str) -> QuboProblem:
        stems = generate_maximal_stems(
            sequence,
            min_stem_length=self.config.min_stem_length,
            min_hairpin=self.config.min_hairpin,
            allow_wobble=self.config.allow_wobble,
        )
        if self.config.expand_substems:
            stems = expand_substems(
                stems,
                min_stem_length=self.config.min_stem_length,
                min_hairpin=self.config.min_hairpin,
            )
        return build_stem_qubo(
            sequence,
            stems,
            self.backend,
            penalties=PenaltyConfig(
                overlap=self.config.overlap_penalty,
                crossing=self.config.crossing_penalty,
                forbid_crossing=self.config.forbid_crossing,
            ),
            energy_model=self.config.energy_model,
            nesting_policy=self.config.nesting_policy,
        )

    def predict(
        self,
        record: SequenceRecord,
        *,
        encoding: str = "stem",
        solver: str = "simulated_annealing",
    ) -> PipelineResult:
        if encoding != "stem":
            raise ValueError(f"unsupported encoding {encoding!r}; only 'stem' is implemented")
        if solver not in SOLVER_REGISTRY:
            raise ValueError(
                f"unknown solver {solver!r}; available: {sorted(SOLVER_REGISTRY)}"
            )

        start = time.perf_counter()
        reference = self.backend.fold(record.sequence)
        problem = self.build_problem(record.sequence)

        solver_config = SolverConfig(num_reads=self.config.num_reads, seed=self.config.seed)
        solver_result = SOLVER_REGISTRY[solver]().solve(problem, solver_config)

        # Exact ground truth for Gates B and C, when the instance is small enough.
        exact_result: SolverResult | None
        try:
            exact_result = ExactSolver(
                max_variables=self.config.exact_max_variables
            ).solve(problem, solver_config)
        except ExactSolverTooLarge:
            exact_result = None

        candidate = decode_sample(
            solver_result.best,
            problem,
            self.backend,
            repair=self.config.repair_invalid,
            forbid_crossing=self.config.forbid_crossing,
        )
        gates = evaluate_gates(problem, reference, solver_result, candidate, exact_result)

        return PipelineResult(
            record=record,
            reference=reference,
            problem=problem,
            solver_result=solver_result,
            best_candidate=candidate,
            gates=gates,
            runtime_seconds=time.perf_counter() - start,
            metadata={
                "solver": solver,
                "encoding": encoding,
                "config": self.config.as_dict(),
                "num_variables": problem.num_variables,
                "qubo_density": problem.density,
                "exact_available": exact_result is not None,
            },
        )
```

- [ ] **Step 5: Write `src/foldq/cli.py`**

```python
"""Command-line interface."""

from __future__ import annotations

import json
import platform
import sys
from pathlib import Path

import typer

from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

app = typer.Typer(help="Decidion FoldQ: hybrid quantum-classical RNA structure prediction.")


@app.command()
def doctor() -> None:
    """Check that the environment can run every part of the pipeline."""
    typer.echo(f"Python           {platform.python_version()}")
    for label, module in (
        ("ViennaRNA", "RNA"),
        ("dimod", "dimod"),
        ("dwave-samplers", "dwave.samplers"),
        ("networkx", "networkx"),
        ("Qiskit", "qiskit"),
        ("qiskit-aer", "qiskit_aer"),
    ):
        try:
            __import__(module)
            typer.echo(f"{label:16s} ok")
        except ImportError:
            typer.echo(f"{label:16s} MISSING")
    typer.echo(f"solvers          {', '.join(sorted(SOLVER_REGISTRY))}")


@app.command()
def validate(sequence: str = typer.Option(..., "--sequence")) -> None:
    """Validate an RNA sequence."""
    try:
        record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    except ValueError as error:
        typer.echo(f"invalid: {error}")
        raise typer.Exit(code=1) from error
    typer.echo(f"valid: {record.length} nt, GC {record.gc_content:.1%}, {record.checksum}")


@app.command()
def predict(
    sequence: str = typer.Option(..., "--sequence"),
    solver: str = typer.Option("simulated_annealing", "--solver"),
    config_path: Path | None = typer.Option(None, "--config"),
    output: Path = typer.Option(Path("results/demo"), "--output"),
    seed: int | None = typer.Option(None, "--seed"),
    pseudoknots: bool = typer.Option(False, "--pseudoknots"),
) -> None:
    """Predict a structure and write the run artifacts."""
    config = FoldQConfig.from_yaml(config_path) if config_path else FoldQConfig()
    config = config.merged_with(
        seed=seed, forbid_crossing=False if pseudoknots else None
    )

    record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    result = FoldQPipeline(config).predict(record, solver=solver)

    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "sequence": record.sequence,
        "sequence_checksum": record.checksum,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "config": config.as_dict(),
        "solver": solver,
        "num_variables": result.problem.num_variables,
        "qubo_density": result.problem.density,
        "reference_structure": result.reference.mfe_structure,
        "reference_energy": result.reference.mfe_energy,
        "predicted_structure": result.best_candidate.dot_bracket,
        "predicted_energy": result.best_candidate.vienna_energy,
        "gates": {
            "representable": result.gates.representable,
            "representable_fraction": result.gates.representable_fraction,
            "is_qubo_ground_state": result.gates.is_qubo_ground_state,
            "solver_found_ground_state": result.gates.solver_found_ground_state,
            "energy_gap": result.gates.energy_gap,
            "base_pair_f1": result.gates.base_pair_f1,
            "attribution": result.gates.attribution,
        },
        "runtime_seconds": result.runtime_seconds,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))

    summary = "\n".join(
        [
            f"# FoldQ prediction: {record.sequence_id}",
            "",
            f"Sequence      {record.sequence}",
            f"ViennaRNA MFE {result.reference.mfe_structure}  {result.reference.mfe_energy:.2f} kcal/mol",
            f"FoldQ         {result.best_candidate.dot_bracket}  {result.best_candidate.vienna_energy:.2f} kcal/mol",
            "",
            f"Solver        {solver} ({result.problem.num_variables} variables, "
            f"density {result.problem.density:.2f})",
            f"Base-pair F1  {result.gates.base_pair_f1:.3f}",
            f"Energy gap    {result.gates.energy_gap:.2f} kcal/mol",
            f"Attribution   {result.gates.attribution}",
        ]
    )
    (output / "summary.md").write_text(summary + "\n")
    typer.echo(summary)


@app.command()
def generate(
    count: int = typer.Option(10, "--count"),
    lengths: str = typer.Option("20,30", "--lengths"),
    seed: int = typer.Option(42, "--seed"),
    output: Path = typer.Option(Path("data/raw/synthetic/set.csv"), "--output"),
) -> None:
    """Generate a benchmark set of sequences that actually fold."""
    import csv

    from foldq.classical.vienna import ViennaBackend
    from foldq.data.generate import generate_benchmark_set

    parsed = [int(value) for value in lengths.split(",")]
    records = generate_benchmark_set(parsed, count, seed=seed, backend=ViennaBackend())

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["sequence_id", "sequence", "length", "gc_content"])
        for record in records:
            writer.writerow(
                [record.sequence_id, record.sequence, record.length, f"{record.gc_content:.3f}"]
            )
    typer.echo(f"wrote {len(records)} sequences to {output}")


@app.command()
def benchmark(
    dataset: Path = typer.Option(..., "--dataset"),
    solvers: str = typer.Option("greedy,simulated_annealing", "--solvers"),
    output: Path = typer.Option(Path("results/benchmark"), "--output"),
) -> None:
    """Run several solvers over a dataset and write a comparison table."""
    import csv

    names = [name.strip() for name in solvers.split(",")]
    pipeline = FoldQPipeline(FoldQConfig())

    rows = []
    with dataset.open() as handle:
        for entry in csv.DictReader(handle):
            record = SequenceRecord(
                sequence_id=entry["sequence_id"],
                sequence=entry["sequence"],
                source_type="synthetic",
            )
            for name in names:
                result = pipeline.predict(record, solver=name)
                rows.append(
                    {
                        "sequence_id": record.sequence_id,
                        "length": record.length,
                        "solver": name,
                        "num_variables": result.problem.num_variables,
                        "base_pair_f1": f"{result.gates.base_pair_f1:.4f}",
                        "energy_gap": f"{result.gates.energy_gap:.4f}",
                        "attribution": result.gates.attribution,
                        "runtime_seconds": f"{result.runtime_seconds:.4f}",
                    }
                )

    output.mkdir(parents=True, exist_ok=True)
    target = output / "benchmark.csv"
    with target.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    typer.echo(f"wrote {len(rows)} rows to {target}")


if __name__ == "__main__":
    sys.exit(app())
```

- [ ] **Step 6: Write `configs/base.yaml`**

```yaml
seed: 42
temperature_celsius: 37.0
allow_wobble: true
min_hairpin: 3
min_stem_length: 2
expand_substems: false
energy_model: charge_refund
nesting_policy: all_nestable
forbid_crossing: true
num_reads: 200
repair_invalid: true
exact_max_variables: 22
no_lonely_pairs: false
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest tests/integration/test_pipeline.py -v`
Expected: PASS (9 tests)

- [ ] **Step 8: Run the full suite and the CLI by hand**

```bash
.venv/bin/pytest tests -q
.venv/bin/foldq doctor
.venv/bin/foldq predict --sequence GGGAAAUCCCU --solver exact --output results/demo
```

Expected: all tests pass; `predict` prints a summary whose attribution line reads `no failure: all gates passed`.

- [ ] **Step 9: Commit**

```bash
git add src/foldq/config.py src/foldq/pipeline.py src/foldq/cli.py configs tests/integration/test_pipeline.py
git commit -m "feat: add pipeline orchestration, YAML config, and CLI"
```

---

## Phase 9 — Experiments and reporting

### Task 20: Experiment runners E1-E3

**Files:**
- Create: `src/foldq/experiments/__init__.py`, `src/foldq/experiments/e1_formulation.py`, `src/foldq/experiments/e2_encoding.py`, `src/foldq/experiments/e3_solvers.py`
- Test: `tests/integration/test_experiments.py`

**Interfaces:**
- Consumes: `FoldQPipeline`, `generate_benchmark_set`, `estimate_resources`
- Produces: each module exposes `run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pandas.DataFrame`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_experiments.py
import pandas as pd
import pytest

from foldq.experiments import e1_formulation, e2_encoding, e3_solvers


@pytest.mark.parametrize("module", [e1_formulation, e2_encoding, e3_solvers])
def test_experiment_runs_and_writes_a_table(module, tmp_path):
    frame = module.run(tmp_path, seed=1, quick=True)
    assert isinstance(frame, pd.DataFrame)
    assert not frame.empty
    assert (tmp_path / f"{module.NAME}.csv").exists()


def test_e1_reports_both_energy_models(tmp_path):
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    assert set(frame["energy_model"].unique()) >= {"stacking_only", "charge_refund"}


def test_e1_records_gate_a_and_b(tmp_path):
    frame = e1_formulation.run(tmp_path, seed=1, quick=True)
    for column in ("representable", "representable_fraction", "is_qubo_ground_state"):
        assert column in frame.columns


def test_e2_compares_pair_maximal_and_substems(tmp_path):
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    assert set(frame["stem_mode"].unique()) == {"pair", "maximal", "substems"}
    assert set(frame["encoding"].unique()) == {"pair", "stem"}
    assert "num_variables" in frame.columns and "qubo_density" in frame.columns


def test_e2_substems_produce_more_variables_than_maximal(tmp_path):
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    grouped = frame.groupby("stem_mode")["num_variables"].mean()
    assert grouped["substems"] >= grouped["maximal"]


def test_e2_quantifies_the_rq2_compression_claim(tmp_path):
    """RQ2: stem encoding must use fewer variables than pair encoding."""
    frame = e2_encoding.run(tmp_path, seed=1, quick=True)
    grouped = frame.groupby("encoding")["num_variables"].mean()
    assert grouped["stem"] < grouped["pair"]


def test_e3_covers_every_registered_classical_solver(tmp_path):
    frame = e3_solvers.run(tmp_path, seed=1, quick=True)
    assert {"random", "greedy", "simulated_annealing", "tabu"} <= set(frame["solver"].unique())


def test_e3_records_the_attribution_for_every_row(tmp_path):
    frame = e3_solvers.run(tmp_path, seed=1, quick=True)
    assert frame["attribution"].notna().all()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/integration/test_experiments.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.experiments'`

- [ ] **Step 3: Write `src/foldq/experiments/e1_formulation.py`**

```python
"""E1: formulation validation. Does the QUBO actually encode RNA folding?

Answers RQ1 and RQ4 by measuring Gates A and B across energy models, nesting
policies, and penalty scales on instances small enough to enumerate exactly.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.pipeline import FoldQPipeline

NAME = "e1_formulation"


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 25] if quick else [20, 25, 30, 35]
    per_length = 2 if quick else 6
    penalties = [None] if quick else [None, 5.0, 20.0]

    records = generate_benchmark_set(
        lengths, per_length, seed=seed, backend=backend, max_variables=18
    )

    rows = []
    for record in records:
        for energy_model in ("stacking_only", "charge_refund"):
            for nesting_policy in ("all_nestable", "immediate_only"):
                if energy_model == "stacking_only" and nesting_policy == "immediate_only":
                    continue  # nesting policy is irrelevant without refunds
                for penalty in penalties:
                    config = FoldQConfig(
                        seed=seed,
                        energy_model=energy_model,
                        nesting_policy=nesting_policy,
                        overlap_penalty=penalty,
                    )
                    result = FoldQPipeline(config).predict(record, solver="exact")
                    rows.append(
                        {
                            "sequence_id": record.sequence_id,
                            "length": record.length,
                            "energy_model": energy_model,
                            "nesting_policy": nesting_policy,
                            "overlap_penalty": penalty if penalty is not None else "adaptive",
                            "num_variables": result.problem.num_variables,
                            "qubo_density": result.problem.density,
                            "representable": result.gates.representable,
                            "representable_fraction": result.gates.representable_fraction,
                            "is_qubo_ground_state": result.gates.is_qubo_ground_state,
                            "base_pair_f1": result.gates.base_pair_f1,
                            "energy_gap": result.gates.energy_gap,
                            "attribution": result.gates.attribution,
                        }
                    )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
```

- [ ] **Step 4: Write `src/foldq/experiments/e2_encoding.py`**

```python
"""E2: encoding comparison and scaling.

Answers RQ2 and RQ5. Re-measures the length-to-variable mapping at the resolved
default of min_stem_length=2, which the spec flags as differing from its own
tables (measured at 3).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.pipeline import FoldQPipeline

NAME = "e2_encoding"


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 30] if quick else [20, 30, 40, 50, 60, 80, 100, 120]
    per_length = 1 if quick else 5

    records = generate_benchmark_set(lengths, per_length, seed=seed, backend=backend)

    rows = []
    for record in records:
        reference = backend.fold(record.sequence)

        from foldq.encodings.pair_encoding import build_pair_qubo
        from foldq.evaluation.gates import gate_a_representable

        def _row(encoding: str, stem_mode: str, min_stem_length: int | None, problem):
            representable, fraction = gate_a_representable(
                reference.base_pairs, list(problem.variable_map)
            )
            return {
                "sequence_id": record.sequence_id,
                "length": record.length,
                "encoding": encoding,
                "stem_mode": stem_mode,
                "min_stem_length": min_stem_length,
                "num_variables": problem.num_variables,
                "num_quadratic_terms": len(problem.quadratic),
                "qubo_density": problem.density,
                "representable": representable,
                "representable_fraction": fraction,
                "mfe_energy": reference.mfe_energy,
            }

        # Pair encoding: the RQ2 baseline the stem encoding must beat.
        rows.append(_row("pair", "pair", None, build_pair_qubo(record.sequence, backend)))

        for stem_mode in ("maximal", "substems"):
            for min_stem_length in ((2,) if quick else (2, 3)):
                config = FoldQConfig(
                    seed=seed,
                    min_stem_length=min_stem_length,
                    expand_substems=(stem_mode == "substems"),
                )
                problem = FoldQPipeline(config).build_problem(record.sequence)
                rows.append(_row("stem", stem_mode, min_stem_length, problem))

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
```

- [ ] **Step 5: Write `src/foldq/experiments/e3_solvers.py`**

```python
"""E3: solver comparison on identical QUBOs.

Answers RQ3. Every solver receives the same problem and the same decode path,
so differences are attributable to the optimizer alone.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline

NAME = "e3_solvers"
CLASSICAL = ("random", "greedy", "local_search", "simulated_annealing", "tabu", "path_integral_sqa")


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20, 25] if quick else [20, 25, 30, 40, 50]
    per_length = 1 if quick else 5
    seeds = [seed] if quick else [seed, seed + 1, seed + 2]

    records = generate_benchmark_set(
        lengths, per_length, seed=seed, backend=backend, max_variables=22
    )
    solvers = [name for name in CLASSICAL if name in SOLVER_REGISTRY]

    rows = []
    for record in records:
        for solver in solvers:
            for run_seed in seeds:
                config = FoldQConfig(seed=run_seed, num_reads=50 if quick else 500)
                result = FoldQPipeline(config).predict(record, solver=solver)
                rows.append(
                    {
                        "sequence_id": record.sequence_id,
                        "length": record.length,
                        "solver": solver,
                        "seed": run_seed,
                        "num_variables": result.problem.num_variables,
                        "qubo_energy": result.solver_result.best.energy,
                        "vienna_energy": result.best_candidate.vienna_energy,
                        "energy_gap": result.gates.energy_gap,
                        "base_pair_f1": result.gates.base_pair_f1,
                        "found_ground_state": result.gates.solver_found_ground_state,
                        "was_repaired": result.best_candidate.was_repaired,
                        "attribution": result.gates.attribution,
                        "runtime_seconds": result.runtime_seconds,
                    }
                )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
```

- [ ] **Step 6: Create `src/foldq/experiments/__init__.py`**

```python
"""Experiment runners E1-E5."""
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest tests/integration/test_experiments.py -v`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add src/foldq/experiments tests/integration/test_experiments.py
git commit -m "feat: add experiment runners E1 formulation, E2 encoding, E3 solvers"
```

---

### Task 21: Experiment runners E4 and E5

**Files:**
- Create: `src/foldq/experiments/e4_qaoa.py`, `src/foldq/experiments/e5_pseudoknot.py`, `src/foldq/experiments/run_all.py`
- Test: `tests/integration/test_experiments_quantum.py`

**Interfaces:**
- Produces: `e4_qaoa.run(...)`, `e5_pseudoknot.run(...)` with the same signature as Task 20; `run_all.main()` as the `make reproduce` entry point

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_experiments_quantum.py
import pandas as pd
import pytest

pytest.importorskip("qiskit_aer")

from foldq.experiments import e4_qaoa, e5_pseudoknot  # noqa: E402


def test_e4_runs_and_writes_a_table(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    assert isinstance(frame, pd.DataFrame) and not frame.empty
    assert (tmp_path / "e4_qaoa.csv").exists()


def test_e4_varies_depth_and_objective(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    assert frame["reps"].nunique() >= 2
    assert set(frame["objective"].unique()) >= {"expectation", "cvar"}


def test_e4_records_quantum_resources(tmp_path):
    frame = e4_qaoa.run(tmp_path, seed=1, quick=True)
    for column in ("logical_qubits", "two_qubit_gates", "circuit_depth", "hamiltonian_terms"):
        assert column in frame.columns


def test_e5_runs_on_curated_pseudoknots(tmp_path):
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    assert not frame.empty
    assert frame["has_pseudoknot"].any()


def test_e5_compares_crossing_modes(tmp_path):
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    assert set(frame["forbid_crossing"].unique()) == {True, False}


def test_e5_records_vienna_inability_on_pseudoknots(tmp_path):
    """The Tier P claim, captured as data rather than prose."""
    frame = e5_pseudoknot.run(tmp_path, seed=1, quick=True)
    pk_rows = frame[frame["has_pseudoknot"]]
    assert (pk_rows["vienna_recovers_crossing_pairs"] == False).all()  # noqa: E712
```

- [ ] **Step 2: Write `src/foldq/experiments/e4_qaoa.py`**

```python
"""E4: QAOA depth, CVaR, shots, and hardware-realistic noise.

Answers RQ5 and RQ6. Everything runs on local Aer simulators; the noise model
comes from qiskit-ibm-runtime's fake_provider, which needs no account.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.decoding.decode import decode_sample
from foldq.evaluation.gates import evaluate_gates
from foldq.evaluation.resources import estimate_resources
from foldq.pipeline import FoldQPipeline
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge
from foldq.solvers.qaoa import QAOASolver

NAME = "e4_qaoa"
NOISE_BACKEND = "fake_hanoi"


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20] if quick else [20, 25, 30]
    per_length = 1 if quick else 3
    depths = (1, 2) if quick else (1, 2, 3)
    shot_counts = (256,) if quick else (256, 1024, 4096)
    maxiter = 20 if quick else 200

    records = generate_benchmark_set(
        lengths, per_length, seed=seed, backend=backend, max_variables=14
    )

    rows = []
    for record in records:
        pipeline = FoldQPipeline(FoldQConfig(seed=seed))
        problem = pipeline.build_problem(record.sequence)
        reference = backend.fold(record.sequence)
        solver_config = SolverConfig(num_reads=shot_counts[0], seed=seed)

        try:
            exact = ExactSolver().solve(problem, solver_config)
        except ExactSolverTooLarge:
            exact = None

        variants = [
            {"reps": reps, "objective": "expectation", "shots": shots, "noise": None}
            for reps in depths
            for shots in shot_counts
        ]
        variants += [
            {"reps": depths[-1], "objective": "cvar", "shots": shot_counts[0], "noise": None}
        ]
        variants += [
            {
                "reps": depths[0],
                "objective": "expectation",
                "shots": shot_counts[0],
                "noise": NOISE_BACKEND,
            }
        ]

        for variant in variants:
            solver = QAOASolver(
                reps=variant["reps"],
                maxiter=maxiter,
                shots=variant["shots"],
                objective=variant["objective"],
                noise_backend=variant["noise"],
            )
            result = solver.solve(problem, solver_config)
            candidate = decode_sample(result.best, problem, backend)
            gates = evaluate_gates(problem, reference, result, candidate, exact)
            resources = estimate_resources(
                problem,
                reps=variant["reps"],
                shots=variant["shots"],
                optimizer_iterations=result.metadata["optimizer_iterations"],
                circuit_evaluations=result.metadata["circuit_evaluations"],
            )

            rows.append(
                {
                    "sequence_id": record.sequence_id,
                    "length": record.length,
                    "reps": variant["reps"],
                    "objective": variant["objective"],
                    "shots": variant["shots"],
                    "noise_backend": variant["noise"] or "none",
                    "logical_qubits": resources.logical_qubits,
                    "hamiltonian_terms": resources.hamiltonian_terms,
                    "qubo_density": resources.qubo_density,
                    "circuit_depth": resources.circuit_depth,
                    "two_qubit_gates": resources.two_qubit_gates,
                    "one_qubit_gates": resources.one_qubit_gates,
                    "optimizer_iterations": resources.optimizer_iterations,
                    "circuit_evaluations": resources.circuit_evaluations,
                    "best_qubo_energy": result.best.energy,
                    "found_ground_state": gates.solver_found_ground_state,
                    "base_pair_f1": gates.base_pair_f1,
                    "energy_gap": gates.energy_gap,
                    "runtime_seconds": result.runtime_seconds,
                }
            )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
```

- [ ] **Step 3: Write `src/foldq/experiments/e5_pseudoknot.py`**

```python
"""E5: pseudoknot reach.

The differentiator. Disabling the crossing penalty lets the formulation express
structures ViennaRNA cannot represent at all, validated against published
structures rather than against another algorithm's prediction.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.biology.dotbracket import stems_to_pairs
from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.decoding.decode import bits_to_stems
from foldq.evaluation.gates import gate_a_representable
from foldq.evaluation.metrics import base_pair_metrics
from foldq.io.fixtures import load_curated
from foldq.pipeline import FoldQPipeline
from foldq.schemas.sequence import SequenceRecord

NAME = "e5_pseudoknot"


def parse_extended_structure(structure: str) -> frozenset[tuple[int, int]]:
    """Parse dot-bracket that uses [ ] for a second, crossing pair layer."""
    pairs: set[tuple[int, int]] = set()
    for opener, closer in (("(", ")"), ("[", "]"), ("{", "}")):
        stack: list[int] = []
        for index, char in enumerate(structure):
            if char == opener:
                stack.append(index)
            elif char == closer:
                pairs.add((stack.pop(), index))
    return frozenset(pairs)


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    curated = load_curated()
    if quick:
        curated = [record for record in curated if len(record.sequence) <= 40]

    rows = []
    for entry in curated:
        record = SequenceRecord(
            sequence_id=entry.sequence_id, sequence=entry.sequence, source_type="curated"
        )
        known_pairs = parse_extended_structure(entry.known_structure)
        vienna = backend.fold(entry.sequence)

        # Can ViennaRNA recover any of the crossing pairs? Structurally, no.
        nested_only = parse_extended_structure(
            "".join(char if char in "().[]" else "." for char in entry.known_structure)
        )
        crossing_pairs = known_pairs - parse_extended_structure(
            entry.known_structure.replace("[", ".").replace("]", ".")
        )
        vienna_recovers = bool(crossing_pairs & vienna.base_pairs)

        for forbid_crossing in (True, False):
            config = FoldQConfig(
                seed=seed, forbid_crossing=forbid_crossing, num_reads=100 if quick else 1000
            )
            pipeline = FoldQPipeline(config)
            problem = pipeline.build_problem(record.sequence)
            representable, fraction = gate_a_representable(
                known_pairs, list(problem.variable_map)
            )
            result = pipeline.predict(record, solver="simulated_annealing")
            selected = bits_to_stems(result.solver_result.best.bits, problem)
            predicted_pairs = stems_to_pairs(selected)
            metrics = base_pair_metrics(predicted_pairs, known_pairs)

            rows.append(
                {
                    "sequence_id": entry.sequence_id,
                    "length": record.length,
                    "has_pseudoknot": entry.has_pseudoknot,
                    "source": entry.source,
                    "forbid_crossing": forbid_crossing,
                    "num_variables": problem.num_variables,
                    "qubo_density": problem.density,
                    "representable_against_published": representable,
                    "representable_fraction": fraction,
                    "base_pair_f1_vs_published": metrics.f1,
                    "base_pair_precision": metrics.precision,
                    "base_pair_recall": metrics.recall,
                    "vienna_structure": vienna.mfe_structure,
                    "vienna_energy": vienna.mfe_energy,
                    "vienna_recovers_crossing_pairs": vienna_recovers,
                    "num_crossing_pairs_in_reference": len(crossing_pairs),
                    "unused_nested_only_pairs": len(nested_only),
                }
            )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
```

- [ ] **Step 4: Write `src/foldq/experiments/run_all.py`**

```python
"""`make reproduce` entry point: run every experiment into one output directory."""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
from pathlib import Path

from foldq.experiments import (
    e1_formulation,
    e2_encoding,
    e3_solvers,
    e5_pseudoknot,
)

EXPERIMENTS = [e1_formulation, e2_encoding, e3_solvers, e5_pseudoknot]


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run every FoldQ experiment.")
    parser.add_argument("--output", type=Path, default=Path("results"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--quick", action="store_true", help="reduced sweep for CI")
    args = parser.parse_args()

    modules = list(EXPERIMENTS)
    try:
        from foldq.experiments import e4_qaoa

        modules.insert(3, e4_qaoa)
    except ImportError:
        print("qiskit not installed; skipping E4 (QAOA)")

    args.output.mkdir(parents=True, exist_ok=True)
    summary = {}
    for module in modules:
        print(f"running {module.NAME} ...")
        frame = module.run(args.output, seed=args.seed, quick=args.quick)
        summary[module.NAME] = {"rows": len(frame), "columns": list(frame.columns)}

    manifest = {
        "git_commit": _git_commit(),
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "seed": args.seed,
        "quick": args.quick,
        "experiments": summary,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"wrote results to {args.output}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest tests/integration/test_experiments_quantum.py -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full reproduction in quick mode**

```bash
.venv/bin/python -m foldq.experiments.run_all --quick --output results/quick
```

Expected: five CSVs plus `manifest.json`.

- [ ] **Step 7: Commit**

```bash
git add src/foldq/experiments tests/integration/test_experiments_quantum.py
git commit -m "feat: add E4 QAOA study and E5 pseudoknot reach experiments"
```

---

### Task 22: Decision cards, figures, and README rewrite

**Files:**
- Create: `src/foldq/reporting/__init__.py`, `src/foldq/reporting/decision_card.py`, `src/foldq/reporting/figures.py`, `src/foldq/reporting/templates/decision_card.html.j2`
- Modify: `README.md`, `src/foldq/cli.py` (add `report` command)
- Test: `tests/unit/test_reporting.py`

**Interfaces:**
- Consumes: `PipelineResult`, experiment DataFrames
- Produces:
  - `render_decision_card(result: PipelineResult, output: Path) -> Path`
  - `plot_variable_scaling(frame, output) -> Path`, `plot_solver_comparison(frame, output) -> Path`, `plot_resource_scaling(frame, output) -> Path`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_reporting.py
import pandas as pd
import pytest

from foldq.config import FoldQConfig
from foldq.pipeline import FoldQPipeline
from foldq.reporting.decision_card import render_decision_card
from foldq.reporting.figures import (
    plot_resource_scaling,
    plot_solver_comparison,
    plot_variable_scaling,
)
from foldq.schemas.sequence import SequenceRecord

DEMO = "GGGAAAUCCCU"


@pytest.fixture
def result():
    record = SequenceRecord(sequence_id="demo", sequence=DEMO, source_type="synthetic")
    return FoldQPipeline(FoldQConfig()).predict(record, solver="exact")


def test_decision_card_is_written_and_self_contained(result, tmp_path):
    path = render_decision_card(result, tmp_path / "card.html")
    assert path.exists()
    html = path.read_text()
    assert "<html" in html.lower()
    assert "http://" not in html and "https://" not in html


def test_decision_card_reports_every_required_field(result, tmp_path):
    html = render_decision_card(result, tmp_path / "card.html").read_text()
    for fragment in (
        DEMO,
        result.reference.mfe_structure,
        result.best_candidate.dot_bracket,
        result.gates.attribution,
    ):
        assert fragment in html


def test_decision_card_states_limitations(result, tmp_path):
    html = render_decision_card(result, tmp_path / "card.html").read_text()
    assert "Limitations" in html
    assert "advantage" not in html.lower() or "no quantum-advantage" in html.lower()


def test_figures_are_written(tmp_path):
    scaling = pd.DataFrame(
        {
            "length": [20, 30, 40, 50],
            "num_variables": [5, 14, 22, 41],
            "stem_mode": ["maximal"] * 4,
            "qubo_density": [0.8, 0.82, 0.77, 0.65],
        }
    )
    assert plot_variable_scaling(scaling, tmp_path / "scaling.png").exists()

    solvers = pd.DataFrame(
        {
            "solver": ["greedy", "greedy", "simulated_annealing", "simulated_annealing"],
            "base_pair_f1": [0.6, 0.7, 0.9, 0.95],
            "energy_gap": [2.0, 1.5, 0.2, 0.1],
        }
    )
    assert plot_solver_comparison(solvers, tmp_path / "solvers.png").exists()

    resources = pd.DataFrame(
        {
            "logical_qubits": [5, 8, 14],
            "two_qubit_gates": [20, 56, 182],
            "circuit_depth": [10, 22, 60],
            "reps": [1, 1, 1],
        }
    )
    assert plot_resource_scaling(resources, tmp_path / "resources.png").exists()
```

- [ ] **Step 2: Write `src/foldq/reporting/templates/decision_card.html.j2`**

```jinja
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>FoldQ decision card: {{ sequence_id }}</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
         max-width: 60rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #ddd; }
  .seq { letter-spacing: 0.15em; overflow-x: auto; white-space: pre; }
  .pass { color: #0a7d28; font-weight: bold; }
  .fail { color: #b3261e; font-weight: bold; }
  .na   { color: #777; }
  footer { margin-top: 2rem; font-size: 0.85rem; color: #555; }
</style>
</head>
<body>
<h1>FoldQ decision card</h1>
<h2>{{ sequence_id }}</h2>

<h3>Structures</h3>
<div class="seq">sequence   {{ sequence }}
ViennaRNA  {{ reference_structure }}   {{ "%.2f"|format(reference_energy) }} kcal/mol
FoldQ      {{ predicted_structure }}   {{ predicted_energy }}</div>

<h3>Diagnostic ladder</h3>
<table>
  <tr><th>Gate</th><th>Question</th><th>Result</th></tr>
  <tr><td>A</td><td>Is the reference structure representable?</td>
      <td class="{{ 'pass' if representable else 'fail' }}">
      {{ "yes" if representable else "no" }} ({{ "%.0f"|format(representable_fraction * 100) }}% of pairs)</td></tr>
  <tr><td>B</td><td>Is it the QUBO ground state?</td>
      <td class="{{ gate_b_class }}">{{ gate_b_text }}</td></tr>
  <tr><td>C</td><td>Did the solver find the ground state?</td>
      <td class="{{ gate_c_class }}">{{ gate_c_text }}</td></tr>
  <tr><td>D</td><td>Physical quality</td>
      <td>F1 {{ "%.3f"|format(base_pair_f1) }}, gap {{ "%.2f"|format(energy_gap) }} kcal/mol</td></tr>
</table>
<p><strong>Attribution:</strong> {{ attribution }}</p>

<h3>Selected helices</h3>
<table>
  <tr><th>#</th><th>5' start</th><th>3' end</th><th>pairs</th></tr>
  {% for stem in stems %}
  <tr><td>{{ loop.index }}</td><td>{{ stem.i }}</td><td>{{ stem.j }}</td><td>{{ stem.k }}</td></tr>
  {% endfor %}
</table>

<h3>Run</h3>
<table>
  <tr><td>Solver</td><td>{{ solver }}</td></tr>
  <tr><td>Logical variables</td><td>{{ num_variables }}</td></tr>
  <tr><td>QUBO density</td><td>{{ "%.3f"|format(qubo_density) }}</td></tr>
  <tr><td>Repairs applied</td><td>{{ repair_count }}</td></tr>
  <tr><td>Runtime</td><td>{{ "%.3f"|format(runtime_seconds) }} s</td></tr>
  <tr><td>Seed</td><td>{{ seed }}</td></tr>
</table>

<h3>Limitations</h3>
<ul>
  <li>The QUBO is a degree-2 surrogate for the Turner model; loop terms that depend
      on which other helices are selected are approximated, not exact.</li>
  <li>Gates B and C require exact enumeration and are indeterminate above
      {{ exact_max_variables }} variables.</li>
  <li>Candidate generation can exclude the true structure, which caps accuracy
      before any solver runs. Gate A reports that ceiling.</li>
  <li>This is a research prototype, not a clinical or therapeutic-design tool.</li>
  <li>No quantum-advantage claim is made or implied.</li>
</ul>

<footer>Decidion FoldQ &middot; WISER Summer Program 2026 Moderna Challenge</footer>
</body>
</html>
```

- [ ] **Step 3: Write `src/foldq/reporting/decision_card.py`**

```python
"""Render a self-contained, explainable folding decision card."""

from __future__ import annotations

import math
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = Path(__file__).parent / "templates"


def _tri_state(value: bool | None) -> tuple[str, str]:
    if value is None:
        return "na", "indeterminate (instance too large for exact ground truth)"
    return ("pass", "yes") if value else ("fail", "no")


def render_decision_card(result, output: Path) -> Path:
    """Write one HTML card describing a single prediction end to end."""
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = environment.get_template("decision_card.html.j2")

    gate_b_class, gate_b_text = _tri_state(result.gates.is_qubo_ground_state)
    gate_c_class, gate_c_text = _tri_state(result.gates.solver_found_ground_state)
    predicted_energy = result.best_candidate.vienna_energy
    energy_text = (
        "not scorable (crossing pairs)"
        if math.isnan(predicted_energy)
        else f"{predicted_energy:.2f} kcal/mol"
    )

    html = template.render(
        sequence_id=result.record.sequence_id,
        sequence=result.record.sequence,
        reference_structure=result.reference.mfe_structure,
        reference_energy=result.reference.mfe_energy,
        predicted_structure=result.best_candidate.dot_bracket,
        predicted_energy=energy_text,
        representable=result.gates.representable,
        representable_fraction=result.gates.representable_fraction,
        gate_b_class=gate_b_class,
        gate_b_text=gate_b_text,
        gate_c_class=gate_c_class,
        gate_c_text=gate_c_text,
        base_pair_f1=result.gates.base_pair_f1,
        energy_gap=result.gates.energy_gap,
        attribution=result.gates.attribution,
        stems=result.best_candidate.stems,
        solver=result.metadata["solver"],
        num_variables=result.problem.num_variables,
        qubo_density=result.problem.density,
        repair_count=len(result.best_candidate.repairs),
        runtime_seconds=result.runtime_seconds,
        seed=result.metadata["config"]["seed"],
        exact_max_variables=result.metadata["config"]["exact_max_variables"],
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    return output
```

- [ ] **Step 4: Write `src/foldq/reporting/figures.py`**

```python
"""Publication figures. Matplotlib only, no interactive dependencies."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def _save(figure, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output, dpi=150)
    plt.close(figure)
    return output


def plot_variable_scaling(frame, output: Path) -> Path:
    """Binary variables versus sequence length, split by encoding."""
    figure, axis = plt.subplots(figsize=(6, 4))
    for mode, group in frame.groupby("stem_mode"):
        aggregated = group.groupby("length")["num_variables"].mean()
        axis.plot(aggregated.index, aggregated.to_numpy(), marker="o", label=mode)
    axis.set_xlabel("sequence length (nt)")
    axis.set_ylabel("binary variables")
    axis.set_title("Encoding size versus sequence length")
    axis.legend()
    axis.grid(alpha=0.3)
    return _save(figure, output)


def plot_solver_comparison(frame, output: Path) -> Path:
    """Base-pair F1 and energy gap per solver."""
    figure, (left, right) = plt.subplots(1, 2, figsize=(10, 4))
    order = sorted(frame["solver"].unique())
    left.boxplot([frame[frame.solver == name]["base_pair_f1"] for name in order], labels=order)
    left.set_ylabel("base-pair F1")
    left.set_title("Structural accuracy")
    left.tick_params(axis="x", rotation=45)
    right.boxplot([frame[frame.solver == name]["energy_gap"] for name in order], labels=order)
    right.set_ylabel("energy gap (kcal/mol)")
    right.set_title("Thermodynamic gap from MFE")
    right.tick_params(axis="x", rotation=45)
    for axis in (left, right):
        axis.grid(alpha=0.3)
    return _save(figure, output)


def plot_resource_scaling(frame, output: Path) -> Path:
    """Two-qubit gates and circuit depth versus logical qubit count."""
    figure, axis = plt.subplots(figsize=(6, 4))
    aggregated = frame.groupby("logical_qubits")[["two_qubit_gates", "circuit_depth"]].mean()
    axis.plot(aggregated.index, aggregated["two_qubit_gates"], marker="o", label="two-qubit gates")
    axis.plot(aggregated.index, aggregated["circuit_depth"], marker="s", label="circuit depth")
    axis.set_xlabel("logical qubits")
    axis.set_ylabel("count")
    axis.set_yscale("log")
    axis.set_title("QAOA resource scaling")
    axis.legend()
    axis.grid(alpha=0.3)
    return _save(figure, output)
```

- [ ] **Step 5: Create `src/foldq/reporting/__init__.py`**

```python
"""Decision cards and publication figures."""
```

- [ ] **Step 6: Add the `report` command to `src/foldq/cli.py`**

Insert this command before the `if __name__ == "__main__":` block:

```python
@app.command()
def report(
    sequence: str = typer.Option(..., "--sequence"),
    solver: str = typer.Option("simulated_annealing", "--solver"),
    output: Path = typer.Option(Path("results/demo/decision-card.html"), "--output"),
) -> None:
    """Render an explainable decision card for one prediction."""
    from foldq.reporting.decision_card import render_decision_card

    record = SequenceRecord(sequence_id="cli", sequence=sequence, source_type="user")
    result = FoldQPipeline(FoldQConfig()).predict(record, solver=solver)
    path = render_decision_card(result, output)
    typer.echo(f"wrote decision card to {path}")
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest tests/unit/test_reporting.py -v`
Expected: PASS (4 tests)

- [ ] **Step 8: Rewrite `README.md`**

The existing README describes an aspirational architecture. Rewrite it to describe what exists, following this outline. Every claim must be backed by code that runs.

1. **Title and one-paragraph summary** — keep the existing framing.
2. **Status** — replace "Planned/Implemented" markers with what is actually true after this plan.
3. **The four-gate diagnostic ladder** — promote this to near the top; it is the contribution.
4. **Quick start** — the exact commands from Task 19 Step 8, verified to work.
5. **Results** — the measured tables from `results/`, generated by `make reproduce`.
6. **Pseudoknots** — move from "out of scope" to a headline section explaining that disabling the crossing penalty reaches structures ViennaRNA cannot express, with the E5 table.
7. **Scope and deferred work** — state explicitly what was deferred and why: manuscript, MkDocs site, Docker, extra CI workflows, notebooks, hardware execution, Optuna, hierarchical encoding, graph decomposition.
8. **Limitations** — keep the existing list; add that Gates B and C are capped near 22 variables, and that the degree-2 surrogate approximates loop terms.
9. **Reproducibility** — `make reproduce`, seeds, manifests, lockfile.
10. **Team, citation, license, references** — keep.

Remove the "Current reference versions at project planning time" section and replace it with the actual locked versions.

- [ ] **Step 9: Verify the whole suite and a clean reproduction**

```bash
.venv/bin/ruff check src tests
.venv/bin/pytest tests -q
.venv/bin/python -m foldq.experiments.run_all --quick --output results/quick
.venv/bin/foldq report --sequence GGGAAAUCCCU --output results/demo/decision-card.html
```

Expected: lint clean, all tests pass, results and a decision card written.

- [ ] **Step 10: Commit**

```bash
git add src/foldq/reporting README.md tests/unit/test_reporting.py src/foldq/cli.py
git commit -m "feat: add decision cards and figures, rewrite README to match reality"
```

---

## Deferred, and stated explicitly

Recorded here so the omissions are deliberate rather than forgotten: `manuscript.tex` and supplementary; MkDocs site; Docker; four of the five CI workflows; all seven notebooks; D-Wave and IBM hardware execution; Optuna penalty search; forgi, forna, Plotly, Quarto; hierarchical encoding; the graph-decomposition experiment (E9 in the original README).

If the schedule slips, Tiers V and Q with experiments E1 and E3 are the minimum viable submission. E4 and E5 are the upside.
