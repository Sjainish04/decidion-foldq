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
            if (
                max_variables is not None
                and len(generate_maximal_stems(record.sequence)) > max_variables
            ):
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
