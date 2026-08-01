# FoldQ Structural Evidence Implementation Plan

> Implementation plan for the structural evidence layer: RCSB PDB discovery, target and
> structure selection, and 3D rendering. Tasks are ordered by dependency and each ends
> with an independently testable deliverable. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** `docs/plans/2026-08-01-frontend-core.md` Tasks 1–5 (API seam, app
> shell, API client, design tokens). This plan assumes those exist.

**Goal:** Connect every folded sequence to real experimentally determined structures —
search RCSB PDB, rank by resolution, pick a target and a structure, render it in 3D with
hetero-atoms as sticks, and fold its actual sequence through FoldQ.

**Architecture:** A backend adapter in `foldq.api` proxies the RCSB Search and Data APIs,
because the ranking logic belongs beside the science code and a server-side cache keeps
the app working if RCSB is slow during judging. The frontend adds a target list, a
structure list ranked by resolution, and a lazily loaded Mol* viewer. The link back to
FoldQ is the polymer entity sequence: RCSB serves it, so a real structure's RNA can be
folded and scored through the existing gates.

**Tech Stack:** Everything from the core plan, plus Mol* (`molstar`) for 3D and `httpx`
for the backend RCSB adapter.

**Design:** `docs/design/2026-08-01-frontend-design.md` §2, §5, §7 phase 5

## Scope decision: no CQD material layer

The source workflow describes this layer as *"the structural layer of the material →
protein interaction: for each receptor a carbon-dot ligand binds, and each effector its
payload acts on."* **The carbon-quantum-dot material layer is excluded** at the project
owners' direction, and this plan does not build it.

What that removes: the CQD material catalogue, receptor/effector mapping, payload
records, and the `material → protein` join. Those had no underlying data in this
repository and would have required fixtures.

What remains, and is real: RCSB discovery, best-resolution-first ranking, target
selection, structure selection, 3D rendering with hetero-atoms as sticks. The entity
driving the target list becomes **RNA itself** rather than a CQD receptor — which is both
honest and closer to the project, since FoldQ folds RNA.

**The connecting thread is verified, not asserted.** `data/fixtures/curated.json` contains
`trna_phe_yeast_acceptor`, and its sequence is byte-identical to PDB **1EHZ** polymer
entity 1 (*Saccharomyces cerevisiae* phenylalanine tRNA, X-ray, 1.93 Å). That fixture
already carries a measured FoldQ result — base-pair F1 0.326 in `e5_pseudoknot.csv`. So
the worked example through this whole feature is a real structure, a real sequence, and a
result the project already published. Task 6 makes that link explicit in the UI.

## Global Constraints

Every constraint in `docs/plans/2026-08-01-frontend-core.md` applies unchanged. Additions
specific to this plan:

- **Never substitute a predicted or computed model for an experimental structure.** RCSB
  serves both. Only experimental entries (`X-RAY DIFFRACTION`, `ELECTRON MICROSCOPY`,
  `SOLUTION NMR`) are listed, and the method is displayed on every row. This is the single
  most important correctness rule in this plan — a computed model presented as
  experimental evidence would be the same class of failure as a fabricated citation.
- **Every structure card shows its retrieval date.** RCSB content changes; a cached
  response with no date is an undated claim.
- **RCSB is public and requires no key or account.** Verified: Search API
  `https://search.rcsb.org/rcsbsearch/v2/query` and Data API `https://data.rcsb.org` both
  answer unauthenticated. No credential may be introduced.
- **The app must remain usable when RCSB is unreachable.** Structure routes degrade to a
  stated error; every other route is unaffected because nothing else depends on RCSB.
- **Mol* is lazily loaded and disposed on unmount.** It is the only WebGL surface and the
  largest dependency in the project.
- **No fixture data.** If a view here cannot be backed by a live RCSB response, it is not
  built. The `Demonstration data` badge should not be needed anywhere in this plan.

## File Structure

```
src/foldq/api/
  rcsb.py                          RCSB adapter: search, fetch, rank, cache
  routes/structures.py             GET /api/v1/structures/*
tests/api/test_rcsb.py             adapter tests (rank_structures is pure, no network)

frontend/src/
  app/structures/
    page.tsx                       target classes + ranked structures for the chosen one
    [pdbId]/page.tsx               structure detail + 3D viewer
  components/molecular/
    MolstarViewer.tsx              lazily loaded Mol* wrapper
    StructureCard.tsx              one ranked structure
    LigandList.tsx                 hetero-atoms present
  lib/structures/
    schemas.ts                     Zod schemas for the structure API
    client.ts                      typed client
    targets.ts                     RNA target classes (each is a search term)
```

---

### Task 1: RCSB adapter and ranking

**Files:**
- Create: `src/foldq/api/rcsb.py`, `src/foldq/api/routes/structures.py`
- Modify: `src/foldq/api/app.py` (register the router), `pyproject.toml` (`httpx` in the `api` extra)
- Test: `tests/api/test_rcsb.py`

**Interfaces:**
- Consumes: RCSB Search API (`POST https://search.rcsb.org/rcsbsearch/v2/query`) and Data GraphQL (`POST https://data.rcsb.org/graphql`)
- Produces: `search_rna_structures(min_resolution, limit, query) -> list[str]`; `fetch_entries(ids) -> list[StructureSummary]`; `rank_structures(entries) -> list[StructureSummary]`; `GET /api/v1/structures/search`, `GET /api/v1/structures/{pdb_id}`

The ranking is a pure function over already-fetched entries so it is testable without a
network call. The verified GraphQL shape below is a real response captured from the live
API, not an assumed schema.

- [ ] **Step 1: Add `httpx` to the `api` extra**

```toml
api = ["fastapi>=0.115", "uvicorn[standard]>=0.32", "httpx>=0.27"]
```

Install: `uv pip install -e ".[dev,quantum,api]"`

- [ ] **Step 2: Write the failing test**

```python
# tests/api/test_rcsb.py
import pytest

pytest.importorskip("fastapi", reason="api extra not installed")

from foldq.api.rcsb import StructureSummary, rank_structures  # noqa: E402


def summary(**overrides) -> StructureSummary:
    defaults = dict(
        pdb_id="1EHZ",
        title="The crystal structure of yeast phenylalanine tRNA",
        method="X-RAY DIFFRACTION",
        resolution=1.93,
        rna_lengths=(76,),
        rna_sequences=("GCGGAUUUAGCUCAGUUGG",),
        ligands=("MG", "MN"),
        organisms=("Saccharomyces cerevisiae",),
        released="2000-10-02",
    )
    return StructureSummary(**{**defaults, **overrides})


def test_rank_orders_by_resolution_ascending():
    ranked = rank_structures(
        [
            summary(pdb_id="LOW", resolution=3.2),
            summary(pdb_id="BEST", resolution=0.85),
            summary(pdb_id="MID", resolution=1.93),
        ]
    )
    assert [s.pdb_id for s in ranked] == ["BEST", "MID", "LOW"]


def test_rank_places_unresolved_entries_last_without_dropping_them():
    # Solution NMR entries carry no resolution. They are still experimental
    # structures and must not be silently discarded by a resolution sort.
    ranked = rank_structures(
        [summary(pdb_id="NMR", method="SOLUTION NMR", resolution=None), summary()]
    )
    assert [s.pdb_id for s in ranked] == ["1EHZ", "NMR"]
    assert len(ranked) == 2


def test_rank_excludes_computed_models():
    ranked = rank_structures(
        [summary(pdb_id="PRED", method="PREDICTED", resolution=0.1), summary()]
    )
    assert [s.pdb_id for s in ranked] == ["1EHZ"]


def test_summary_exposes_the_longest_rna_entity():
    assert summary(rna_lengths=(12, 76, 30)).primary_rna_length == 76


def test_summary_reports_whether_it_carries_a_foldable_sequence():
    assert summary().has_rna is True
    assert summary(rna_lengths=(), rna_sequences=()).has_rna is False
```

- [ ] **Step 3: Run it to verify it fails**

Run: `.venv/bin/pytest tests/api/test_rcsb.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.api.rcsb'`

- [ ] **Step 4: Write `src/foldq/api/rcsb.py`**

```python
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


_SEARCH_BODY = {
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
```

- [ ] **Step 5: Write `src/foldq/api/routes/structures.py`**

```python
"""Structure discovery endpoints.

Errors from RCSB are surfaced as 503 rather than 500: the service is a dependency
we do not control, and the frontend distinguishes "RCSB is unavailable" from "this
app is broken".
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from foldq.api.rcsb import (
    StructureSummary,
    fetch_entries,
    rank_structures,
    search_rna_structures,
)

router = APIRouter()


class StructureOut(BaseModel):
    pdb_id: str
    title: str
    method: str
    resolution: float | None
    rna_length: int | None
    rna_sequence: str | None
    ligands: list[str]
    organisms: list[str]
    released: str
    retrieved: str


class StructureSearchResponse(BaseModel):
    structures: list[StructureOut]
    query: str
    max_resolution: float


def _to_out(summary: StructureSummary) -> StructureOut:
    return StructureOut(
        pdb_id=summary.pdb_id,
        title=summary.title,
        method=summary.method,
        resolution=summary.resolution,
        rna_length=summary.primary_rna_length,
        rna_sequence=summary.primary_rna_sequence,
        ligands=list(summary.ligands),
        organisms=list(summary.organisms),
        released=summary.released,
        retrieved=summary.retrieved,
    )


@router.get("/structures/search", response_model=StructureSearchResponse)
def search(
    text: str = Query("", max_length=100),
    max_resolution: float = Query(3.0, gt=0, le=20),
    limit: int = Query(25, ge=1, le=50),
) -> StructureSearchResponse:
    try:
        ids = search_rna_structures(max_resolution=max_resolution, limit=limit, text=text)
        entries = fetch_entries(ids)
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503, detail=f"RCSB PDB is unavailable: {error}"
        ) from error
    return StructureSearchResponse(
        structures=[_to_out(entry) for entry in rank_structures(list(entries))],
        query=text,
        max_resolution=max_resolution,
    )


@router.get("/structures/{pdb_id}", response_model=StructureOut)
def entry(pdb_id: str) -> StructureOut:
    try:
        entries = fetch_entries((pdb_id.upper(),))
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503, detail=f"RCSB PDB is unavailable: {error}"
        ) from error
    if not entries:
        raise HTTPException(status_code=404, detail=f"no PDB entry {pdb_id!r}")
    return _to_out(entries[0])
```

Register it in `app.py`: `app.include_router(structures.router, prefix="/api/v1")`.

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest tests/api/test_rcsb.py -v`
Expected: PASS (5 tests)

Run: `.venv/bin/pytest tests -q`
Expected: 280 passing (275 from the core plan + 5 new)

- [ ] **Step 7: Verify against the live API by hand**

```bash
.venv/bin/uvicorn foldq.api.app:app --port 8000 &
sleep 3
curl -s 'localhost:8000/api/v1/structures/1EHZ' | python3 -m json.tool
curl -s 'localhost:8000/api/v1/structures/search?max_resolution=1.5&limit=3' \
  | python3 -c "import json,sys; [print(s['pdb_id'], s['resolution'], s['method']) for s in json.load(sys.stdin)['structures']]"
kill %1
```

Expected: 1EHZ returns method `X-RAY DIFFRACTION`, resolution 1.93, a 76-nt RNA
sequence beginning `GCGGAUUUAGCUCAG`, and ligands `["MG", "MN"]`. The search returns
entries in ascending resolution order, none with a `PREDICTED` method.

- [ ] **Step 8: Commit**

```bash
git add src/foldq/api tests/api/test_rcsb.py pyproject.toml
git commit -- src/foldq/api tests/api/test_rcsb.py pyproject.toml \
  -m "feat: add RCSB PDB adapter with experimental-only structure ranking"
```

---

### Task 2: Structure client and ranking display

**Files:**
- Create: `frontend/src/lib/structures/schemas.ts`, `frontend/src/lib/structures/client.ts`, `frontend/src/components/molecular/StructureCard.tsx`, `frontend/src/components/molecular/LigandList.tsx`
- Test: `frontend/tests/unit/structures-schema.test.ts`, `frontend/tests/component/structure-card.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/structures/search`, `GET /api/v1/structures/{pdbId}` (Task 1)
- Produces: `searchStructures(params) -> Promise<StructureSearchResponse>`, `fetchStructure(pdbId) -> Promise<Structure>`; `<StructureCard structure onFold/>`, `<LigandList ligands/>`

- [ ] **Step 1: Capture a real fixture**

```bash
cd /Users/jainishsolanki/Documents/FoldQ
.venv/bin/uvicorn foldq.api.app:app --port 8000 &
sleep 3
curl -s 'localhost:8000/api/v1/structures/search?max_resolution=2.0&limit=5' \
  > frontend/tests/msw/structures-response.json
kill %1
```

Add to `frontend/tests/msw/handlers.ts`:

```ts
import structuresResponse from "./structures-response.json";

// appended to the existing handlers array
http.get("*/api/v1/structures/search", () => HttpResponse.json(structuresResponse)),
http.get("*/api/v1/structures/:pdbId", () =>
  HttpResponse.json(structuresResponse.structures[0]),
),
```

- [ ] **Step 2: Write the failing tests**

```ts
// frontend/tests/unit/structures-schema.test.ts
import { describe, expect, it } from "vitest";
import { structureSchema } from "@/lib/structures/schemas";
import response from "../msw/structures-response.json";

describe("structure schema", () => {
  it("parses every structure in a real captured response", () => {
    for (const structure of response.structures) {
      expect(() => structureSchema.parse(structure)).not.toThrow();
    }
  });

  it("accepts a null resolution for an NMR entry", () => {
    const nmr = { ...response.structures[0], resolution: null, method: "SOLUTION NMR" };
    expect(() => structureSchema.parse(nmr)).not.toThrow();
  });

  it("accepts a structure with no bound ligands", () => {
    expect(() =>
      structureSchema.parse({ ...response.structures[0], ligands: [] }),
    ).not.toThrow();
  });

  it("rejects a structure missing its retrieval date", () => {
    const undated: Record<string, unknown> = { ...response.structures[0] };
    delete undated.retrieved;
    expect(() => structureSchema.parse(undated)).toThrow(/retrieved/);
  });
});
```

```tsx
// frontend/tests/component/structure-card.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StructureCard } from "@/components/molecular/StructureCard";
import { structureSchema } from "@/lib/structures/schemas";
import response from "../msw/structures-response.json";

const structure = structureSchema.parse(response.structures[0]);

describe("StructureCard", () => {
  it("shows the experimental method, never implying a prediction", () => {
    render(<StructureCard structure={structure} />);
    expect(screen.getByText(new RegExp(structure.method, "i"))).toBeInTheDocument();
  });

  it("shows the resolution with units", () => {
    render(<StructureCard structure={structure} />);
    if (structure.resolution !== null) {
      expect(screen.getByText(/Å/)).toBeInTheDocument();
    }
  });

  it("states when the record was retrieved", () => {
    render(<StructureCard structure={structure} />);
    expect(screen.getByText(new RegExp(structure.retrieved))).toBeInTheDocument();
  });

  it("reports no resolution rather than a blank for an NMR entry", () => {
    render(
      <StructureCard structure={{ ...structure, resolution: null, method: "SOLUTION NMR" }} />,
    );
    expect(screen.getByText(/no resolution reported/i)).toBeInTheDocument();
  });

  it("offers to fold the entity sequence when one is present", async () => {
    const onFold = vi.fn();
    render(<StructureCard structure={structure} onFold={onFold} />);
    await userEvent.click(screen.getByRole("button", { name: /fold this sequence/i }));
    expect(onFold).toHaveBeenCalledWith(structure.rna_sequence);
  });

  it("does not offer folding when the entry carries no RNA sequence", () => {
    render(
      <StructureCard
        structure={{ ...structure, rna_sequence: null, rna_length: null }}
        onFold={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /fold this sequence/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/structures-schema.test.ts tests/component/structure-card.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the schemas and client**

```ts
// frontend/src/lib/structures/schemas.ts
import { z } from "zod";

export const structureSchema = z.object({
  pdb_id: z.string(),
  title: z.string(),
  /** The experimental method. Displayed on every card — a viewer must never have to
   *  assume whether a structure was measured or predicted. */
  method: z.string(),
  /** Null for NMR and some cryo-EM entries. Null means "not reported", not "poor". */
  resolution: z.number().nullable(),
  rna_length: z.number().nullable(),
  rna_sequence: z.string().nullable(),
  ligands: z.array(z.string()),
  organisms: z.array(z.string()),
  released: z.string(),
  /** The date this record was fetched from RCSB. Required — an undated cached
   *  record is an undated claim. */
  retrieved: z.string(),
});

export const structureSearchSchema = z.object({
  structures: z.array(structureSchema),
  query: z.string(),
  max_resolution: z.number(),
});

export type Structure = z.infer<typeof structureSchema>;
export type StructureSearchResponse = z.infer<typeof structureSearchSchema>;
```

```ts
// frontend/src/lib/structures/client.ts
import { ApiError } from "@/lib/api/client";
import {
  structureSchema,
  structureSearchSchema,
  type Structure,
  type StructureSearchResponse,
} from "./schemas";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.detail ?? response.statusText, response.status);
  }
  return schema.parse(body);
}

export function searchStructures(params: {
  text?: string;
  maxResolution?: number;
  limit?: number;
}): Promise<StructureSearchResponse> {
  const query = new URLSearchParams({
    text: params.text ?? "",
    max_resolution: String(params.maxResolution ?? 3.0),
    limit: String(params.limit ?? 25),
  });
  return request(`/api/v1/structures/search?${query}`, structureSearchSchema);
}

export function fetchStructure(pdbId: string): Promise<Structure> {
  return request(`/api/v1/structures/${pdbId}`, structureSchema);
}
```

- [ ] **Step 5: Write the card components**

```tsx
// frontend/src/components/molecular/LigandList.tsx
export function LigandList({ ligands }: { ligands: string[] }) {
  if (ligands.length === 0) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">No bound hetero-atoms.</p>
    );
  }
  return (
    <p className="text-xs text-[var(--text-secondary)]">
      Hetero-atoms:{" "}
      {ligands.map((ligand) => (
        <code key={ligand} className="mr-1 rounded bg-[var(--surface-elevated)] px-1">
          {ligand}
        </code>
      ))}
      <span className="ml-1">— rendered as sticks in the 3D view.</span>
    </p>
  );
}
```

```tsx
// frontend/src/components/molecular/StructureCard.tsx
import Link from "next/link";
import { LigandList } from "./LigandList";
import type { Structure } from "@/lib/structures/schemas";

export function StructureCard({
  structure,
  onFold,
}: {
  structure: Structure;
  onFold?: (sequence: string) => void;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/structures/${structure.pdb_id}`}
          className="font-mono text-sm font-semibold text-[var(--quantum-inspired)]"
        >
          {structure.pdb_id}
        </Link>
        <span className="text-xs tabular-nums">
          {structure.resolution === null
            ? "no resolution reported"
            : `${structure.resolution.toFixed(2)} Å`}
        </span>
      </div>

      <p className="mt-1 text-sm">{structure.title}</p>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <div>
          <dt className="inline">Method: </dt>
          <dd className="inline">{structure.method}</dd>
        </div>
        {structure.organisms.length > 0 && (
          <div>
            <dt className="inline">Organism: </dt>
            <dd className="inline italic">{structure.organisms.join(", ")}</dd>
          </div>
        )}
        {structure.rna_length !== null && (
          <div>
            <dt className="inline">RNA: </dt>
            <dd className="inline">{structure.rna_length} nt</dd>
          </div>
        )}
        <div>
          <dt className="inline">Released: </dt>
          <dd className="inline">{structure.released}</dd>
        </div>
        <div>
          <dt className="inline">Retrieved: </dt>
          <dd className="inline">{structure.retrieved}</dd>
        </div>
      </dl>

      <div className="mt-2">
        <LigandList ligands={structure.ligands} />
      </div>

      {onFold && structure.rna_sequence && (
        <button
          onClick={() => onFold(structure.rna_sequence!)}
          className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-xs"
        >
          Fold this sequence in FoldQ
        </button>
      )}
    </article>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/structures-schema.test.ts tests/component/structure-card.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/structures frontend/src/components/molecular frontend/tests
git commit -- frontend -m "feat: add structure client and ranked structure card"
```

---

### Task 3: Structure discovery page

**Files:**
- Create: `frontend/src/app/structures/page.tsx`, `frontend/src/lib/structures/targets.ts`
- Modify: `frontend/src/lib/nav.ts` (add the route), `frontend/tests/unit/nav.test.ts` (extend the built-route list)
- Test: `frontend/tests/component/structures-page.test.tsx`, `frontend/tests/unit/targets.test.ts`

**Interfaces:**
- Consumes: `searchStructures` (Task 2), `StructureCard` (Task 2), `useWorkspace` (core plan Task 12)
- Produces: `RNA_TARGETS: RnaTarget[]` where `RnaTarget = {id, label, description, query}`; the `/structures` route

**Pick a target, then a structure** — the two levels the source workflow specifies. In the
original CQD framing the target was a protein a carbon-dot ligand binds. With that layer
dropped, the target becomes an **RNA functional class** — tRNA, ribosome, riboswitch,
ribozyme, aptamer, ribonucleoprotein. Each target is nothing more than a full-text query
against RCSB plus a label; there is no target database, and none is invented. Selecting
one filters the ranked structure list below it.

Task 5 of the core plan asserts that `NAV_SECTIONS` links only to built routes. Adding
`/structures` to the nav requires extending that list in the same commit, or the nav test
fails — which is the intended behaviour.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/structures-page.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StructuresPage from "@/app/structures/page";
import response from "../msw/structures-response.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/structures",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StructuresPage />
    </QueryClientProvider>,
  );
}

describe("target selection", () => {
  it("offers a target class before any structure", async () => {
    renderPage();
    const targets = screen.getByRole("group", { name: /target/i });
    expect(within(targets).getByRole("button", { name: /tRNA/i })).toBeInTheDocument();
    expect(within(targets).getByRole("button", { name: /riboswitch/i })).toBeInTheDocument();
  });

  it("filters the structure list when a target is chosen", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /riboswitch/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /riboswitch/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("lets a target be cleared back to all RNA structures", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /tRNA/i }));
    await userEvent.click(screen.getByRole("button", { name: /tRNA/i }));
    expect(screen.getByRole("button", { name: /tRNA/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("structures page", () => {
  it("lists structures best resolution first", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    const shown = screen
      .getAllByText(/Å$/)
      .map((node) => Number.parseFloat(node.textContent!));
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
  });

  it("states that only experimental structures are listed", async () => {
    renderPage();
    expect(
      await screen.findByText(/experimentally determined|no predicted models/i),
    ).toBeInTheDocument();
  });

  it("filters by resolution", async () => {
    renderPage();
    const slider = await screen.findByLabelText(/maximum resolution/i);
    await userEvent.clear(slider);
    await userEvent.type(slider, "1.5");
    await waitFor(() => expect(screen.getByDisplayValue("1.5")).toBeInTheDocument());
  });

  it("sends the sequence to the wizard when folding a structure", async () => {
    renderPage();
    const buttons = await screen.findAllByRole("button", { name: /fold this sequence/i });
    await userEvent.click(buttons[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/foldq/new"));
  });

  it("reports an RCSB outage without breaking the page", async () => {
    const { server } = await import("../msw/handlers");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.get("*/api/v1/structures/search", () =>
        HttpResponse.json({ detail: "RCSB PDB is unavailable" }, { status: 503 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/RCSB PDB is unavailable/i);
  });
});
```

```ts
// frontend/tests/unit/targets.test.ts
import { describe, expect, it } from "vitest";
import { RNA_TARGETS } from "@/lib/structures/targets";

describe("RNA targets", () => {
  it("has a unique id and a non-empty query per target", () => {
    const ids = RNA_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const target of RNA_TARGETS) {
      expect(target.query.length).toBeGreaterThan(0);
      expect(target.label.length).toBeGreaterThan(0);
      expect(target.description.length).toBeGreaterThan(0);
    }
  });

  it("covers the classes the project already folds", () => {
    // tRNA is not decorative here: the curated benchmark fixture is a tRNA, and
    // its structure is PDB 1EHZ.
    expect(RNA_TARGETS.map((t) => t.id)).toContain("trna");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/component/structures-page.test.tsx tests/unit/targets.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the target classes**

```ts
// frontend/src/lib/structures/targets.ts

/** An RNA functional class. Each is a label plus a full-text query passed straight
 *  to RCSB — there is no target database behind this, and none is implied. The
 *  structures returned are whatever RCSB matches, ranked by resolution. */
export interface RnaTarget {
  id: string;
  label: string;
  description: string;
  query: string;
}

export const RNA_TARGETS: RnaTarget[] = [
  {
    id: "trna",
    label: "tRNA",
    description: "Transfer RNA. The project's 76-nt benchmark is one of these.",
    query: "transfer RNA",
  },
  {
    id: "ribosome",
    label: "Ribosomal RNA",
    description: "Ribosomal subunits and complexes — the largest RNA structures.",
    query: "ribosome",
  },
  {
    id: "riboswitch",
    label: "Riboswitch",
    description: "Ligand-binding regulatory elements; most carry bound hetero-atoms.",
    query: "riboswitch",
  },
  {
    id: "ribozyme",
    label: "Ribozyme",
    description: "Catalytic RNA, including hammerhead and hairpin ribozymes.",
    query: "ribozyme",
  },
  {
    id: "aptamer",
    label: "Aptamer",
    description: "Selected binding RNAs, usually in complex with their target.",
    query: "aptamer",
  },
  {
    id: "viral",
    label: "Viral RNA element",
    description: "Structured viral elements — frameshift signals, IRES, UTRs.",
    query: "viral RNA element",
  },
];
```

- [ ] **Step 4: Write the page**

```tsx
// frontend/src/app/structures/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StructureCard } from "@/components/molecular/StructureCard";
import { searchStructures } from "@/lib/structures/client";
import { RNA_TARGETS } from "@/lib/structures/targets";
import { useWorkspace } from "@/stores/workspace";

export default function StructuresPage() {
  const router = useRouter();
  const setSequence = useWorkspace((state) => state.setSequence);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [maxResolution, setMaxResolution] = useState(3.0);

  const target = RNA_TARGETS.find((t) => t.id === targetId) ?? null;
  // A free-text search overrides the target class; otherwise the target's query
  // drives the search. Sending both would AND them and usually return nothing.
  const query = text || target?.query || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["structures", query, maxResolution],
    queryFn: () => searchStructures({ text: query, maxResolution }),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Structural evidence</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          RNA-containing entries from the RCSB Protein Data Bank, ranked best resolution
          first. <strong>Only experimentally determined structures are listed</strong> —
          X-ray, cryo-EM and NMR. Computed models are excluded rather than ranked lower,
          and every card names its method and the date the record was retrieved.
        </p>
      </header>

      <section role="group" aria-label="RNA target class">
        <h2 className="mb-2 text-base font-semibold">1 — Pick a target</h2>
        <div className="flex flex-wrap gap-2">
          {RNA_TARGETS.map((option) => {
            const active = option.id === targetId;
            return (
              <button
                key={option.id}
                aria-pressed={active}
                title={option.description}
                onClick={() => setTargetId(active ? null : option.id)}
                className={
                  active
                    ? "rounded border border-[var(--quantum-inspired)] bg-[var(--quantum-inspired)]/15 px-3 py-1.5 text-sm"
                    : "rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {target && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {target.description} Matching RCSB on <code>{target.query}</code>.
          </p>
        )}
      </section>

      <h2 className="text-base font-semibold">2 — Pick a structure</h2>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="overrides the target class…"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Maximum resolution (Å)</span>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="20"
            value={maxResolution}
            onChange={(event) => setMaxResolution(Number(event.target.value))}
            className="w-28 rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
          />
        </label>
      </div>

      {isLoading && <p role="status">Searching RCSB…</p>}
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {(error as Error).message}. The rest of the application is unaffected — only
          structure views depend on RCSB.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data?.structures.map((structure) => (
          <StructureCard
            key={structure.pdb_id}
            structure={structure}
            onFold={(sequence) => {
              setSequence(sequence);
              router.push("/foldq/new");
            }}
          />
        ))}
      </div>

      {data?.structures.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          No experimental RNA structures matched. Try a higher resolution limit.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the route to the navigation**

In `frontend/src/lib/nav.ts`, add a section:

```ts
  {
    label: "Structural Evidence",
    items: [{ href: "/structures", label: "PDB Structures" }],
  },
```

In `frontend/tests/unit/nav.test.ts`, add `"/structures"` to the `built` array.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/structures-page.test.tsx tests/unit/targets.test.ts tests/unit/nav.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/structures frontend/src/lib/structures/targets.ts frontend/src/lib/nav.ts frontend/tests
git commit -- frontend -m "feat: add PDB structure discovery page"
```

---

### Task 4: Mol* 3D viewer

**Files:**
- Create: `frontend/src/components/molecular/MolstarViewer.tsx`
- Modify: `frontend/next.config.ts` (transpile `molstar`), `frontend/src/styles/globals.css` (viewer container)
- Test: `frontend/tests/component/molstar.test.tsx`

**Interfaces:**
- Consumes: a PDB identifier
- Produces: `<MolstarViewer pdbId height/>`, lazily loaded and disposed on unmount

Mol* is the largest dependency in the project and the only WebGL surface. It is loaded
with `next/dynamic` and `ssr: false`, so it is absent from the server bundle and from
every route that does not render it. The component test mocks the library — asserting the
lifecycle contract (created once, disposed on unmount) rather than rendering WebGL, which
jsdom cannot do.

- [ ] **Step 1: Install Mol\***

```bash
cd frontend && pnpm add molstar
```

In `frontend/next.config.ts`:

```ts
import type { NextConfig } from "next";

// Mol* ships untranspiled ESM under lib/; Next must process it.
const config: NextConfig = { transpilePackages: ["molstar"] };
export default config;
```

Mol\* needs its stylesheet or the viewport renders unstyled. `molstar/build/viewer/molstar.css`
ships as plain CSS in the package. Import it at the top of `MolstarViewer.tsx`:

```ts
import "molstar/build/viewer/molstar.css";
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/tests/component/molstar.test.tsx
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const dispose = vi.fn();
const loadPdb = vi.fn().mockResolvedValue(undefined);
const createViewer = vi.fn().mockResolvedValue({ dispose, loadPdb });

vi.mock("molstar/lib/apps/viewer/app", () => ({
  Viewer: { create: (...args: unknown[]) => createViewer(...args) },
}));

import { MolstarViewer } from "@/components/molecular/MolstarViewer";

describe("MolstarViewer", () => {
  it("creates exactly one viewer instance", async () => {
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(createViewer).toHaveBeenCalledTimes(1));
  });

  it("loads the requested entry", async () => {
    createViewer.mockClear();
    loadPdb.mockClear();
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(loadPdb).toHaveBeenCalledWith("1EHZ"));
  });

  it("disposes the viewer on unmount", async () => {
    dispose.mockClear();
    const { unmount } = render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(createViewer).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it("renders a labelled container before the viewer initialises", () => {
    const { getByRole } = render(<MolstarViewer pdbId="1EHZ" />);
    // The shell must be present immediately — Mol* takes seconds to initialise and
    // a blank area reads as a broken page.
    expect(getByRole("region", { name: /3D structure/i })).toBeInTheDocument();
  });

  it("reports a load failure instead of leaving an empty canvas", async () => {
    loadPdb.mockRejectedValueOnce(new Error("network"));
    const { findByRole } = render(<MolstarViewer pdbId="BAD1" />);
    expect(await findByRole("alert")).toHaveTextContent(/could not load/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/molstar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the viewer**

```tsx
// frontend/src/components/molecular/MolstarViewer.tsx
"use client";

import { useEffect, useRef, useState } from "react";

/** Mol* wrapper.
 *
 *  The library is imported inside the effect rather than at module scope so it never
 *  enters the bundle of a route that does not render a structure — it is by a wide
 *  margin the largest dependency in the project.
 *
 *  Ligands and hetero-atoms render as sticks and ions as spheres, which is Mol*'s
 *  default preset for polymer entries. The preset is set explicitly rather than
 *  relied upon.
 */
export function MolstarViewer({
  pdbId,
  height = 480,
}: {
  pdbId: string;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viewer: { dispose: () => void; loadPdb: (id: string) => Promise<void> } | null =
      null;
    let cancelled = false;

    async function start() {
      if (!container.current) return;
      try {
        const { Viewer } = await import("molstar/lib/apps/viewer/app");
        const instance = await Viewer.create(container.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          viewportShowExpand: true,
          viewportShowSelectionMode: true,
        });
        if (cancelled) {
          instance.dispose();
          return;
        }
        viewer = instance;
        await instance.loadPdb(pdbId);
      } catch (cause) {
        if (!cancelled) {
          setError(
            `Could not load ${pdbId} from RCSB: ${(cause as Error).message}`,
          );
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      viewer?.dispose();
    };
  }, [pdbId]);

  return (
    <section aria-label={`3D structure of ${pdbId}`}>
      <div
        ref={container}
        style={{ height }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Interactive 3D view of PDB entry {pdbId}. Polymer chains are shown as cartoon,
          hetero-atoms and ligands as sticks, ions as spheres. Rotate by dragging; zoom
          with the scroll wheel.
        </p>
      )}
    </section>
  );
}
```

**Why this exact import path.** Verified against the published `molstar@5.11.0` tarball:

- `molstar/lib/apps/viewer/app` exports `class Viewer` with `static create(elementOrId,
  Partial<ViewerOptions>): Promise<Viewer>`, `loadPdb(id, options): Promise<void>` and
  `dispose(): void`. All six options used above are real keys on `ViewerOptions`.
- **Do not import from `molstar/lib/apps/viewer`** (the package index). Its `index.d.ts`
  side-effect-imports `./index.html`, `./mvs.html`, `./favicon.ico` and
  `../../mol-plugin-ui/skin/light.scss`, none of which webpack can resolve without extra
  loaders. Importing `/app` directly avoids all four — `app.js` has no asset imports.
- **Do not import from `molstar/build/viewer/molstar`** either. That is the standalone
  browser bundle; it ships no `.d.ts` for `Viewer`, so TypeScript would fail.

If a later Mol\* version moves the class, change the source import and the test's
`vi.mock` path in the same edit — a mock pointing at a path the source no longer imports
makes the test pass against nothing.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/molstar.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/molecular/MolstarViewer.tsx frontend/next.config.ts frontend/tests
git commit -- frontend -m "feat: add lazily loaded Mol* 3D viewer"
```

---

### Task 5: Structure detail page

**Files:**
- Create: `frontend/src/app/structures/[pdbId]/page.tsx`
- Test: `frontend/tests/component/structure-detail.test.tsx`

**Interfaces:**
- Consumes: `fetchStructure` (Task 2), `MolstarViewer` (Task 4), `StructureCard` (Task 2), `useWorkspace`
- Produces: the `/structures/[pdbId]` route

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/structure-detail.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StructureDetailPage from "@/app/structures/[pdbId]/page";
import response from "../msw/structures-response.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ pdbId: response.structures[0].pdb_id }),
  useRouter: () => ({ push }),
  usePathname: () => "/structures/x",
}));
vi.mock("@/components/molecular/MolstarViewer", () => ({
  MolstarViewer: ({ pdbId }: { pdbId: string }) => (
    <div data-testid="molstar" data-pdb={pdbId} />
  ),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StructureDetailPage />
    </QueryClientProvider>,
  );
}

describe("structure detail", () => {
  it("mounts the 3D viewer for the requested entry", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("molstar")).toHaveAttribute(
        "data-pdb",
        response.structures[0].pdb_id,
      ),
    );
  });

  it("shows the RNA sequence RCSB reports for the entry", async () => {
    renderPage();
    const sequence = response.structures[0].rna_sequence;
    if (sequence) {
      expect(await screen.findByText(new RegExp(sequence.slice(0, 20)))).toBeInTheDocument();
    }
  });

  it("links out to the RCSB entry page", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /view on rcsb/i });
    expect(link).toHaveAttribute(
      "href",
      `https://www.rcsb.org/structure/${response.structures[0].pdb_id}`,
    );
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sends the entity sequence to the wizard", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: /fold this sequence/i });
    await userEvent.click(button);
    expect(push).toHaveBeenCalledWith("/foldq/new");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/structure-detail.test.tsx`
Expected: FAIL — page not found.

- [ ] **Step 3: Write the page**

```tsx
// frontend/src/app/structures/[pdbId]/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { StructureCard } from "@/components/molecular/StructureCard";
import { fetchStructure } from "@/lib/structures/client";
import { useWorkspace } from "@/stores/workspace";

const MolstarViewer = dynamic(
  () => import("@/components/molecular/MolstarViewer").then((m) => m.MolstarViewer),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex h-[480px] items-center justify-center rounded-lg border border-[var(--border)] bg-black text-sm text-[var(--text-secondary)]"
      >
        Loading the 3D viewer…
      </div>
    ),
  },
);

export default function StructureDetailPage() {
  const { pdbId } = useParams<{ pdbId: string }>();
  const router = useRouter();
  const setSequence = useWorkspace((state) => state.setSequence);

  const { data, isLoading, error } = useQuery({
    queryKey: ["structure", pdbId],
    queryFn: () => fetchStructure(pdbId),
  });

  if (isLoading) return <p role="status">Loading {pdbId}…</p>;
  if (error) return <p role="alert">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{data.pdb_id}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            {data.title}
          </p>
        </div>
        <a
          href={`https://www.rcsb.org/structure/${data.pdb_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          View on RCSB ↗
        </a>
      </header>

      <MolstarViewer pdbId={data.pdb_id} />

      <StructureCard
        structure={data}
        onFold={(sequence) => {
          setSequence(sequence);
          router.push("/foldq/new");
        }}
      />

      {data.rna_sequence && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-base font-semibold">RNA entity sequence</h2>
          <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
            {data.rna_length} nt, as deposited. This is the sequence FoldQ folds — the
            structure above is the experimental answer to compare a prediction against.
          </p>
          <pre className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            <code className="font-mono text-xs">{data.rna_sequence}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/structure-detail.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/structures frontend/tests
git commit -- frontend -m "feat: add structure detail page with 3D viewer"
```

---

### Task 6: The worked example, end-to-end tests, and documentation

**Files:**
- Create: `frontend/tests/e2e/structures.spec.ts`
- Modify: `frontend/src/app/analytics/pseudoknots/page.tsx`, `data/fixtures/curated.json`, `frontend/README.md`, `frontend/tests/e2e/a11y.spec.ts`
- Test: the Playwright spec

**Interfaces:**
- Consumes: every route from Tasks 3–5

This task closes the loop. `trna_phe_yeast_acceptor` in `data/fixtures/curated.json` is
byte-identical to PDB **1EHZ** polymer entity 1, and that entry has a published FoldQ
result (F1 0.326). Recording the identifier upgrades the fixture's provenance from "public
domain sequence" to a citable experimental structure, and lets the pseudoknot page link
its hardest case to the real thing.

- [ ] **Step 1: Verify the sequence identity before recording it**

```bash
cd /Users/jainishsolanki/Documents/FoldQ
.venv/bin/python - <<'PY'
import json, urllib.request
fixture = next(
    r for r in json.load(open("data/fixtures/curated.json"))["records"]
    if r["sequence_id"] == "trna_phe_yeast_acceptor"
)
url = "https://data.rcsb.org/rest/v1/core/polymer_entity/1EHZ/1"
entity = json.load(urllib.request.urlopen(url))["entity_poly"]
pdb = entity["pdbx_seq_one_letter_code_can"]
print("fixture:", fixture["sequence"])
print("1EHZ   :", pdb)
print("IDENTICAL" if pdb == fixture["sequence"] else "*** DIFFERENT - do not record ***")
PY
```

Expected: `IDENTICAL`. **If it prints anything else, stop and report** — the provenance
claim in the next step would be false, and this project has already had to retract one
fabricated provenance.

- [ ] **Step 2: Record the provenance in the fixture**

In `data/fixtures/curated.json`, for `trna_phe_yeast_acceptor`, replace the `source` and
`notes` fields:

```json
"source": "PDB 1EHZ entity 1 (X-ray, 1.93 A, Saccharomyces cerevisiae); sequence is public domain",
"notes": "Classic 76-nt benchmark. Tier S; too large for the exact gates. Structure is the textbook cloverleaf, not re-derived here. Sequence verified byte-identical to RCSB PDB 1EHZ polymer entity 1."
```

Leave every other field unchanged. The sequence itself must not be edited.

- [ ] **Step 3: Confirm the change breaks nothing**

Run: `.venv/bin/pytest tests -q`
Expected: 280 passing. If a test asserts on the `source` string, update the test to the
new value — the fixture is the source of truth for provenance, not the test.

- [ ] **Step 4: Link the pseudoknot page's hardest case to its structure**

In `frontend/src/app/analytics/pseudoknots/page.tsx`, inside the controls `ChartCard`,
add below the chart:

```tsx
<p className="mt-3 text-xs text-[var(--text-secondary)]">
  The tRNA-Phe control is the hardest case measured here, and its structure is
  experimentally determined:{" "}
  <Link href="/structures/1EHZ" className="text-[var(--quantum-inspired)] underline">
    PDB 1EHZ
  </Link>{" "}
  (X-ray, 1.93 Å). Its 76 nt give 229 variables, and the cloverleaf&apos;s multiloop
  junction is precisely the k-body structure a degree-2 QUBO approximates worst.
</p>
```

with `import Link from "next/link";` at the top of the file.

- [ ] **Step 5: Write the end-to-end spec**

```ts
// frontend/tests/e2e/structures.spec.ts
import { expect, test } from "@playwright/test";

test("picks a target, then a structure, views it in 3D, and folds its sequence", async ({
  page,
}) => {
  await page.goto("/structures");
  await expect(page.getByText(/only experimentally determined/i)).toBeVisible();

  await page.getByRole("button", { name: /^tRNA$/ }).click();
  await expect(page.getByRole("button", { name: /^tRNA$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const first = page.getByRole("article").first();
  await expect(first).toBeVisible();
  await first.getByRole("link").first().click();

  await expect(page).toHaveURL(/\/structures\/[A-Z0-9]{4}/i);
  await expect(page.getByRole("link", { name: /view on rcsb/i })).toBeVisible();
  // The viewer shell must appear immediately, before WebGL initialises.
  await expect(page.getByRole("region", { name: /3D structure/i })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /fold this sequence/i }).click();
  await expect(page).toHaveURL(/\/foldq\/new/);
  await expect(page.getByLabel(/sequence/i)).not.toHaveValue("");
});

test("the rest of the app is unaffected when RCSB is unreachable", async ({
  page,
  context,
}) => {
  await context.route("**/api/v1/structures/**", (route) => route.abort());
  await page.goto("/structures");
  await expect(page.getByRole("alert")).toBeVisible();

  await page.goto("/analytics/solver-performance");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("1EHZ carries the sequence the tRNA benchmark uses", async ({ page }) => {
  await page.goto("/structures/1EHZ");
  await expect(page.getByText(/GCGGAUUUAGCUCAG/)).toBeVisible();
  await expect(page.getByText(/X-RAY DIFFRACTION/i)).toBeVisible();
});
```

Add `"/structures"` to the `ROUTES` array in `frontend/tests/e2e/a11y.spec.ts`. Do not
add `/structures/[pdbId]` — the Mol* canvas is a WebGL surface and axe has no meaningful
rule set for it; the surrounding page is covered by the component tests.

- [ ] **Step 6: Document the layer**

Append to `frontend/README.md`:

```markdown
## Structural evidence

`/structures` searches the RCSB Protein Data Bank for RNA-containing entries and ranks
them best resolution first. `/structures/[pdbId]` renders one in 3D with Mol*, with
hetero-atoms as sticks.

Three rules this layer holds to:

- **Only experimental structures are listed.** RCSB also serves computed models
  (AlphaFold, ESMFold); those are filtered out server-side, not ranked lower. Every card
  names its experimental method.
- **Every record shows its retrieval date.** RCSB content changes.
- **No fixture data.** If RCSB is unreachable the structure routes show an error and
  every other route is unaffected.

The carbon-quantum-dot material layer described in the source workflow is deliberately
not built — see `docs/plans/2026-08-01-frontend-structures.md`.

RCSB is public and needs no key or account.
```

- [ ] **Step 7: Run everything**

```bash
cd frontend && pnpm test && pnpm lint && pnpm test:e2e
cd .. && .venv/bin/pytest tests -q && .venv/bin/ruff check src tests && .venv/bin/mypy src
```

Expected: all frontend suites pass, Playwright passes including axe on `/structures`,
Python at 280 passing with ruff and mypy clean.

- [ ] **Step 8: Commit**

```bash
git add frontend data/fixtures/curated.json
git commit -- frontend data/fixtures/curated.json \
  -m "feat: link the tRNA benchmark to PDB 1EHZ and cover structures end to end"
```

---

## Verification

| check | command | expected |
|---|---|---|
| Python suite with RCSB adapter | `.venv/bin/pytest tests -q` | 280 passed |
| Python lint and types | `.venv/bin/ruff check src tests && .venv/bin/mypy src` | clean |
| Frontend unit and component | `cd frontend && pnpm test` | all pass |
| Frontend types and lint | `cd frontend && pnpm lint` | clean |
| End-to-end and accessibility | `cd frontend && pnpm test:e2e` | all pass |
| Only experimental structures | load `/structures`, read every method | no `PREDICTED` or `COMPUTATIONAL` |
| Retrieval date on every card | load `/structures` | every card shows "Retrieved:" |
| Degradation | block `/api/v1/structures/**`, load every other route | unaffected |
| Mol\* is not in other bundles | `cd frontend && pnpm build` then grep the route manifest | `molstar` only under `/structures/[pdbId]` |
| Provenance is true, not asserted | Task 6 Step 1 script | prints `IDENTICAL` |

## Deliberately not built

- **The CQD material layer** — carbon-dot catalogue, receptor/effector mapping, payload
  records, and the `material → protein` join. Excluded at the project owners' direction;
  it had no underlying data and would have required fixtures.
- **Real-world evidence, materials and targets routes** (design §5, phase 6). These were
  the fixture-backed areas the design flagged as needing a demonstration badge. With the
  CQD layer dropped they have no remaining purpose.
- **2D↔3D selection synchronisation.** Mapping a base-pair selection in the 2D view onto
  Mol* residues requires a residue-numbering map RCSB does not serve directly; the
  deposited numbering frequently differs from sequence position. Building it on an assumed
  identity mapping would produce a viewer that highlights the wrong residues — worse than
  not offering the feature.
- **Comparing FoldQ output against experimental base pairs.** RCSB serves no secondary
  structure annotation, and deriving base pairs from 3D coordinates needs a geometric
  annotator (DSSR or comparable) that is not a dependency here. The page therefore offers
  the sequence to fold and the structure to inspect, and makes no automated comparison
  claim.
- **Density maps and R2DT template layouts.**
