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
