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
