"""Adapter over the RCSB PDB Search and Data APIs.

Both are public and unauthenticated. Ranking and filtering live here rather than in
the frontend so the rule that matters most - never present a computed model as an
experimental structure - is enforced in one place, server-side.

Responses are cached in-process for the lifetime of the server. RCSB is reliable but
not ours, and a judged demonstration should not depend on it answering promptly.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx

SEARCH_URL = "https://search.rcsb.org/rcsbsearch/v2/query"
GRAPHQL_URL = "https://data.rcsb.org/graphql"

# Only experimentally determined structures. RCSB also serves computed structure
# models (AlphaFold, ESMFold); those are excluded rather than ranked lower.
EXPERIMENTAL_METHODS = frozenset(
    {
        "X-RAY DIFFRACTION",
        "ELECTRON MICROSCOPY",
        "SOLUTION NMR",
        "SOLID-STATE NMR",
        "NEUTRON DIFFRACTION",
        "ELECTRON CRYSTALLOGRAPHY",
        "FIBER DIFFRACTION",
    }
)


@dataclass(frozen=True)
class StructureSummary:
    pdb_id: str
    title: str
    method: str
    resolution: float | None
    rna_lengths: tuple[int, ...]
    rna_sequences: tuple[str, ...]
    ligands: tuple[str, ...]
    organisms: tuple[str, ...]
    released: str
    retrieved: str = field(
        default_factory=lambda: dt.datetime.now(dt.UTC).date().isoformat()
    )

    @property
    def has_rna(self) -> bool:
        return len(self.rna_lengths) > 0

    @property
    def primary_rna_length(self) -> int | None:
        return max(self.rna_lengths) if self.rna_lengths else None

    @property
    def primary_rna_sequence(self) -> str | None:
        """The longest RNA entity - the one worth folding."""
        if not self.rna_sequences:
            return None
        pairs = zip(self.rna_lengths, self.rna_sequences, strict=False)
        return max(pairs, key=lambda pair: pair[0])[1]


def rank_structures(entries: list[StructureSummary]) -> list[StructureSummary]:
    """Best resolution first; unresolved experimental entries last, never dropped.

    An NMR structure has no resolution but is still experimental evidence. Sorting
    on a missing value would either crash or silently place it first.
    """
    experimental = [e for e in entries if e.method.upper() in EXPERIMENTAL_METHODS]
    return sorted(
        experimental,
        key=lambda e: (e.resolution is None, e.resolution if e.resolution else 0.0),
    )


_SEARCH_BODY: dict[str, Any] = {
    "return_type": "entry",
    "request_options": {
        "paginate": {"start": 0, "rows": 25},
        "sort": [
            {"sort_by": "rcsb_entry_info.resolution_combined", "direction": "asc"}
        ],
    },
}

_ENTRY_QUERY = """
{
  entries(entry_ids: %s) {
    rcsb_id
    struct { title }
    exptl { method }
    rcsb_entry_info { resolution_combined nonpolymer_bound_components }
    rcsb_accession_info { initial_release_date }
    polymer_entities {
      entity_poly {
        rcsb_entity_polymer_type
        rcsb_sample_sequence_length
        pdbx_seq_one_letter_code_can
      }
      rcsb_entity_source_organism { ncbi_scientific_name }
    }
  }
}
"""


def _client() -> httpx.Client:
    return httpx.Client(timeout=20.0, headers={"content-type": "application/json"})


@lru_cache(maxsize=64)
def search_rna_structures(
    max_resolution: float = 3.0, limit: int = 25, text: str = ""
) -> tuple[str, ...]:
    """PDB identifiers of RNA-containing entries, best resolution first."""
    nodes: list[dict] = [
        {
            "type": "terminal",
            "service": "text",
            "parameters": {
                "attribute": "entity_poly.rcsb_entity_polymer_type",
                "operator": "exact_match",
                "value": "RNA",
            },
        },
        {
            "type": "terminal",
            "service": "text",
            "parameters": {
                "attribute": "rcsb_entry_info.resolution_combined",
                "operator": "less",
                "value": max_resolution,
            },
        },
    ]
    if text:
        nodes.append(
            {
                "type": "terminal",
                "service": "full_text",
                "parameters": {"value": text},
            }
        )

    body = {
        **_SEARCH_BODY,
        "query": {"type": "group", "logical_operator": "and", "nodes": nodes},
        "request_options": {
            **_SEARCH_BODY["request_options"],
            "paginate": {"start": 0, "rows": limit},
        },
    }
    with _client() as client:
        response = client.post(SEARCH_URL, json=body)
        response.raise_for_status()
        payload = response.json()
    return tuple(item["identifier"] for item in payload.get("result_set", []))


@lru_cache(maxsize=256)
def fetch_entries(pdb_ids: tuple[str, ...]) -> tuple[StructureSummary, ...]:
    """One batched GraphQL request for many entries, rather than N REST calls."""
    if not pdb_ids:
        return ()
    ids = "[" + ",".join(f'"{pdb_id}"' for pdb_id in pdb_ids) + "]"
    with _client() as client:
        response = client.post(GRAPHQL_URL, json={"query": _ENTRY_QUERY % ids})
        response.raise_for_status()
        payload = response.json()

    summaries: list[StructureSummary] = []
    for entry in payload.get("data", {}).get("entries") or []:
        if entry is None:
            continue
        rna = [
            item
            for item in entry.get("polymer_entities") or []
            if (item.get("entity_poly") or {}).get("rcsb_entity_polymer_type") == "RNA"
        ]
        resolutions = (entry.get("rcsb_entry_info") or {}).get("resolution_combined")
        methods = [m["method"] for m in entry.get("exptl") or []]
        organisms = {
            source.get("ncbi_scientific_name")
            for item in rna
            for source in item.get("rcsb_entity_source_organism") or []
            if source.get("ncbi_scientific_name")
        }
        summaries.append(
            StructureSummary(
                pdb_id=entry["rcsb_id"],
                title=(entry.get("struct") or {}).get("title", ""),
                method=methods[0] if methods else "UNKNOWN",
                resolution=resolutions[0] if resolutions else None,
                rna_lengths=tuple(
                    item["entity_poly"]["rcsb_sample_sequence_length"] for item in rna
                ),
                rna_sequences=tuple(
                    (item["entity_poly"].get("pdbx_seq_one_letter_code_can") or "")
                    for item in rna
                ),
                ligands=tuple(
                    (entry.get("rcsb_entry_info") or {}).get(
                        "nonpolymer_bound_components"
                    )
                    or ()
                ),
                organisms=tuple(sorted(organisms)),
                released=(entry.get("rcsb_accession_info") or {}).get(
                    "initial_release_date", ""
                )[:10],
            )
        )
    return tuple(summaries)
