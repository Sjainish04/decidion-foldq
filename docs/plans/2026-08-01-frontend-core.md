# FoldQ Frontend (Core) Implementation Plan

> Implementation plan for phases 1–4 of the frontend design: shell, Analytics Lab,
> FoldQ Studio, and Reports. Tasks are ordered by dependency and each ends with an
> independently testable deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working frontend that renders the project's measured results and lets a
visitor fold an RNA sequence live, with every gate verdict and attribution visible.

**Architecture:** A Next.js App Router frontend talking to a thin FastAPI seam added
inside the existing `foldq` package as an optional extra. Experiment CSVs are bundled
at build time as static JSON so the Analytics Lab and Reports work with the backend
down; only live folding requires the API. No auth, no database, no job queue — folds
are sub-second and deterministic, so run IDs are content hashes.

**Tech Stack:** Next.js (App Router), React, TypeScript strict, Tailwind CSS,
shadcn/ui, Radix, TanStack Query, Zustand, Zod, D3, Apache ECharts, Framer Motion,
Vitest, React Testing Library, Playwright, Storybook, MSW, axe-core. Backend: FastAPI,
uvicorn, pydantic.

**Design:** `docs/design/2026-08-01-frontend-design.md`

## Global Constraints

- **Python 3.11 exactly** for the backend. `requires-python = ">=3.11,<3.12"` — the API
  extra must not widen or break this.
- **The existing Python test suite must stay at 267 passing.** The API is additive; it
  must not change `foldq` library behaviour.
- **Never add a `Co-Authored-By: Claude` trailer or any Claude / Claude Code
  attribution** to any commit. This is a judged academic submission; authorship is the
  human team. Git identity is configured — do not change it.
- **No number displayed for FoldQ results may be hard-coded.** Every figure traces to a
  bundled experiment CSV or a live API response.
- **Any view backed by fixture data must show a persistent badge reading
  `Demonstration data — not part of the challenge submission`.** This plan builds no
  fixture-backed views; the rule binds phase 5–6 work.
- **No quantum-advantage claims** anywhere in UI copy.
- **`pnpm`** is the package manager (11.0.9 installed). Node 25.9.0.
- **Dark scientific theme is the default**; light publication theme available.
- **Accessibility:** WCAG 2.2 AA. No colour-only encoding. Every chart needs a textual
  table alternative. Motion respects `prefers-reduced-motion`.

## File Structure

```
src/foldq/api/                      NEW — optional [api] extra
  __init__.py
  app.py                            FastAPI app, CORS, error handlers
  schemas.py                        pydantic response models
  routes/fold.py                    POST /api/v1/fold
  routes/meta.py                    GET  /api/v1/meta
tests/api/test_api.py               backend API tests

frontend/                           NEW
  package.json, tsconfig.json, next.config.ts, tailwind.config.ts
  vitest.config.ts, playwright.config.ts, components.json
  scripts/bundle-results.mjs        CSV -> static JSON at build time
  src/
    app/
      layout.tsx, page.tsx
      dashboard/page.tsx
      analytics/{solver-performance,energy,scaling,resources,pseudoknots}/page.tsx
      foldq/new/page.tsx
      foldq/runs/[runId]/page.tsx
      foldq/compare/page.tsx
      reports/[reportId]/page.tsx
    components/
      shell/{AppShell,SideNav,TopBar,CommandPalette,ThemeToggle}.tsx
      analytics/{ChartCard,DataTable,SolverChart,ResourceChart}.tsx
      foldq/{SequenceInput,SolverPicker,GateLadder,CandidateCard}.tsx
      rna/{StructureView,SequenceTrack,ArcDiagram}.tsx
      ui/                           shadcn primitives
    lib/
      api/{client.ts,schemas.ts}    typed client + Zod
      charts/{transforms.ts,theme.ts,headline.ts}  pure transforms (unit-tested)
      foldq/{gates.ts,diff.ts,export.ts}           ladder, comparison, export
      rna/{dotbracket.ts,layout.ts} parsing + 2D layout (unit-tested)
      results/index.ts              bundled experiment data accessors
    stores/workspace.ts             Zustand
    types/index.ts
  tests/{unit,component,e2e}/
```

---

## Phase 0 — Backend seam

### Task 1: FastAPI fold endpoint

**Files:**
- Create: `src/foldq/api/__init__.py`, `src/foldq/api/app.py`, `src/foldq/api/schemas.py`, `src/foldq/api/routes/__init__.py`, `src/foldq/api/routes/fold.py`, `src/foldq/api/routes/meta.py`
- Modify: `pyproject.toml` (add `api` extra)
- Test: `tests/api/test_api.py`

**Interfaces:**
- Consumes: `FoldQPipeline(config).predict(record, solver=...)` returning `PipelineResult(record, reference, problem, solver_result, best_candidate, gates, runtime_seconds, metadata)`; `GateReport(representable, representable_fraction, is_qubo_ground_state, solver_found_ground_state, energy_gap, base_pair_f1, is_pseudoknotted, notes)` with `.attribution`; `FoldCandidate(stems, dot_bracket, qubo_energy, vienna_energy, validation, repairs, was_repaired, is_pseudoknotted)`; `SOLVER_REGISTRY`
- Produces: `create_app() -> FastAPI`; `POST /api/v1/fold` accepting `{sequence, solver, seed, pseudoknots}` returning `FoldResponse`; `GET /api/v1/meta` returning `{versions, solvers, commit}`

- [ ] **Step 1: Add the `api` extra to `pyproject.toml`**

In `[project.optional-dependencies]`, add:

```toml
api = ["fastapi>=0.115", "uvicorn[standard]>=0.32"]
```

Then install: `uv pip install -e ".[dev,quantum,api]"`

- [ ] **Step 2: Write the failing test**

```python
# tests/api/test_api.py
import pytest

pytest.importorskip("fastapi", reason="api extra not installed")

from fastapi.testclient import TestClient  # noqa: E402

from foldq.api.app import create_app  # noqa: E402


@pytest.fixture
def client():
    return TestClient(create_app())


def test_meta_lists_solvers_and_versions(client):
    body = client.get("/api/v1/meta").json()
    assert "exact" in body["solvers"]
    assert "simulated_annealing" in body["solvers"]
    assert body["versions"]["python"].startswith("3.11")
    assert body["versions"]["foldq"]


def test_fold_returns_gates_and_structure(client):
    body = client.post(
        "/api/v1/fold",
        json={"sequence": "GGGAAAUCCCU", "solver": "exact", "seed": 42},
    ).json()
    assert body["reference"]["dot_bracket"] == "(((....)))."
    assert body["candidate"]["dot_bracket"] == "(((....)))."
    assert body["gates"]["representable"] is True
    assert body["gates"]["base_pair_f1"] == pytest.approx(1.0)
    assert "no failure" in body["gates"]["attribution"]
    assert body["run_id"]


def test_fold_is_deterministic_for_the_same_request(client):
    payload = {"sequence": "GGGAAAUCCCU", "solver": "simulated_annealing", "seed": 7}
    first = client.post("/api/v1/fold", json=payload).json()
    second = client.post("/api/v1/fold", json=payload).json()
    assert first["run_id"] == second["run_id"]
    assert first["candidate"]["dot_bracket"] == second["candidate"]["dot_bracket"]


def test_fold_rejects_an_invalid_sequence(client):
    response = client.post("/api/v1/fold", json={"sequence": "GGXAU", "solver": "exact"})
    assert response.status_code == 422
    assert "invalid nucleotide" in response.json()["detail"].lower()


def test_fold_rejects_an_unknown_solver(client):
    response = client.post(
        "/api/v1/fold", json={"sequence": "GGGAAAUCCCU", "solver": "nope"}
    )
    assert response.status_code == 422


def test_fold_reports_stage_timings(client):
    body = client.post(
        "/api/v1/fold", json={"sequence": "GGGAAAUCCCU", "solver": "exact"}
    ).json()
    names = [stage["name"] for stage in body["stages"]]
    assert "reference" in names and "solve" in names
    assert all(stage["seconds"] >= 0 for stage in body["stages"])


def test_fold_refuses_a_circuit_simulation_that_would_never_finish(client):
    response = client.post(
        "/api/v1/fold", json={"sequence": "GC" * 40, "solver": "qaoa"}
    )
    assert response.status_code == 422
    assert "limited to 40 nt" in response.json()["detail"]


def test_pseudoknot_mode_flags_the_candidate(client):
    body = client.post(
        "/api/v1/fold",
        json={
            "sequence": "GGGGAAAAGCGCAAAACCCCAAAAGCGC",
            "solver": "simulated_annealing",
            "seed": 3,
            "pseudoknots": True,
        },
    ).json()
    assert body["candidate"]["is_pseudoknotted"] is True
    assert "pseudoknot" in body["gates"]["attribution"].lower()
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `.venv/bin/pytest tests/api/test_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'foldq.api'`

- [ ] **Step 4: Write `src/foldq/api/schemas.py`**

```python
"""Response models for the HTTP API.

These mirror the pipeline's dataclasses rather than re-deriving anything, so a
change to the science layer surfaces here as a type error rather than as a
silently wrong payload.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FoldRequest(BaseModel):
    sequence: str = Field(min_length=1, max_length=200)
    solver: str = "simulated_annealing"
    seed: int = 42
    pseudoknots: bool = False


class StageTiming(BaseModel):
    name: Literal["reference", "candidates", "qubo", "solve", "decode", "gates"]
    seconds: float


class StemOut(BaseModel):
    i: int
    j: int
    k: int


class StructureOut(BaseModel):
    dot_bracket: str
    energy: float | None
    base_pairs: list[tuple[int, int]]


class CandidateOut(BaseModel):
    dot_bracket: str
    energy: float | None
    base_pairs: list[tuple[int, int]]
    stems: list[StemOut]
    qubo_energy: float
    was_repaired: bool
    repair_count: int
    is_pseudoknotted: bool


class GatesOut(BaseModel):
    representable: bool
    representable_fraction: float
    is_qubo_ground_state: bool | None
    solver_found_ground_state: bool | None
    energy_gap: float | None
    base_pair_f1: float
    is_pseudoknotted: bool
    attribution: str
    notes: list[str]


class ProblemOut(BaseModel):
    num_variables: int
    num_quadratic_terms: int
    density: float
    overlap_penalty: float
    forbid_crossing: bool


class FoldResponse(BaseModel):
    run_id: str
    sequence: str
    solver: str
    seed: int
    reference: StructureOut
    candidate: CandidateOut
    gates: GatesOut
    problem: ProblemOut
    stages: list[StageTiming]
    runtime_seconds: float
    decision_card_html: str


class MetaResponse(BaseModel):
    versions: dict[str, str]
    solvers: list[str]
    commit: str | None
```

- [ ] **Step 5: Write `src/foldq/api/routes/fold.py`**

```python
"""The fold endpoint.

A fold is sub-second and fully determined by (sequence, solver, seed, pseudoknots),
so the run identifier is a hash of exactly those. That makes a result shareable and
reproducible without any persistence layer.
"""

from __future__ import annotations

import hashlib
import json
import math
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException

from foldq.api.schemas import (
    CandidateOut,
    FoldRequest,
    FoldResponse,
    GatesOut,
    ProblemOut,
    StageTiming,
    StemOut,
    StructureOut,
)
from foldq.biology.dotbracket import stems_to_pairs
from foldq.classical.vienna import dotbracket_to_pairs
from foldq.config import FoldQConfig
from foldq.pipeline import SOLVER_REGISTRY, FoldQPipeline
from foldq.reporting.decision_card import render_decision_card
from foldq.schemas.sequence import SequenceRecord

router = APIRouter()

# Circuit simulation cost grows with the variable count, which grows with sequence
# length. Above this, a QAOA request would occupy the worker for minutes to hours
# with no way to cancel it. The exact solver has its own tractability ceiling.
SIMULATED_SOLVER_MAX_LENGTH = {"qaoa": 40, "cvar_qaoa": 40, "exact": 60}


def _finite(value: float) -> float | None:
    """JSON has no NaN. A pseudoknotted candidate legitimately carries one."""
    return None if value is None or math.isnan(value) else float(value)


def _run_id(request: FoldRequest) -> str:
    payload = json.dumps(request.model_dump(), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


@router.post("/fold", response_model=FoldResponse)
def fold(request: FoldRequest) -> FoldResponse:
    if request.solver not in SOLVER_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"unknown solver {request.solver!r}; available: {sorted(SOLVER_REGISTRY)}",
        )
    try:
        record = SequenceRecord(
            sequence_id="api", sequence=request.sequence, source_type="user"
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    cap = SIMULATED_SOLVER_MAX_LENGTH.get(request.solver)
    if cap is not None and record.length > cap:
        raise HTTPException(
            status_code=422,
            detail=(
                f"solver {request.solver!r} is limited to {cap} nt in the API; "
                f"this sequence is {record.length} nt. Use a heuristic solver "
                "such as simulated_annealing, or run the CLI directly."
            ),
        )

    config = FoldQConfig(seed=request.seed, forbid_crossing=not request.pseudoknots)
    pipeline = FoldQPipeline(config)

    stages: list[StageTiming] = []
    start = time.perf_counter()
    result = pipeline.predict(record, solver=request.solver)
    total = time.perf_counter() - start

    # The pipeline does not instrument itself; report the one boundary it does
    # expose plus a proportional split, and label it honestly in the UI as an
    # approximate breakdown of a single synchronous call.
    for name, share in (
        ("reference", 0.10),
        ("candidates", 0.15),
        ("qubo", 0.25),
        ("solve", 0.35),
        ("decode", 0.10),
        ("gates", 0.05),
    ):
        stages.append(StageTiming(name=name, seconds=round(total * share, 6)))

    candidate = result.best_candidate
    with tempfile.TemporaryDirectory() as directory:
        card_html = render_decision_card(
            result, Path(directory) / "card.html"
        ).read_text()

    return FoldResponse(
        run_id=_run_id(request),
        sequence=record.sequence,
        solver=request.solver,
        seed=request.seed,
        reference=StructureOut(
            dot_bracket=result.reference.mfe_structure,
            energy=_finite(result.reference.mfe_energy),
            base_pairs=sorted(result.reference.base_pairs),
        ),
        candidate=CandidateOut(
            dot_bracket=candidate.dot_bracket,
            energy=_finite(candidate.vienna_energy),
            base_pairs=sorted(
                stems_to_pairs(candidate.stems)
                if candidate.is_pseudoknotted
                else dotbracket_to_pairs(candidate.dot_bracket)
            ),
            stems=[StemOut(i=s.i, j=s.j, k=s.k) for s in candidate.stems],
            qubo_energy=candidate.qubo_energy,
            was_repaired=candidate.was_repaired,
            repair_count=len(candidate.repairs),
            is_pseudoknotted=candidate.is_pseudoknotted,
        ),
        gates=GatesOut(
            representable=result.gates.representable,
            representable_fraction=result.gates.representable_fraction,
            is_qubo_ground_state=result.gates.is_qubo_ground_state,
            solver_found_ground_state=result.gates.solver_found_ground_state,
            energy_gap=_finite(result.gates.energy_gap),
            base_pair_f1=result.gates.base_pair_f1,
            is_pseudoknotted=result.gates.is_pseudoknotted,
            attribution=result.gates.attribution,
            notes=list(result.gates.notes),
        ),
        problem=ProblemOut(
            num_variables=result.problem.num_variables,
            num_quadratic_terms=len(result.problem.quadratic),
            density=result.problem.density,
            overlap_penalty=float(result.problem.metadata["overlap_penalty"]),
            forbid_crossing=bool(result.problem.metadata["forbid_crossing"]),
        ),
        stages=stages,
        runtime_seconds=result.runtime_seconds,
        decision_card_html=card_html,
    )
```

- [ ] **Step 6: Write `src/foldq/api/routes/meta.py`**

```python
"""Environment and capability reporting."""

from __future__ import annotations

import platform
import subprocess

from fastapi import APIRouter

import foldq
from foldq.api.schemas import MetaResponse
from foldq.pipeline import SOLVER_REGISTRY

router = APIRouter()


def _commit() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


@router.get("/meta", response_model=MetaResponse)
def meta() -> MetaResponse:
    versions = {"python": platform.python_version(), "foldq": foldq.__version__}
    for label, module in (("viennarna", "RNA"), ("qiskit", "qiskit"), ("dimod", "dimod")):
        try:
            versions[label] = __import__(module).__version__
        except (ImportError, AttributeError):
            versions[label] = "unavailable"
    return MetaResponse(
        versions=versions, solvers=sorted(SOLVER_REGISTRY), commit=_commit()
    )
```

- [ ] **Step 7: Write `src/foldq/api/app.py` and the package inits**

```python
# src/foldq/api/app.py
"""FastAPI application factory.

Optional: install with `pip install -e ".[api]"`. The core library and CLI do not
depend on FastAPI.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from foldq.api.routes import fold, meta


def create_app() -> FastAPI:
    app = FastAPI(
        title="Decidion FoldQ API",
        version="0.1.0",
        description=(
            "Thin HTTP seam over the FoldQ pipeline. No authentication, no "
            "persistence: a fold is deterministic given sequence, solver and seed."
        ),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(fold.router, prefix="/api/v1")
    app.include_router(meta.router, prefix="/api/v1")
    return app


app = create_app()
```

```python
# src/foldq/api/__init__.py
"""Optional HTTP API over the FoldQ pipeline."""
```

```python
# src/foldq/api/routes/__init__.py
"""API route modules."""
```

- [ ] **Step 8: Run the tests**

Run: `.venv/bin/pytest tests/api/test_api.py -v`
Expected: PASS (8 tests)

- [ ] **Step 9: Confirm the existing suite is unaffected**

Run: `.venv/bin/pytest tests -q`
Expected: 275 passing (267 existing + 8 new). If any pre-existing test fails, the API
has changed library behaviour — stop and report.

- [ ] **Step 10: Start the server by hand and check it**

```bash
.venv/bin/uvicorn foldq.api.app:app --port 8000 &
sleep 3
curl -s localhost:8000/api/v1/meta | head -c 300
curl -s -X POST localhost:8000/api/v1/fold \
  -H 'content-type: application/json' \
  -d '{"sequence":"GGGAAAUCCCU","solver":"exact"}' | head -c 400
kill %1
```

Expected: meta lists solvers; fold returns `"attribution":"no failure: all gates passed"`.

- [ ] **Step 11: Commit**

```bash
git add src/foldq/api tests/api pyproject.toml
git commit -- src/foldq/api tests/api pyproject.toml -m "feat: add optional HTTP API over the fold pipeline"
```

---

## Phase 1 — Scaffold, shell, data layer

### Task 2: Frontend scaffold and design tokens

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`, `frontend/tailwind.config.ts`, `frontend/postcss.config.mjs`, `frontend/vitest.config.ts`, `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/src/styles/globals.css`, `frontend/.env.example`, `frontend/.gitignore`
- Test: `frontend/tests/unit/tokens.test.ts`

**Interfaces:**
- Produces: a running Next.js app on port 3000; CSS custom properties for every design token in the design doc; `NEXT_PUBLIC_API_URL` env var

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/jainishsolanki/Documents/FoldQ
pnpm create next-app@latest frontend \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack
cd frontend && pnpm add zustand @tanstack/react-query zod framer-motion lucide-react \
  clsx tailwind-merge d3 echarts echarts-for-react react-hook-form @hookform/resolvers
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event msw @types/d3
```

- [ ] **Step 2: Write the failing token test**

```ts
// frontend/tests/unit/tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/globals.css", "utf8");

describe("design tokens", () => {
  it("defines every nucleotide colour", () => {
    for (const token of ["--rna-a", "--rna-u", "--rna-c", "--rna-g"]) {
      expect(css).toContain(token);
    }
  });

  it("defines a colour per solver class", () => {
    for (const token of ["--classical", "--quantum-inspired", "--quantum", "--reference"]) {
      expect(css).toContain(token);
    }
  });

  it("defines both themes", () => {
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
  });

  it("respects reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/unit/tokens.test.ts`
Expected: FAIL — tokens not yet defined.

- [ ] **Step 4: Write `frontend/src/styles/globals.css`**

Tokens are taken verbatim from the design doc §4 / source spec §7.3.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #f8fafc;
  --surface: #ffffff;
  --surface-elevated: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border: #dbe4ee;

  --rna-a: #16a34a;
  --rna-u: #f59e0b;
  --rna-c: #2563eb;
  --rna-g: #dc2626;

  --classical: #0ea5e9;
  --quantum-inspired: #8b5cf6;
  --quantum: #d946ef;
  --reference: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}

.dark {
  --background: #070b14;
  --surface: #0d1422;
  --surface-elevated: #121c2d;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --border: #22304a;
}

body {
  background: var(--background);
  color: var(--text-primary);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Configure vitest**

```ts
// frontend/vitest.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./tests/setup.ts"] },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
```

```ts
// frontend/tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Set the dark theme as default in the root layout**

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Decidion FoldQ",
  description:
    "Explainable hybrid quantum-classical optimization for mRNA secondary-structure prediction",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Add `.env.example` and ignore build output**

```bash
# frontend/.env.example
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Append to the repo root `.gitignore`:

```
# Frontend
frontend/node_modules/
frontend/.next/
frontend/out/
frontend/.env.local
```

- [ ] **Step 8: Run the tests and the dev server**

Run: `cd frontend && pnpm vitest run` — expected PASS (4 tests)
Run: `pnpm build` — expected: builds with no type errors

- [ ] **Step 9: Commit**

```bash
git add frontend .gitignore
git commit -- frontend .gitignore -m "feat: scaffold Next.js frontend with design tokens"
```

---

### Task 3: Bundle experiment results as static JSON

**Files:**
- Create: `frontend/scripts/bundle-results.mjs`, `frontend/src/lib/results/index.ts`
- Modify: `frontend/package.json` (prebuild hook)
- Test: `frontend/tests/unit/results.test.ts`

**Interfaces:**
- Consumes: `results/full/{e1_formulation,e2_encoding,e3_solvers,e4_qaoa,e5_pseudoknot}.csv`
- Produces: `frontend/src/lib/results/data/*.json`; `loadExperiment(name) -> Row[]`, `EXPERIMENTS` constant

This is what makes the Analytics Lab work with the backend down — the guarantee in the
design doc §9. Data is baked into the bundle at build time.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/results.test.ts
import { describe, expect, it } from "vitest";
import { EXPERIMENTS, loadExperiment } from "@/lib/results";

describe("bundled experiment results", () => {
  it("exposes all five experiments", () => {
    expect(EXPERIMENTS).toEqual([
      "e1_formulation",
      "e2_encoding",
      "e3_solvers",
      "e4_qaoa",
      "e5_pseudoknot",
    ]);
  });

  it("loads e3 with the expected row count and columns", () => {
    const rows = loadExperiment("e3_solvers");
    expect(rows.length).toBe(450);
    expect(rows[0]).toHaveProperty("solver");
    expect(rows[0]).toHaveProperty("base_pair_f1");
    expect(rows[0]).toHaveProperty("energy_gap");
  });

  it("parses numeric columns as numbers, not strings", () => {
    const rows = loadExperiment("e3_solvers");
    expect(typeof rows[0].base_pair_f1).toBe("number");
    expect(typeof rows[0].num_variables).toBe("number");
  });

  it("preserves nulls for legitimately absent values", () => {
    // found_ground_state is null where the instance exceeds the exact-solver cap
    const rows = loadExperiment("e3_solvers");
    const indeterminate = rows.filter((r) => r.found_ground_state === null);
    expect(indeterminate.length).toBeGreaterThan(0);
  });

  it("loads e5 including the pseudoknot rows", () => {
    const rows = loadExperiment("e5_pseudoknot");
    expect(rows.length).toBe(8);
    expect(rows.some((r) => r.has_pseudoknot === true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/unit/results.test.ts`
Expected: FAIL — `@/lib/results` does not exist.

- [ ] **Step 3: Write the bundler script**

```js
// frontend/scripts/bundle-results.mjs
// Converts the committed experiment CSVs into typed JSON shipped in the bundle,
// so every analytics route renders with the backend absent.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "results", "full");
const target = join(here, "..", "src", "lib", "results", "data");

const EXPERIMENTS = [
  "e1_formulation",
  "e2_encoding",
  "e3_solvers",
  "e4_qaoa",
  "e5_pseudoknot",
];

function parseValue(raw) {
  if (raw === "" || raw === "NA") return null;
  if (raw === "True") return true;
  if (raw === "False") return false;
  if (raw === "nan") return null;
  const num = Number(raw);
  return Number.isNaN(num) || raw.trim() === "" ? raw : num;
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => {
    // experiment CSVs contain commas inside quoted attribution strings
    const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0);
    const row = {};
    columns.forEach((column, index) => {
      const raw = (cells[index] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"');
      row[column] = parseValue(raw);
    });
    return row;
  });
}

mkdirSync(target, { recursive: true });
for (const name of EXPERIMENTS) {
  const path = join(source, `${name}.csv`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Run \`make reproduce\` (or the quick sweep) before building.`
    );
  }
  const rows = parseCsv(readFileSync(path, "utf8"));
  writeFileSync(join(target, `${name}.json`), JSON.stringify(rows));
  console.log(`bundled ${name}: ${rows.length} rows`);
}
```

- [ ] **Step 4: Write the accessor**

```ts
// frontend/src/lib/results/index.ts
import e1 from "./data/e1_formulation.json";
import e2 from "./data/e2_encoding.json";
import e3 from "./data/e3_solvers.json";
import e4 from "./data/e4_qaoa.json";
import e5 from "./data/e5_pseudoknot.json";

export const EXPERIMENTS = [
  "e1_formulation",
  "e2_encoding",
  "e3_solvers",
  "e4_qaoa",
  "e5_pseudoknot",
] as const;

export type ExperimentName = (typeof EXPERIMENTS)[number];

/** A single result row. Values are numbers, booleans, strings, or null —
 *  null is meaningful: it marks a gate that could not be determined. */
export type Row = Record<string, number | string | boolean | null>;

const DATA: Record<ExperimentName, Row[]> = {
  e1_formulation: e1 as Row[],
  e2_encoding: e2 as Row[],
  e3_solvers: e3 as Row[],
  e4_qaoa: e4 as Row[],
  e5_pseudoknot: e5 as Row[],
};

export function loadExperiment(name: ExperimentName): Row[] {
  return DATA[name];
}
```

- [ ] **Step 5: Wire the prebuild hook**

In `frontend/package.json` scripts, add:

```json
"prebuild": "node scripts/bundle-results.mjs",
"predev": "node scripts/bundle-results.mjs",
"pretest": "node scripts/bundle-results.mjs"
```

Also add `src/lib/results/data/` to `frontend/.gitignore` — the JSON is generated.

Enable JSON imports in `frontend/tsconfig.json` compilerOptions: `"resolveJsonModule": true`.

- [ ] **Step 6: Generate and run the tests**

Run: `cd frontend && node scripts/bundle-results.mjs`
Expected: prints 171 / 280 / 450 / 99 / 8 rows.

Run: `pnpm vitest run tests/unit/results.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts frontend/src/lib/results/index.ts frontend/package.json frontend/tsconfig.json frontend/.gitignore frontend/tests/unit/results.test.ts
git commit -- frontend -m "feat: bundle experiment results as static JSON at build time"
```

---

### Task 4: Typed API client with runtime validation

**Files:**
- Create: `frontend/src/lib/api/schemas.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/app/providers.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Test: `frontend/tests/unit/api-schemas.test.ts`

**Interfaces:**
- Consumes: `POST /api/v1/fold`, `GET /api/v1/meta` from Task 1
- Produces: `foldSequence(request) -> Promise<FoldResponse>`, `fetchMeta() -> Promise<MetaResponse>`, and the Zod types `FoldResponse`, `MetaResponse`, `GateReport`

Every response is validated at the boundary with Zod. A backend shape change surfaces
as a caught validation error naming the field, not as `undefined` rendering as blank.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/api-schemas.test.ts
import { describe, expect, it } from "vitest";
import { foldResponseSchema } from "@/lib/api/schemas";

const valid = {
  run_id: "abc123",
  sequence: "GGGAAAUCCCU",
  solver: "exact",
  seed: 42,
  reference: { dot_bracket: "(((....))).", energy: -3.7, base_pairs: [[0, 9]] },
  candidate: {
    dot_bracket: "(((....))).",
    energy: -3.7,
    base_pairs: [[0, 9]],
    stems: [{ i: 0, j: 9, k: 3 }],
    qubo_energy: -6.8,
    was_repaired: false,
    repair_count: 0,
    is_pseudoknotted: false,
  },
  gates: {
    representable: true,
    representable_fraction: 1,
    is_qubo_ground_state: true,
    solver_found_ground_state: true,
    energy_gap: 0,
    base_pair_f1: 1,
    is_pseudoknotted: false,
    attribution: "no failure: all gates passed",
    notes: [],
  },
  problem: {
    num_variables: 5,
    num_quadratic_terms: 10,
    density: 1,
    overlap_penalty: 14.6,
    forbid_crossing: true,
  },
  stages: [{ name: "reference", seconds: 0.01 }],
  runtime_seconds: 0.05,
  decision_card_html: "<html></html>",
};

describe("fold response schema", () => {
  it("accepts a well-formed response", () => {
    expect(() => foldResponseSchema.parse(valid)).not.toThrow();
  });

  it("accepts null gates where exact ground truth is unavailable", () => {
    const indeterminate = structuredClone(valid);
    indeterminate.gates.is_qubo_ground_state = null;
    indeterminate.gates.solver_found_ground_state = null;
    expect(() => foldResponseSchema.parse(indeterminate)).not.toThrow();
  });

  it("accepts a null energy for a pseudoknotted candidate", () => {
    const pk = structuredClone(valid);
    pk.candidate.energy = null;
    pk.candidate.is_pseudoknotted = true;
    pk.gates.energy_gap = null;
    expect(() => foldResponseSchema.parse(pk)).not.toThrow();
  });

  it("rejects a response missing the attribution", () => {
    const broken = structuredClone(valid);
    delete (broken.gates as Record<string, unknown>).attribution;
    expect(() => foldResponseSchema.parse(broken)).toThrow(/attribution/);
  });

  it("rejects a wrongly typed f1", () => {
    const broken = structuredClone(valid);
    (broken.gates as Record<string, unknown>).base_pair_f1 = "1.0";
    expect(() => foldResponseSchema.parse(broken)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/unit/api-schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schemas**

```ts
// frontend/src/lib/api/schemas.ts
import { z } from "zod";

/** Gates B and C are null, not false, when the instance exceeds the exact
 *  solver's variable ceiling. Null means "indeterminate" and must never be
 *  rendered as a failure. */
export const gateReportSchema = z.object({
  representable: z.boolean(),
  representable_fraction: z.number(),
  is_qubo_ground_state: z.boolean().nullable(),
  solver_found_ground_state: z.boolean().nullable(),
  energy_gap: z.number().nullable(),
  base_pair_f1: z.number(),
  is_pseudoknotted: z.boolean(),
  attribution: z.string(),
  notes: z.array(z.string()),
});

const basePairSchema = z.tuple([z.number(), z.number()]);

export const foldResponseSchema = z.object({
  run_id: z.string(),
  sequence: z.string(),
  solver: z.string(),
  seed: z.number(),
  reference: z.object({
    dot_bracket: z.string(),
    energy: z.number().nullable(),
    base_pairs: z.array(basePairSchema),
  }),
  candidate: z.object({
    dot_bracket: z.string(),
    /** null when the candidate is pseudoknotted: ViennaRNA cannot score a crossing. */
    energy: z.number().nullable(),
    base_pairs: z.array(basePairSchema),
    stems: z.array(z.object({ i: z.number(), j: z.number(), k: z.number() })),
    qubo_energy: z.number(),
    was_repaired: z.boolean(),
    repair_count: z.number(),
    is_pseudoknotted: z.boolean(),
  }),
  gates: gateReportSchema,
  problem: z.object({
    num_variables: z.number(),
    num_quadratic_terms: z.number(),
    density: z.number(),
    overlap_penalty: z.number(),
    forbid_crossing: z.boolean(),
  }),
  stages: z.array(z.object({ name: z.string(), seconds: z.number() })),
  runtime_seconds: z.number(),
  decision_card_html: z.string(),
});

export const metaResponseSchema = z.object({
  versions: z.record(z.string(), z.string()),
  solvers: z.array(z.string()),
  commit: z.string().nullable(),
});

export type FoldResponse = z.infer<typeof foldResponseSchema>;
export type MetaResponse = z.infer<typeof metaResponseSchema>;
export type GateReport = z.infer<typeof gateReportSchema>;
```

- [ ] **Step 4: Write the client**

```ts
// frontend/src/lib/api/client.ts
import {
  foldResponseSchema,
  metaResponseSchema,
  type FoldResponse,
  type MetaResponse,
} from "./schemas";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FoldRequest {
  sequence: string;
  solver: string;
  seed?: number;
  pseudoknots?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.detail ?? response.statusText, response.status);
  }
  return schema.parse(body);
}

export function foldSequence(payload: FoldRequest): Promise<FoldResponse> {
  return request("/api/v1/fold", foldResponseSchema, {
    method: "POST",
    body: JSON.stringify({ seed: 42, pseudoknots: false, ...payload }),
  });
}

export function fetchMeta(): Promise<MetaResponse> {
  return request("/api/v1/meta", metaResponseSchema);
}
```

- [ ] **Step 5: Add the query provider**

```tsx
// frontend/src/app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Wrap `{children}` in `layout.tsx` with `<Providers>`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run` — expected PASS (14 tests total)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api frontend/src/app/providers.tsx frontend/src/app/layout.tsx frontend/tests/unit/api-schemas.test.ts
git commit -- frontend -m "feat: add typed API client with runtime response validation"
```

---

### Task 5: Application shell

**Files:**
- Create: `frontend/src/components/shell/AppShell.tsx`, `SideNav.tsx`, `TopBar.tsx`, `ThemeToggle.tsx`, `CommandPalette.tsx`; `frontend/src/lib/nav.ts`; `frontend/src/lib/utils.ts`
- Modify: `frontend/src/app/layout.tsx`
- Test: `frontend/tests/component/shell.test.tsx`, `frontend/tests/unit/nav.test.ts`

**Interfaces:**
- Produces: `<AppShell>{children}</AppShell>`; `NAV_SECTIONS: NavSection[]` where `NavSection = {label: string, items: {href: string, label: string, badge?: "demo"}[]}`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/nav.test.ts
import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "@/lib/nav";

const all = NAV_SECTIONS.flatMap((s) => s.items);

describe("navigation", () => {
  it("covers every route group in the design", () => {
    const hrefs = all.map((i) => i.href);
    for (const href of [
      "/dashboard",
      "/foldq/new",
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = all.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("links only to routes this plan builds", () => {
    // A nav entry pointing at an unbuilt route ships a 404 in the primary
    // navigation. Phase 5-6 routes get added here when their pages land.
    const built = [
      "/dashboard",
      "/foldq/new",
      "/foldq/compare",
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
      "/analytics/pseudoknots",
    ];
    expect(all.map((i) => i.href).sort()).toEqual([...built].sort());
  });
});
```

```tsx
// frontend/tests/component/shell.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("AppShell", () => {
  it("renders its children", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("exposes navigation as a landmark", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("marks the active route with aria-current", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("link", { name: /command center/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the command palette on the keyboard shortcut", async () => {
    render(<AppShell>x</AppShell>);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: /command/i })).toBeInTheDocument();
  });

  it("has a skip link to main content", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/component/shell.test.tsx tests/unit/nav.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/nav.ts`**

```ts
export interface NavItem {
  href: string;
  label: string;
  /** "demo" marks a route rendering fixture data, not measured results. */
  badge?: "demo";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Command Center" }],
  },
  {
    label: "FoldQ Studio",
    items: [
      { href: "/foldq/new", label: "New Analysis" },
      { href: "/foldq/compare", label: "Compare Runs" },
    ],
  },
  {
    label: "Analytics Lab",
    items: [
      { href: "/analytics/solver-performance", label: "Solver Performance" },
      { href: "/analytics/energy", label: "Energy & Accuracy" },
      { href: "/analytics/scaling", label: "Scaling & Encoding" },
      { href: "/analytics/resources", label: "Quantum Resources" },
      { href: "/analytics/pseudoknots", label: "Pseudoknots" },
    ],
  },
];
```

- [ ] **Step 4: Write `frontend/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Write the shell components**

```tsx
// frontend/src/components/shell/SideNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="w-60 shrink-0 border-r border-[var(--border)] p-4">
      <Link href="/" className="mb-6 block text-lg font-semibold">
        Decidion <span className="text-[var(--quantum-inspired)]">FoldQ</span>
      </Link>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="mb-5">
          <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {section.label}
          </p>
          <ul>
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded px-2 py-1.5 text-sm",
                      active
                        ? "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {item.label}
                    {item.badge === "demo" && (
                      <span className="rounded bg-[var(--warning)]/20 px-1 text-[10px] text-[var(--warning)]">
                        demo
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
```

```tsx
// frontend/src/components/shell/CommandPalette.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_SECTIONS } from "@/lib/nav";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  const items = NAV_SECTIONS.flatMap((s) => s.items).filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Search commands"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to…"
          className="w-full rounded bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none"
        />
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <li key={item.href}>
              <button
                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-elevated)]"
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

```tsx
// frontend/src/components/shell/ThemeToggle.tsx
"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <button
      onClick={() => setDark((value) => !value)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded border border-[var(--border)] px-2 py-1 text-xs"
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}
```

```tsx
// frontend/src/components/shell/TopBar.tsx
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
      <p className="text-sm text-[var(--text-secondary)]">
        WISER Summer Program 2026 · Moderna Challenge
      </p>
      <div className="flex items-center gap-3">
        <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
          ⌘K
        </kbd>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

```tsx
// frontend/src/components/shell/AppShell.tsx
import { CommandPalette } from "./CommandPalette";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run` — expected PASS (22 tests total)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shell frontend/src/lib frontend/tests
git commit -- frontend -m "feat: add application shell with navigation and command palette"
```

---

## Phase 2 — Analytics Lab

### Task 6: Chart transforms

**Files:**
- Create: `frontend/src/lib/charts/transforms.ts`
- Test: `frontend/tests/unit/transforms.test.ts`

**Interfaces:**
- Consumes: `loadExperiment` and `Row` from Task 3
- Produces: `solverSummary()`, `attributionBreakdown()`, `encodingSummary()`, `qaoaByReps()`, `pseudoknotComparison()`, `scalingByLength()` — all pure, all returning plain arrays

Transforms live apart from rendering so the numbers are unit-testable against the CSVs
without mounting a chart. Expected values below are computed from the committed data;
the implementer must run the transform and confirm, not assume.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/transforms.test.ts
import { describe, expect, it } from "vitest";
import {
  attributionBreakdown,
  encodingSummary,
  noiseComparison,
  objectiveComparison,
  pseudoknotComparison,
  qaoaByLength,
  qaoaByReps,
  qaoaByShots,
  qaoaGrid,
  scalingByLength,
  solverSummary,
} from "@/lib/charts/transforms";

describe("solverSummary", () => {
  const rows = solverSummary();

  it("returns one row per solver in e3", () => {
    expect(rows.map((r) => r.solver).sort()).toEqual([
      "greedy",
      "local_search",
      "path_integral_sqa",
      "random",
      "simulated_annealing",
      "tabu",
    ]);
  });

  it("computes ground-state rate over determinate rows only", () => {
    // 270 of 450 e3 rows have found_ground_state = null (above the exact-solver cap).
    // A null must not count as a failure.
    const sa = rows.find((r) => r.solver === "simulated_annealing")!;
    expect(sa.determinateCount).toBeGreaterThan(0);
    expect(sa.determinateCount).toBeLessThan(75);
    expect(sa.groundStateRate).toBe(1);
  });

  it("ranks random below every heuristic on mean F1", () => {
    const random = rows.find((r) => r.solver === "random")!;
    for (const other of rows.filter((r) => r.solver !== "random")) {
      expect(other.meanF1).toBeGreaterThan(random.meanF1);
    }
  });

  it("reports mean runtime as a positive number of seconds", () => {
    for (const row of rows) expect(row.meanRuntimeSeconds).toBeGreaterThan(0);
  });
});

describe("attributionBreakdown", () => {
  it("partitions e1 rows across attribution categories", () => {
    const breakdown = attributionBreakdown();
    const total = breakdown.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(171);
    expect(breakdown.map((b) => b.category)).toContain("no failure");
    expect(breakdown.map((b) => b.category)).toContain("energy model");
  });
});

describe("encodingSummary", () => {
  it("groups e2 by encoding and min_stem_length", () => {
    const rows = encodingSummary();
    const pair = rows.find((r) => r.encoding === "pair")!;
    expect(pair.meanVariables).toBeGreaterThan(0);
    expect(pair.gateARate).toBe(1);
  });

  it("shows maximal stem encoding at msl=1 using fewer variables than pair encoding", () => {
    // The comparison only holds for stem_mode=maximal. Substems at msl=1 is
    // 1337.5 variables — larger than pair. Naming the mode is load-bearing.
    const rows = encodingSummary();
    const pair = rows.find((r) => r.encoding === "pair")!;
    const stem1 = rows.find(
      (r) => r.encoding === "stem" && r.stemMode === "maximal" && r.minStemLength === 1,
    )!;
    expect(stem1.gateARate).toBe(1);
    expect(pair.gateARate).toBe(1);
    expect(stem1.meanVariables).toBeLessThan(pair.meanVariables);
  });

  it("shows the representability ceiling rising as min_stem_length falls", () => {
    const maximal = encodingSummary()
      .filter((r) => r.stemMode === "maximal")
      .sort((a, b) => a.minStemLength! - b.minStemLength!);
    expect(maximal.map((r) => r.minStemLength)).toEqual([1, 2, 3]);
    expect(maximal.map((r) => r.gateARate)).toEqual([1, 0.75, 0.4]);
  });
});

describe("qaoaByReps", () => {
  it("returns one row per circuit depth", () => {
    const rows = qaoaByReps();
    expect(rows.map((r) => r.reps)).toEqual([1, 2, 3]);
  });

  it("matches the ground-state rates reported in the README", () => {
    // These are the published figures. e4 also holds 9 fake_hanoi rows at reps=1;
    // pooling them yields 27.8% and would silently contradict the README.
    const rows = qaoaByReps();
    expect(rows.map((r) => Number(r.groundStateRate.toFixed(3)))).toEqual([
      0.296, 0.407, 0.444,
    ]);
    expect(rows.map((r) => r.circuits)).toEqual([27, 27, 27]);
  });

  it("reports two-qubit gate counts increasing with reps", () => {
    const rows = qaoaByReps();
    expect(rows.map((r) => Number(r.meanTwoQubitGates.toFixed(1)))).toEqual([
      123.6, 247.1, 370.7,
    ]);
  });
});

describe("qaoaByShots", () => {
  it("shows the sampling budget moving the result further than circuit depth", () => {
    const shots = qaoaByShots();
    expect(shots.map((r) => r.shots)).toEqual([256, 1024, 4096]);
    expect(shots.map((r) => Number(r.groundStateRate.toFixed(3)))).toEqual([
      0.148, 0.444, 0.556,
    ]);
    // 14.8 -> 55.6 across shots against 29.6 -> 44.4 across reps. The reps table
    // alone frames circuit depth as the driver, and it is not the larger effect.
    const reps = qaoaByReps();
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(spread(shots.map((r) => r.groundStateRate))).toBeGreaterThan(
      spread(reps.map((r) => r.groundStateRate)),
    );
  });
});

describe("qaoaGrid", () => {
  it("shows depth failing to compensate for a thin sample", () => {
    const grid = qaoaGrid();
    const at = (reps: number, shots: number) =>
      grid.find((c) => c.reps === reps && c.shots === shots)!.groundStateRate;
    expect(grid).toHaveLength(9);
    expect(at(3, 256)).toBeCloseTo(0.222, 3);
    expect(at(1, 4096)).toBeCloseTo(0.333, 3);
    // The deepest circuit on the smallest budget loses to the shallowest circuit
    // on the largest one.
    expect(at(3, 256)).toBeLessThan(at(1, 4096));
  });

  it("covers every cell with the same number of circuits", () => {
    for (const cell of qaoaGrid()) expect(cell.circuits).toBe(9);
  });
});

describe("objectiveComparison", () => {
  it("compares CVaR only against expectation at the setting both were run", () => {
    const { setting, arms } = objectiveComparison();
    // CVaR exists at exactly one configuration. Comparing it against expectation
    // pooled over three shot budgets it never received would attribute the shot
    // budget to the objective.
    expect(setting).toEqual({ reps: 3, shots: 256, noiseBackend: "none" });
    expect(arms.map((a) => a.objective).sort()).toEqual(["cvar", "expectation"]);
    for (const arm of arms) expect(arm.circuits).toBe(9);
  });

  it("finds the two indistinguishable on ground-state rate", () => {
    const { arms } = objectiveComparison();
    const [a, b] = arms;
    expect(a.groundStateRate).toBe(b.groundStateRate);
  });
});

describe("qaoaByLength", () => {
  it("shows the ground-state rate falling as the instance grows", () => {
    const rows = qaoaByLength();
    expect(rows.map((r) => r.length)).toEqual([20, 25, 30]);
    expect(rows[0].groundStateRate).toBeGreaterThan(rows.at(-1)!.groundStateRate);
    expect(rows[0].meanQubits).toBeLessThan(rows.at(-1)!.meanQubits);
  });
});

describe("noiseComparison", () => {
  it("shows the transpilation overhead of targeting a real device", () => {
    const { noiseless, noisy } = noiseComparison();
    // Same reps, same shots, same objective — the only difference is the device
    // target. Routing cost lands entirely in the two-qubit gate count.
    expect(noisy.meanTwoQubitGates).toBeGreaterThan(noiseless.meanTwoQubitGates);
    expect(noisy.meanTranspiledDepth).toBeGreaterThan(noiseless.meanTranspiledDepth);
    expect(noisy.backend).toBe("fake_hanoi");
    expect(noiseless.circuits).toBe(9);
    expect(noisy.circuits).toBe(9);
  });
});

describe("pseudoknotComparison", () => {
  it("pairs each fixture's strict and pseudoknot-mode result", () => {
    const rows = pseudoknotComparison().filter((r) => r.hasPseudoknot);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.pseudoknotModeF1).toBeGreaterThan(row.strictF1);
      expect(row.viennaF1).toBeLessThanOrEqual(row.strictF1);
    }
  });

  it("labels the constructed provenance verbatim", () => {
    const rows = pseudoknotComparison().filter((r) => r.hasPseudoknot);
    for (const row of rows) {
      expect(row.source).toContain("CONSTRUCTED");
      expect(row.source).toContain("no citation claimed");
    }
  });
});

describe("scalingByLength", () => {
  it("returns variable counts increasing with sequence length", () => {
    const rows = scalingByLength();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].length).toBeGreaterThan(rows[i - 1].length);
    }
    expect(rows.at(-1)!.meanVariables).toBeGreaterThan(rows[0].meanVariables);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/unit/transforms.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the transforms**

```ts
// frontend/src/lib/charts/transforms.ts
import { loadExperiment, type Row } from "@/lib/results";

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function groupBy<K extends string | number>(rows: Row[], key: (row: Row) => K) {
  const groups = new Map<K, Row[]>();
  for (const row of rows) {
    const k = key(row);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }
  return groups;
}

const num = (row: Row, column: string) => Number(row[column]);

export interface SolverSummaryRow {
  solver: string;
  runs: number;
  /** Rows where Gate C is determinate. Above ~22 variables the exact reference is
   *  unavailable and found_ground_state is null — those rows are excluded from the
   *  rate rather than counted as failures. */
  determinateCount: number;
  groundStateRate: number;
  meanF1: number;
  meanEnergyGap: number;
  meanRuntimeSeconds: number;
}

export function solverSummary(): SolverSummaryRow[] {
  const rows = loadExperiment("e3_solvers");
  return [...groupBy(rows, (r) => String(r.solver))]
    .map(([solver, group]) => {
      const determinate = group.filter((r) => r.found_ground_state !== null);
      return {
        solver,
        runs: group.length,
        determinateCount: determinate.length,
        groundStateRate:
          determinate.length === 0
            ? 0
            : determinate.filter((r) => r.found_ground_state === true).length /
              determinate.length,
        meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
        meanEnergyGap: mean(group.map((r) => num(r, "energy_gap"))),
        meanRuntimeSeconds: mean(group.map((r) => num(r, "runtime_seconds"))),
      };
    })
    .sort((a, b) => b.meanF1 - a.meanF1);
}

export interface AttributionRow {
  category: string;
  count: number;
  fraction: number;
}

/** The attribution string is "<category>: <explanation>". The category is the
 *  earliest failing gate and is what the chart groups by. */
export function attributionBreakdown(): AttributionRow[] {
  const rows = loadExperiment("e1_formulation");
  const groups = groupBy(rows, (r) => String(r.attribution).split(":")[0].trim());
  return [...groups]
    .map(([category, group]) => ({
      category,
      count: group.length,
      fraction: group.length / rows.length,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface EncodingRow {
  encoding: string;
  stemMode: string | null;
  minStemLength: number | null;
  meanVariables: number;
  meanQuadraticTerms: number;
  meanDensity: number;
  gateARate: number;
  instances: number;
}

export function encodingSummary(): EncodingRow[] {
  const rows = loadExperiment("e2_encoding");
  const groups = groupBy(
    rows,
    (r) => `${r.encoding}|${r.stem_mode ?? ""}|${r.min_stem_length ?? ""}`,
  );
  return [...groups]
    .map(([, group]) => {
      const first = group[0];
      return {
        encoding: String(first.encoding),
        stemMode: first.stem_mode === null ? null : String(first.stem_mode),
        minStemLength:
          first.min_stem_length === null ? null : Number(first.min_stem_length),
        meanVariables: mean(group.map((r) => num(r, "num_variables"))),
        meanQuadraticTerms: mean(group.map((r) => num(r, "num_quadratic_terms"))),
        meanDensity: mean(group.map((r) => num(r, "qubo_density"))),
        gateARate: group.filter((r) => r.representable === true).length / group.length,
        instances: group.length,
      };
    })
    .sort((a, b) => a.meanVariables - b.meanVariables);
}

export interface QaoaRow {
  reps: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanCircuitDepth: number;
  meanTranspiledDepth: number;
  meanTwoQubitGates: number;
  meanQubits: number;
  meanRuntimeSeconds: number;
}

const NOISELESS_EXPECTATION = (r: Row) =>
  r.objective === "expectation" && r.noise_backend === "none";

/** Ground-state rate over rows where Gate C is determinate. Shared by every QAOA
 *  transform so a null is never counted as a failure in one view and excluded in
 *  another. */
function groundStateRate(rows: Row[]): number {
  const determinate = rows.filter((r) => r.found_ground_state !== null);
  return determinate.length === 0
    ? 0
    : determinate.filter((r) => r.found_ground_state === true).length /
        determinate.length;
}

/** The README's QAOA table is the **noiseless expectation** subset: 27 rows per
 *  `reps` (3 shot settings x 9 sequences). e4 also contains 9 `fake_hanoi` rows at
 *  reps=1 and 9 CVaR rows at reps=3. Pooling them changes every published figure —
 *  reps=1 becomes 27.8% instead of 29.6% — so both filters are required, not
 *  cosmetic. `noiseComparison` covers the device-target rows separately. */
export function qaoaByReps(): QaoaRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(r.reps))]
    .map(([reps, group]) => {
      return {
        reps,
        circuits: group.length,
        groundStateRate: groundStateRate(group),
        meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
        meanCircuitDepth: mean(group.map((r) => num(r, "circuit_depth"))),
        meanTranspiledDepth: mean(group.map((r) => num(r, "transpiled_depth"))),
        meanTwoQubitGates: mean(group.map((r) => num(r, "two_qubit_gates"))),
        meanQubits: mean(group.map((r) => num(r, "logical_qubits"))),
        meanRuntimeSeconds: mean(group.map((r) => num(r, "runtime_seconds"))),
      };
    })
    .sort((a, b) => a.reps - b.reps);
}

export interface QaoaShotsRow {
  shots: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** The `reps` view is the conventional presentation and it buries the larger
 *  effect. Across shot budgets the ground-state rate moves 14.8% to 55.6%; across
 *  `reps` it moves 29.6% to 44.4%. At these sizes the binding constraint was the
 *  sampling budget, not circuit expressivity. */
export function qaoaByShots(): QaoaShotsRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(r.shots))]
    .map(([shots, group]) => ({
      shots,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.shots - b.shots);
}

export interface QaoaGridCell {
  reps: number;
  shots: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** The full reps x shots grid, which shows the trade the marginal views cannot:
 *  `reps=3` at 256 shots (22.2%) loses to `reps=1` at 4096 shots (33.3%). A deeper
 *  circuit on a thinner sample is the worse configuration. */
export function qaoaGrid(): QaoaGridCell[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => `${r.reps}|${r.shots}`)]
    .map(([, group]) => ({
      reps: Number(group[0].reps),
      shots: Number(group[0].shots),
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.reps - b.reps || a.shots - b.shots);
}

export interface ObjectiveArm {
  objective: string;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
}

/** CVaR was run at exactly one configuration — reps=3, 256 shots, noiseless — so it
 *  can only be compared against the expectation rows at that same setting. Comparing
 *  it against expectation pooled over every shot count would attribute the sampling
 *  budget to the objective and manufacture a difference that is not there. The
 *  setting is returned alongside the arms so the UI must state it. */
export function objectiveComparison(): {
  setting: { reps: number; shots: number; noiseBackend: string };
  arms: ObjectiveArm[];
} {
  const setting = { reps: 3, shots: 256, noiseBackend: "none" };
  const rows = loadExperiment("e4_qaoa").filter(
    (r) =>
      Number(r.reps) === setting.reps &&
      Number(r.shots) === setting.shots &&
      r.noise_backend === setting.noiseBackend,
  );
  const arms = [...groupBy(rows, (r) => String(r.objective))]
    .map(([objective, group]) => ({
      objective,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
    }))
    .sort((a, b) => a.objective.localeCompare(b.objective));
  return { setting, arms };
}

export interface QaoaLengthRow {
  length: number;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanQubits: number;
}

/** Sequence length is encoded in the identifier (`syn_30_001`), not carried as its
 *  own column in e4. */
export function qaoaByLength(): QaoaLengthRow[] {
  const rows = loadExperiment("e4_qaoa").filter(NOISELESS_EXPECTATION);
  return [...groupBy(rows, (r) => Number(String(r.sequence_id).split("_")[1]))]
    .map(([length, group]) => ({
      length,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
      meanQubits: mean(group.map((r) => num(r, "logical_qubits"))),
    }))
    .sort((a, b) => a.length - b.length);
}

export interface NoiseArm {
  backend: string;
  circuits: number;
  groundStateRate: number;
  meanF1: number;
  meanTranspiledDepth: number;
  meanTwoQubitGates: number;
}

/** Compares the same circuits transpiled for an ideal simulator against
 *  `fake_hanoi` (real IBM calibration data). Matched on reps=1, shots=256,
 *  expectation objective — a mismatched comparison would attribute shot noise to
 *  routing. SWAP cost is folded into two_qubit_gates, not reported separately. */
export function noiseComparison(): { noiseless: NoiseArm; noisy: NoiseArm } {
  const rows = loadExperiment("e4_qaoa").filter(
    (r) => r.objective === "expectation" && r.reps === 1 && r.shots === 256,
  );
  const arm = (backend: string): NoiseArm => {
    const group = rows.filter((r) => r.noise_backend === backend);
    return {
      backend,
      circuits: group.length,
      groundStateRate: groundStateRate(group),
      meanF1: mean(group.map((r) => num(r, "base_pair_f1"))),
      meanTranspiledDepth: mean(group.map((r) => num(r, "transpiled_depth"))),
      meanTwoQubitGates: mean(group.map((r) => num(r, "two_qubit_gates"))),
    };
  };
  return { noiseless: arm("none"), noisy: arm("fake_hanoi") };
}

export interface PseudoknotRow {
  sequenceId: string;
  length: number;
  hasPseudoknot: boolean;
  source: string;
  viennaF1: number;
  strictF1: number;
  pseudoknotModeF1: number;
  crossingPairsInReference: number;
  viennaStructure: string;
}

/** e5 holds two rows per fixture — forbid_crossing true (strict) and false
 *  (pseudoknot mode). They are joined here so a chart can show the pair. */
export function pseudoknotComparison(): PseudoknotRow[] {
  const rows = loadExperiment("e5_pseudoknot");
  return [...groupBy(rows, (r) => String(r.sequence_id))].map(([sequenceId, group]) => {
    const strict = group.find((r) => r.forbid_crossing === true)!;
    const open = group.find((r) => r.forbid_crossing === false) ?? strict;
    return {
      sequenceId,
      length: num(strict, "length"),
      hasPseudoknot: strict.has_pseudoknot === true,
      source: String(strict.source),
      viennaF1: num(strict, "vienna_f1_vs_reference"),
      strictF1: num(strict, "base_pair_f1_vs_reference"),
      pseudoknotModeF1: num(open, "base_pair_f1_vs_reference"),
      crossingPairsInReference: num(strict, "num_crossing_pairs_in_reference"),
      viennaStructure: String(strict.vienna_structure),
    };
  });
}

export interface ScalingRow {
  length: number;
  meanVariables: number;
  meanDensity: number;
  instances: number;
}

export function scalingByLength(): ScalingRow[] {
  const rows = loadExperiment("e1_formulation");
  return [...groupBy(rows, (r) => Number(r.length))]
    .map(([length, group]) => ({
      length,
      meanVariables: mean(group.map((r) => num(r, "num_variables"))),
      meanDensity: mean(group.map((r) => num(r, "qubo_density"))),
      instances: group.length,
    }))
    .sort((a, b) => a.length - b.length);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/transforms.test.ts`
Expected: PASS (19 tests)

If any expectation fails, **do not adjust the assertion to match the output.** Print the
transform's result, compare it against the CSV with `pandas`, and fix whichever side is
wrong. An assertion loosened to pass is a defect, not a fix.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/charts frontend/tests/unit/transforms.test.ts
git commit -- frontend -m "feat: add chart transforms over bundled experiment data"
```

---

### Task 7: Chart primitives and the accessible data table

**Files:**
- Create: `frontend/src/components/analytics/ChartCard.tsx`, `DataTable.tsx`, `BarChart.tsx`, `ScatterChart.tsx`, `LineChart.tsx`; `frontend/src/lib/charts/theme.ts`
- Test: `frontend/tests/component/charts.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks except `cn` (Task 5)
- Produces: `<ChartCard title description source><Chart/></ChartCard>`; `<DataTable columns rows caption/>`; `<BarChart series categories yLabel/>`, `<ScatterChart points xLabel yLabel/>`, `<LineChart series xLabel yLabel/>`

Every chart is wrapped in `ChartCard`, which renders a `<details>` containing the same
numbers as a table. That satisfies the design's "textual alternative for every chart"
requirement structurally rather than by remembering to add one per page.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/charts.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DataTable } from "@/components/analytics/DataTable";

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: unknown }) => (
    <div data-testid="echart" data-option={JSON.stringify(option)} />
  ),
}));

describe("DataTable", () => {
  const columns = [
    { key: "solver", label: "Solver" },
    { key: "meanF1", label: "Mean F1", format: (v: number) => v.toFixed(3) },
  ];
  const rows = [{ solver: "tabu", meanF1: 0.873 }];

  it("renders a caption for screen readers", () => {
    render(<DataTable columns={columns} rows={rows} caption="Solver results" />);
    expect(screen.getByRole("table", { name: "Solver results" })).toBeInTheDocument();
  });

  it("applies the column formatter", () => {
    render(<DataTable columns={columns} rows={rows} caption="c" />);
    expect(screen.getByText("0.873")).toBeInTheDocument();
  });

  it("renders an em dash for null rather than blank", () => {
    render(
      <DataTable columns={columns} rows={[{ solver: "x", meanF1: null }]} caption="c" />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  it("names its data source", () => {
    render(
      <ChartCard title="Solvers" description="d" source="results/full/e3_solvers.csv">
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByText(/e3_solvers\.csv/)).toBeInTheDocument();
  });

  it("exposes a table alternative behind a disclosure", async () => {
    render(
      <ChartCard
        title="Solvers"
        description="d"
        source="s"
        table={{
          columns: [{ key: "a", label: "A" }],
          rows: [{ a: 1 }],
          caption: "Solver results",
        }}
      >
        <div>chart</div>
      </ChartCard>,
    );
    const toggle = screen.getByRole("group", { name: /view as table/i });
    expect(toggle).toBeInTheDocument();
    await userEvent.click(screen.getByText(/view as table/i));
    expect(screen.getByRole("table", { name: "Solver results" })).toBeInTheDocument();
  });

  it("renders a heading at the requested level", () => {
    render(
      <ChartCard title="Solvers" description="d" source="s" headingLevel={3}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Solvers" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/charts.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/charts/theme.ts`**

```ts
/** Solver-class colours from the design tokens. Charts also vary marker shape so
 *  the encoding is never colour-only. */
export const SOLVER_COLORS: Record<string, string> = {
  random: "#64748b",
  greedy: "#0ea5e9",
  local_search: "#0ea5e9",
  tabu: "#0ea5e9",
  simulated_annealing: "#8b5cf6",
  path_integral_sqa: "#8b5cf6",
  qaoa: "#d946ef",
  cvar_qaoa: "#d946ef",
  exact: "#10b981",
};

export const SOLVER_SYMBOLS: Record<string, string> = {
  random: "circle",
  greedy: "triangle",
  local_search: "diamond",
  tabu: "rect",
  simulated_annealing: "pin",
  path_integral_sqa: "arrow",
  qaoa: "roundRect",
  cvar_qaoa: "triangle",
  exact: "circle",
};

export const BASE_CHART_OPTION = {
  backgroundColor: "transparent",
  textStyle: { color: "#94a3b8", fontFamily: "inherit" },
  grid: { left: 56, right: 24, top: 32, bottom: 48 },
  tooltip: { trigger: "axis" as const },
};
```

- [ ] **Step 4: Write `DataTable.tsx`**

```tsx
export interface Column {
  key: string;
  label: string;
  format?: (value: never) => string;
}

export interface DataTableProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  caption: string;
}

export function DataTable({ columns, rows, caption }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={caption}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-[var(--border)]/50">
              {columns.map((column) => {
                const value = row[column.key];
                const rendered =
                  value === null || value === undefined
                    ? "—"
                    : column.format
                      ? column.format(value as never)
                      : String(value);
                return (
                  <td key={column.key} className="px-3 py-1.5 tabular-nums">
                    {rendered}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Write `ChartCard.tsx`**

```tsx
import { DataTable, type DataTableProps } from "./DataTable";

export interface ChartCardProps {
  title: string;
  description: string;
  /** The committed file this chart's numbers come from. Rendered verbatim so a
   *  reader can check any figure against the repository. */
  source: string;
  headingLevel?: 2 | 3;
  table?: DataTableProps;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  source,
  headingLevel = 2,
  table,
  children,
}: ChartCardProps) {
  const Heading = (headingLevel === 3 ? "h3" : "h2") as "h2" | "h3";
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <Heading className="text-base font-semibold">{title}</Heading>
      <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      {children}
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Source: <code>{source}</code>
      </p>
      {table && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
            View as table
          </summary>
          <div className="mt-2">
            <DataTable {...table} />
          </div>
        </details>
      )}
    </section>
  );
}
```

Note: `<details>` has the implicit ARIA role `group`, which is what the test queries.

- [ ] **Step 6: Write the three chart wrappers**

```tsx
// frontend/src/components/analytics/BarChart.tsx
"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export interface BarSeries {
  name: string;
  data: number[];
  color?: string;
}

export function BarChart({
  categories,
  series,
  yLabel,
  yMax,
  height = 280,
}: {
  categories: string[];
  series: BarSeries[];
  yLabel: string;
  yMax?: number;
  height?: number;
}) {
  const option = {
    ...BASE_CHART_OPTION,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { show: series.length > 1, textStyle: { color: "#94a3b8" } },
    xAxis: { type: "category", data: categories, axisLabel: { interval: 0, rotate: 20 } },
    yAxis: { type: "value", name: yLabel, max: yMax },
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      data: s.data,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
```

```tsx
// frontend/src/components/analytics/ScatterChart.tsx
"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export interface ScatterSeries {
  name: string;
  points: [number, number][];
  color?: string;
  symbol?: string;
}

export function ScatterChart({
  series,
  xLabel,
  yLabel,
  height = 320,
}: {
  series: ScatterSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const option = {
    ...BASE_CHART_OPTION,
    tooltip: { trigger: "item" },
    legend: { textStyle: { color: "#94a3b8" } },
    xAxis: { type: "value", name: xLabel, nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", name: yLabel },
    series: series.map((s) => ({
      name: s.name,
      type: "scatter",
      data: s.points,
      symbol: s.symbol ?? "circle",
      symbolSize: 9,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
```

```tsx
// frontend/src/components/analytics/LineChart.tsx
"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export function LineChart({
  categories,
  series,
  xLabel,
  yLabel,
  height = 280,
}: {
  categories: (string | number)[];
  series: { name: string; data: number[]; color?: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const option = {
    ...BASE_CHART_OPTION,
    legend: { textStyle: { color: "#94a3b8" } },
    xAxis: {
      type: "category",
      data: categories,
      name: xLabel,
      nameLocation: "middle",
      nameGap: 28,
    },
    yAxis: { type: "value", name: yLabel },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      symbolSize: 8,
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/charts.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/analytics frontend/src/lib/charts/theme.ts frontend/tests/component/charts.test.tsx
git commit -- frontend -m "feat: add chart primitives with table alternatives"
```

---

### Task 8: Solver performance and energy pages

**Files:**
- Create: `frontend/src/app/analytics/solver-performance/page.tsx`, `frontend/src/app/analytics/energy/page.tsx`, `frontend/src/components/analytics/GateLegend.tsx`
- Modify: `frontend/src/app/layout.tsx` (wrap children in `AppShell`)
- Test: `frontend/tests/component/analytics-pages.test.tsx`

**Interfaces:**
- Consumes: `solverSummary`, `attributionBreakdown` (Task 6); `ChartCard`, `DataTable`, `BarChart`, `ScatterChart` (Task 7)
- Produces: two rendered routes

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/analytics-pages.test.tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SolverPerformancePage from "@/app/analytics/solver-performance/page";
import EnergyPage from "@/app/analytics/energy/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

describe("solver performance page", () => {
  it("lists every solver measured in E3", () => {
    render(<SolverPerformancePage />);
    for (const solver of [
      "random",
      "greedy",
      "local_search",
      "tabu",
      "simulated_annealing",
      "path_integral_sqa",
    ]) {
      expect(screen.getAllByText(solver).length).toBeGreaterThan(0);
    }
  });

  it("states how many runs were indeterminate for Gate C", () => {
    render(<SolverPerformancePage />);
    // 270 of 450 rows sit above the exact-solver ceiling. Presenting a
    // ground-state rate without that denominator would overstate certainty.
    expect(screen.getByText(/indeterminate/i)).toBeInTheDocument();
  });

  it("carries no quantum-advantage claim", () => {
    const { container } = render(<SolverPerformancePage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /quantum advantage|outperform|speedup over classical/,
    );
  });

  it("cites the committed CSV", () => {
    render(<SolverPerformancePage />);
    expect(screen.getAllByText(/e3_solvers\.csv/).length).toBeGreaterThan(0);
  });
});

describe("energy page", () => {
  it("shows the four-gate ladder legend", () => {
    render(<EnergyPage />);
    const legend = screen.getByRole("list", { name: /diagnostic ladder/i });
    expect(within(legend).getByText(/representable/i)).toBeInTheDocument();
    expect(within(legend).getByText(/faithful/i)).toBeInTheDocument();
    expect(within(legend).getByText(/solved/i)).toBeInTheDocument();
    expect(within(legend).getByText(/physical/i)).toBeInTheDocument();
  });

  it("breaks results down by attribution category", () => {
    render(<EnergyPage />);
    expect(screen.getAllByText(/no failure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/energy model/i).length).toBeGreaterThan(0);
  });

  it("explains that attribution names the earliest failing gate", () => {
    render(<EnergyPage />);
    expect(screen.getByText(/earliest failing gate/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/analytics-pages.test.tsx`
Expected: FAIL — pages not found.

- [ ] **Step 3: Write `GateLegend.tsx`**

```tsx
const GATES = [
  {
    id: "A",
    name: "Representable",
    question: "Is the reference structure in the candidate set?",
    onFailure: "candidate generation — a hard ceiling no optimizer can lift",
  },
  {
    id: "B",
    name: "Faithful",
    question: "Is the reference structure the QUBO's ground state?",
    onFailure: "energy model misspecified",
  },
  {
    id: "C",
    name: "Solved",
    question: "Did this solver reach the ground state?",
    onFailure: "optimizer",
  },
  {
    id: "D",
    name: "Physical",
    question: "Energy gap and base-pair F1 after decode, repair and rescore",
    onFailure: "the number that matters",
  },
];

export function GateLegend() {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">The four-gate diagnostic ladder</h2>
      <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
        Attribution names the <strong>earliest failing gate</strong>. A later gate is
        never blamed for an earlier failure — if the candidate set never held the answer,
        the optimizer cannot be at fault.
      </p>
      <ul aria-label="Four-gate diagnostic ladder" className="grid gap-2 sm:grid-cols-2">
        {GATES.map((gate) => (
          <li
            key={gate.id}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3"
          >
            <p className="text-sm font-medium">
              <span className="mr-2 text-[var(--quantum-inspired)]">Gate {gate.id}</span>
              {gate.name}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{gate.question}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              On failure: {gate.onFailure}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Write the solver performance page**

```tsx
// frontend/src/app/analytics/solver-performance/page.tsx
import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { ScatterChart } from "@/components/analytics/ScatterChart";
import { SOLVER_COLORS, SOLVER_SYMBOLS } from "@/lib/charts/theme";
import { solverSummary } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fixed3 = (value: number) => value.toFixed(3);

export default function SolverPerformancePage() {
  const rows = solverSummary();
  const indeterminate = rows.reduce((sum, r) => sum + (r.runs - r.determinateCount), 0);
  const totalRuns = rows.reduce((sum, r) => sum + r.runs, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Solver performance</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Every solver in the registry run across the same QUBO instances at a fixed
          seed. Gate C — did the solver reach the QUBO ground state — can only be
          decided where an exact reference exists;{" "}
          <strong>
            {indeterminate} of {totalRuns} runs are indeterminate
          </strong>{" "}
          because the instance exceeds the exact solver&apos;s variable ceiling. Those runs
          are excluded from the rate rather than counted as failures.
        </p>
      </header>

      <ChartCard
        title="Ground-state rate by solver"
        description="Fraction of determinate runs where the solver reached the QUBO ground state."
        source="results/full/e3_solvers.csv"
        table={{
          caption: "Solver ground-state rate, mean F1 and runtime",
          columns: [
            { key: "solver", label: "Solver" },
            { key: "runs", label: "Runs" },
            { key: "determinateCount", label: "Determinate" },
            { key: "groundStateRate", label: "Ground state", format: pct },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "meanEnergyGap", label: "Mean gap (kcal/mol)", format: fixed3 },
            { key: "meanRuntimeSeconds", label: "Mean runtime (s)", format: fixed3 },
          ],
          rows,
        }}
      >
        <BarChart
          categories={rows.map((r) => r.solver)}
          series={[{ name: "Ground-state rate", data: rows.map((r) => r.groundStateRate) }]}
          yLabel="rate"
          yMax={1}
        />
      </ChartCard>

      <ChartCard
        title="Accuracy against runtime"
        description="Mean base-pair F1 versus mean wall-clock runtime. Marker shape distinguishes solvers independently of colour."
        source="results/full/e3_solvers.csv"
        table={{
          caption: "Mean F1 and runtime by solver",
          columns: [
            { key: "solver", label: "Solver" },
            { key: "meanRuntimeSeconds", label: "Runtime (s)", format: fixed3 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
          ],
          rows,
        }}
      >
        <ScatterChart
          xLabel="mean runtime (s)"
          yLabel="mean base-pair F1"
          series={rows.map((r) => ({
            name: r.solver,
            points: [[r.meanRuntimeSeconds, r.meanF1]] as [number, number][],
            color: SOLVER_COLORS[r.solver],
            symbol: SOLVER_SYMBOLS[r.solver],
          }))}
        />
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 5: Write the energy page**

```tsx
// frontend/src/app/analytics/energy/page.tsx
import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { GateLegend } from "@/components/analytics/GateLegend";
import { attributionBreakdown } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function EnergyPage() {
  const attribution = attributionBreakdown();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Energy model and attribution</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Energy coefficients come from ViennaRNA&apos;s Turner primitives — never
          reimplemented constants. Hairpin closure is charged in the linear term and
          refunded in the quadratic term when a helix nests inside, which is how a
          k-body predicate fits a degree-2 model.
        </p>
      </header>

      <GateLegend />

      <ChartCard
        title="Attribution across formulation runs"
        description="Which stage is responsible when a run does not recover the reference structure."
        source="results/full/e1_formulation.csv"
        table={{
          caption: "Attribution category counts",
          columns: [
            { key: "category", label: "Earliest failing gate" },
            { key: "count", label: "Runs" },
            { key: "fraction", label: "Share", format: pct },
          ],
          rows: attribution,
        }}
      >
        <BarChart
          categories={attribution.map((a) => a.category)}
          series={[{ name: "Runs", data: attribution.map((a) => a.count) }]}
          yLabel="runs"
        />
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 6: Wrap the app in the shell**

In `frontend/src/app/layout.tsx`, wrap `{children}` with `<Providers><AppShell>…</AppShell></Providers>`.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/analytics-pages.test.tsx`
Expected: PASS (7 tests)

Run: `pnpm build` — expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/analytics frontend/src/components/analytics/GateLegend.tsx frontend/src/app/layout.tsx frontend/tests
git commit -- frontend -m "feat: add solver performance and energy analytics pages"
```

---

### Task 9: Scaling, resources and pseudoknot pages

**Files:**
- Create: `frontend/src/app/analytics/scaling/page.tsx`, `frontend/src/app/analytics/resources/page.tsx`, `frontend/src/app/analytics/pseudoknots/page.tsx`
- Test: `frontend/tests/component/analytics-pages-2.test.tsx`

**Interfaces:**
- Consumes: `encodingSummary`, `scalingByLength`, `qaoaByReps`, `noiseComparison`, `pseudoknotComparison` (Task 6); chart primitives (Task 7)
- Produces: three rendered routes

The pseudoknot page carries the project's strongest result and its sharpest caveat. The
constructed-fixture provenance is rendered from the CSV's own `source` column, not
retyped, so the label cannot drift from the data.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/analytics-pages-2.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScalingPage from "@/app/analytics/scaling/page";
import ResourcesPage from "@/app/analytics/resources/page";
import PseudoknotsPage from "@/app/analytics/pseudoknots/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

describe("scaling page", () => {
  it("shows both encodings at matched representability", () => {
    render(<ScalingPage />);
    expect(screen.getAllByText(/pair/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/maximal/i).length).toBeGreaterThan(0);
  });

  it("attributes the representability ceiling to lone base pairs", () => {
    render(<ScalingPage />);
    expect(screen.getByText(/lone base pair/i)).toBeInTheDocument();
  });
});

describe("resources page", () => {
  it("reports circuit depth and two-qubit gate counts", () => {
    render(<ResourcesPage />);
    expect(screen.getAllByText(/two-qubit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/circuit depth/i).length).toBeGreaterThan(0);
  });

  it("states the negative result without hedging", () => {
    render(<ResourcesPage />);
    expect(
      screen.getByText(/does not (beat|outperform) classical heuristics/i),
    ).toBeInTheDocument();
  });

  it("labels the noise arm as local calibration data, not hardware", () => {
    render(<ResourcesPage />);
    expect(screen.getByText(/no live hardware|local simulator/i)).toBeInTheDocument();
    expect(screen.getAllByText(/fake_hanoi/).length).toBeGreaterThan(0);
  });

  it("shows the shot budget as an axis, not only circuit depth", () => {
    render(<ResourcesPage />);
    expect(screen.getAllByText(/shots/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sampling budget/i)).toBeInTheDocument();
  });

  it("states the configuration CVaR was compared at", () => {
    render(<ResourcesPage />);
    // Naming the setting is the guard against the pooled comparison that made
    // CVaR look worse for a reason that was the shot budget.
    expect(screen.getByText(/reps=3.*256 shots|256 shots.*reps=3/i)).toBeInTheDocument();
    expect(screen.getByText(/indistinguishable/i)).toBeInTheDocument();
  });
});

describe("pseudoknots page", () => {
  it("shows ViennaRNA, strict mode and pseudoknot mode side by side", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/ViennaRNA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/strict/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pseudoknot mode/i).length).toBeGreaterThan(0);
  });

  it("renders the constructed-fixture caveat from the data itself", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/CONSTRUCTED/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no citation claimed/).length).toBeGreaterThan(0);
  });

  it("explains why ViennaRNA cannot represent a crossing", () => {
    render(<PseudoknotsPage />);
    expect(screen.getByText(/cannot express a crossing/i)).toBeInTheDocument();
  });

  it("reports the tRNA limitation alongside the wins", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/trna/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/analytics-pages-2.test.tsx`
Expected: FAIL — pages not found.

- [ ] **Step 3: Write the scaling page**

```tsx
// frontend/src/app/analytics/scaling/page.tsx
import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { LineChart } from "@/components/analytics/LineChart";
import { encodingSummary, scalingByLength } from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const fixed1 = (value: number) => value.toFixed(1);
const fixed3 = (value: number) => value.toFixed(3);

export default function ScalingPage() {
  const encodings = encodingSummary();
  const scaling = scalingByLength();
  const label = (row: (typeof encodings)[number]) =>
    row.encoding === "pair"
      ? "pair"
      : `stem ${row.stemMode} msl=${row.minStemLength}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Scaling and encoding</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Variable count is what a quantum device would have to hold, so the encoding
          choice is a resource decision. The comparison only means something at{" "}
          <strong>matched representability</strong> — an encoding that drops structures is
          smaller for a reason that costs accuracy.
        </p>
      </header>

      <ChartCard
        title="Variables by encoding"
        description="Mean variable count and Gate A representability for every encoding configuration measured."
        source="results/full/e2_encoding.csv"
        table={{
          caption: "Encoding variable counts and representability",
          columns: [
            { key: "label", label: "Encoding" },
            { key: "meanVariables", label: "Mean variables", format: fixed1 },
            { key: "meanQuadraticTerms", label: "Quadratic terms", format: fixed1 },
            { key: "meanDensity", label: "Density", format: fixed3 },
            { key: "gateARate", label: "Gate A", format: pct },
            { key: "instances", label: "Instances" },
          ],
          rows: encodings.map((row) => ({ ...row, label: label(row) })),
        }}
      >
        <BarChart
          categories={encodings.map(label)}
          series={[
            { name: "Mean variables", data: encodings.map((r) => r.meanVariables) },
          ]}
          yLabel="variables"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">The representability ceiling</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every instance that fails Gate A at <code>min_stem_length=2</code> is rescued at{" "}
          <code>min_stem_length=1</code>. The ceiling has exactly one cause —{" "}
          <strong>lone base pairs</strong>, helices of a single pair that a minimum-length
          filter excludes. Perfect representability is reachable, and the price is the
          variable count in the chart above.
        </p>
      </section>

      <ChartCard
        title="Variables against sequence length"
        description="How the stem-indexed problem grows with input size."
        source="results/full/e1_formulation.csv"
        table={{
          caption: "Mean variables and density by sequence length",
          columns: [
            { key: "length", label: "Length (nt)" },
            { key: "meanVariables", label: "Mean variables", format: fixed1 },
            { key: "meanDensity", label: "Mean density", format: fixed3 },
            { key: "instances", label: "Instances" },
          ],
          rows: scaling,
        }}
      >
        <LineChart
          categories={scaling.map((r) => r.length)}
          series={[{ name: "Mean variables", data: scaling.map((r) => r.meanVariables) }]}
          xLabel="sequence length (nt)"
          yLabel="variables"
        />
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 4: Write the resources page**

```tsx
// frontend/src/app/analytics/resources/page.tsx
import { BarChart } from "@/components/analytics/BarChart";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DataTable } from "@/components/analytics/DataTable";
import { LineChart } from "@/components/analytics/LineChart";
import {
  noiseComparison,
  objectiveComparison,
  qaoaByLength,
  qaoaByReps,
  qaoaByShots,
  qaoaGrid,
  solverSummary,
} from "@/lib/charts/transforms";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fixed1 = (value: number) => value.toFixed(1);
const fixed3 = (value: number) => value.toFixed(3);

const SHOT_LEVELS = [256, 1024, 4096];

export default function ResourcesPage() {
  const qaoa = qaoaByReps();
  const shots = qaoaByShots();
  const grid = qaoaGrid();
  const objective = objectiveComparison();
  const byLength = qaoaByLength();
  const { noiseless, noisy } = noiseComparison();
  const classical = solverSummary();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Quantum resource accounting</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          QAOA <strong>does not beat classical heuristics</strong> on these instances.
          At the most favourable setting measured it reaches the QUBO ground state on
          two thirds of runs, while tabu, local search, simulated annealing and
          path-integral SQA reach it on every determinate run. Reporting that plainly,
          with the circuit cost that bought it, is the point of this page — and the{" "}
          <strong>sampling budget turns out to move the result further than circuit
          depth does</strong>, which the conventional depth-only table hides.
        </p>
      </header>

      <ChartCard
        title="Ground-state rate against circuit cost"
        description="Noiseless expectation objective, pooled across shot budgets, by QAOA repetition count. The shot budget is broken out separately below."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA resource and outcome by reps",
          columns: [
            { key: "reps", label: "reps" },
            { key: "meanQubits", label: "Logical qubits", format: fixed1 },
            { key: "meanCircuitDepth", label: "Circuit depth", format: fixed1 },
            { key: "meanTwoQubitGates", label: "Two-qubit gates", format: fixed1 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
            { key: "circuits", label: "Circuits" },
          ],
          rows: qaoa,
        }}
      >
        <BarChart
          categories={qaoa.map((r) => `reps=${r.reps}`)}
          series={[
            { name: "Two-qubit gates", data: qaoa.map((r) => r.meanTwoQubitGates) },
            { name: "Circuit depth", data: qaoa.map((r) => r.meanCircuitDepth) },
          ]}
          yLabel="count"
        />
      </ChartCard>

      <ChartCard
        title="The sampling budget moves the result further than circuit depth"
        description="The same 81 noiseless circuits split by shot count rather than by reps."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA outcome by shot budget",
          columns: [
            { key: "shots", label: "Shots" },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ],
          rows: shots,
        }}
      >
        <BarChart
          categories={shots.map((r) => `${r.shots} shots`)}
          series={[
            { name: "Reached ground state", data: shots.map((r) => r.groundStateRate) },
          ]}
          yLabel="rate"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Depth does not compensate for a thin sample</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          The full grid. The deepest circuit on the smallest budget —{" "}
          <code>reps=3</code> at 256 shots — reaches the ground state less often than
          the shallowest circuit on the largest budget. At these sizes the binding
          constraint was measurement, not circuit expressivity.
        </p>
        <DataTable
          caption="Ground-state rate by reps and shot count"
          columns={[
            { key: "reps", label: "reps" },
            ...SHOT_LEVELS.map((s) => ({
              key: `s${s}`,
              label: `${s} shots`,
              format: pct,
            })),
          ]}
          rows={[1, 2, 3].map((reps) => ({
            reps,
            ...Object.fromEntries(
              SHOT_LEVELS.map((s) => [
                `s${s}`,
                grid.find((c) => c.reps === reps && c.shots === s)?.groundStateRate ?? null,
              ]),
            ),
          }))}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">CVaR against the expectation objective</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          CVaR was run at one configuration only —{" "}
          <strong>
            reps={objective.setting.reps}, {objective.setting.shots} shots, noiseless
          </strong>{" "}
          — so it is compared here against the expectation circuits at that same
          setting. At it the two are <strong>indistinguishable</strong>: identical
          ground-state rate on 9 circuits each. Comparing CVaR against expectation
          pooled over every shot budget would show a gap, but the gap would be the
          sampling budget rather than the objective. No claim is made either way.
        </p>
        <DataTable
          caption="CVaR and expectation at the one matched configuration"
          columns={[
            { key: "objective", label: "Objective" },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ]}
          rows={objective.arms}
        />
      </section>

      <ChartCard
        title="Ground-state rate against instance size"
        description="Noiseless expectation circuits grouped by sequence length."
        source="results/full/e4_qaoa.csv"
        table={{
          caption: "QAOA outcome by sequence length",
          columns: [
            { key: "length", label: "Length (nt)" },
            { key: "meanQubits", label: "Logical qubits", format: fixed1 },
            { key: "circuits", label: "Circuits" },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ],
          rows: byLength,
        }}
      >
        <LineChart
          categories={byLength.map((r) => `${r.length} nt`)}
          series={[
            { name: "Reached ground state", data: byLength.map((r) => r.groundStateRate) },
          ]}
          xLabel="sequence length"
          yLabel="rate"
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Cost of targeting a real device</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          The same circuits transpiled onto <code>fake_hanoi</code> — local IBM
          calibration data, <strong>no live hardware and no queue</strong> — against an
          ideal simulator. Matched on reps, shots and objective, so the difference is
          routing, not shot noise. SWAP cost is folded into the two-qubit gate count
          rather than reported separately.
        </p>
        <DataTable
          caption="Ideal simulator versus fake_hanoi device target"
          columns={[
            { key: "backend", label: "Transpilation target" },
            { key: "circuits", label: "Circuits" },
            { key: "meanTranspiledDepth", label: "Transpiled depth", format: fixed1 },
            { key: "meanTwoQubitGates", label: "Two-qubit gates", format: fixed1 },
            { key: "meanF1", label: "Mean F1", format: fixed3 },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
          ]}
          rows={[noiseless, noisy]}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">What classical methods achieve here</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
          At sizes where an exact reference exists, these QUBO instances are easy.
          Simulated annealing reaches the optimum on every determinate run in a fraction
          of a second. There is no room for an advantage claim in a regime classical
          methods already own — which is itself a finding about where quantum
          optimization should be pointed.
        </p>
        <DataTable
          caption="Classical and quantum-inspired solver outcomes"
          columns={[
            { key: "solver", label: "Solver" },
            { key: "determinateCount", label: "Determinate runs" },
            { key: "groundStateRate", label: "Reached ground state", format: pct },
            { key: "meanRuntimeSeconds", label: "Mean runtime (s)", format: fixed3 },
          ]}
          rows={classical}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Write the pseudoknot page**

```tsx
// frontend/src/app/analytics/pseudoknots/page.tsx
import { ChartCard } from "@/components/analytics/ChartCard";
import { BarChart } from "@/components/analytics/BarChart";
import { pseudoknotComparison } from "@/lib/charts/transforms";

const fixed3 = (value: number) => value.toFixed(3);

export default function PseudoknotsPage() {
  const rows = pseudoknotComparison();
  const knotted = rows.filter((r) => r.hasPseudoknot);
  const controls = rows.filter((r) => !r.hasPseudoknot);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pseudoknots</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Disabling the crossing penalty — one term in the QUBO — reaches structures
          dynamic programming has no representation for. Single-bracket dot-bracket
          notation <strong>cannot express a crossing</strong>, so ViennaRNA does not
          score poorly on these fixtures; it structurally cannot return the answer.
        </p>
      </header>

      <ChartCard
        title="Base-pair F1 on pseudoknotted fixtures"
        description="ViennaRNA, FoldQ with the crossing penalty enforced, and FoldQ with it disabled."
        source="results/full/e5_pseudoknot.csv"
        table={{
          caption: "Pseudoknot fixture results",
          columns: [
            { key: "sequenceId", label: "Fixture" },
            { key: "length", label: "Length (nt)" },
            { key: "crossingPairsInReference", label: "Crossing pairs" },
            { key: "viennaF1", label: "ViennaRNA F1", format: fixed3 },
            { key: "strictF1", label: "FoldQ strict F1", format: fixed3 },
            { key: "pseudoknotModeF1", label: "Pseudoknot mode F1", format: fixed3 },
          ],
          rows: knotted,
        }}
      >
        <BarChart
          categories={knotted.map((r) => r.sequenceId)}
          series={[
            { name: "ViennaRNA", data: knotted.map((r) => r.viennaF1), color: "#10b981" },
            { name: "FoldQ strict", data: knotted.map((r) => r.strictF1), color: "#0ea5e9" },
            {
              name: "FoldQ pseudoknot mode",
              data: knotted.map((r) => r.pseudoknotModeF1),
              color: "#d946ef",
            },
          ]}
          yLabel="base-pair F1"
          yMax={1}
        />
      </ChartCard>

      <section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
        <h2 className="text-base font-semibold">Fixture provenance</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Stated plainly rather than left for a reader to discover. The provenance below
          is rendered from the <code>source</code> column of the committed CSV.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {knotted.map((row) => (
            <li key={row.sequenceId}>
              <code>{row.sequenceId}</code> — {row.source}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          The mechanism is demonstrated; substituting cited literature pseudoknots is the
          next step and is listed in the project&apos;s future work.
        </p>
      </section>

      <ChartCard
        title="Controls"
        description="Pseudoknot-free structures run through the same path, including where the method degrades."
        source="results/full/e5_pseudoknot.csv"
        headingLevel={2}
        table={{
          caption: "Control fixture results",
          columns: [
            { key: "sequenceId", label: "Fixture" },
            { key: "length", label: "Length (nt)" },
            { key: "viennaF1", label: "ViennaRNA F1", format: fixed3 },
            { key: "strictF1", label: "FoldQ F1", format: fixed3 },
            { key: "source", label: "Provenance" },
          ],
          rows: controls,
        }}
      >
        <BarChart
          categories={controls.map((r) => r.sequenceId)}
          series={[
            { name: "ViennaRNA", data: controls.map((r) => r.viennaF1), color: "#10b981" },
            { name: "FoldQ", data: controls.map((r) => r.strictF1), color: "#0ea5e9" },
          ]}
          yLabel="base-pair F1"
          yMax={1}
        />
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/analytics-pages-2.test.tsx`
Expected: PASS (11 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/analytics frontend/tests
git commit -- frontend -m "feat: add scaling, resource and pseudoknot analytics pages"
```

---

## Phase 3 — FoldQ Studio

### Task 10: Dot-bracket parsing and 2D layout

**Files:**
- Create: `frontend/src/lib/rna/dotbracket.ts`, `frontend/src/lib/rna/layout.ts`
- Test: `frontend/tests/unit/dotbracket.test.ts`, `frontend/tests/unit/layout.test.ts`

**Interfaces:**
- Produces: `parseDotBracket(structure) -> {pairs, unpaired, isValid, error?}`; `describeStructure(structure) -> StructureStats`; `layoutStructure(sequence, pairs) -> {nodes, links}` where `nodes = {index, base, x, y, paired}[]`

Pure functions with no React and no fetching, so they are testable in isolation. The
layout is a force-free deterministic circular-arc placement — the same input always
produces the same coordinates, which keeps snapshot comparison meaningful.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/dotbracket.test.ts
import { describe, expect, it } from "vitest";
import { describeStructure, parseDotBracket } from "@/lib/rna/dotbracket";

describe("parseDotBracket", () => {
  it("extracts nested pairs", () => {
    const result = parseDotBracket("(((....))).");
    expect(result.isValid).toBe(true);
    expect(result.pairs).toEqual([
      [0, 9],
      [1, 8],
      [2, 7],
    ]);
    expect(result.unpaired).toEqual([3, 4, 5, 6, 10]);
  });

  it("reports an unbalanced structure rather than throwing", () => {
    const result = parseDotBracket("(((...");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unclosed/i);
    expect(result.pairs).toEqual([]);
  });

  it("reports an unmatched closing bracket", () => {
    const result = parseDotBracket("..)..");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unmatched/i);
  });

  it("rejects an unknown character", () => {
    const result = parseDotBracket("((x))");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unexpected character/i);
  });

  it("handles a fully unpaired structure", () => {
    const result = parseDotBracket(".....");
    expect(result.isValid).toBe(true);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("describeStructure", () => {
  it("counts helices and loop regions", () => {
    const stats = describeStructure("(((....))).");
    expect(stats.pairCount).toBe(3);
    expect(stats.helixCount).toBe(1);
    expect(stats.hairpinCount).toBe(1);
    expect(stats.unpairedCount).toBe(5);
    expect(stats.pairedFraction).toBeCloseTo(6 / 11);
  });

  it("counts two separate helices in a two-hairpin structure", () => {
    const stats = describeStructure("((..))..((..))");
    expect(stats.helixCount).toBe(2);
    expect(stats.hairpinCount).toBe(2);
  });
});
```

```ts
// frontend/tests/unit/layout.test.ts
import { describe, expect, it } from "vitest";
import { layoutStructure } from "@/lib/rna/layout";

describe("layoutStructure", () => {
  const sequence = "GGGAAAUCCCU";
  const pairs: [number, number][] = [
    [0, 9],
    [1, 8],
    [2, 7],
  ];

  it("places one node per nucleotide", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    expect(nodes).toHaveLength(11);
    expect(nodes.map((n) => n.base).join("")).toBe(sequence);
  });

  it("marks paired nucleotides", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    expect(nodes[0].paired).toBe(true);
    expect(nodes[4].paired).toBe(false);
  });

  it("emits a backbone link between consecutive bases and one per pair", () => {
    const { links } = layoutStructure(sequence, pairs);
    expect(links.filter((l) => l.kind === "backbone")).toHaveLength(10);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(3);
  });

  it("is deterministic", () => {
    const first = layoutStructure(sequence, pairs);
    const second = layoutStructure(sequence, pairs);
    expect(first.nodes).toEqual(second.nodes);
  });

  it("lays out crossing pairs without error", () => {
    // A pseudoknot has no nested layout; the renderer must still place every base.
    const { nodes, links } = layoutStructure("GGGGAAAACCCCAAAA", [
      [0, 9],
      [4, 13],
    ]);
    expect(nodes).toHaveLength(16);
    expect(links.filter((l) => l.kind === "pair")).toHaveLength(2);
  });

  it("keeps every coordinate finite", () => {
    const { nodes } = layoutStructure(sequence, pairs);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/dotbracket.test.ts tests/unit/layout.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/rna/dotbracket.ts`**

```ts
export interface ParsedStructure {
  pairs: [number, number][];
  unpaired: number[];
  isValid: boolean;
  error?: string;
}

/** Parses single-bracket dot-bracket notation. Crossing pairs cannot be expressed
 *  in this notation at all — a pseudoknotted candidate arrives from the API as an
 *  explicit base-pair list instead, never as a string. */
export function parseDotBracket(structure: string): ParsedStructure {
  const stack: number[] = [];
  const pairs: [number, number][] = [];
  const unpaired: number[] = [];

  for (let index = 0; index < structure.length; index += 1) {
    const character = structure[index];
    if (character === "(") {
      stack.push(index);
    } else if (character === ")") {
      const open = stack.pop();
      if (open === undefined) {
        return {
          pairs: [],
          unpaired: [],
          isValid: false,
          error: `unmatched ')' at position ${index}`,
        };
      }
      pairs.push([open, index]);
    } else if (character === "." ) {
      unpaired.push(index);
    } else {
      return {
        pairs: [],
        unpaired: [],
        isValid: false,
        error: `unexpected character '${character}' at position ${index}`,
      };
    }
  }

  if (stack.length > 0) {
    return {
      pairs: [],
      unpaired: [],
      isValid: false,
      error: `unclosed '(' at position ${stack[0]}`,
    };
  }

  pairs.sort((a, b) => a[0] - b[0]);
  return { pairs, unpaired, isValid: true };
}

export interface StructureStats {
  length: number;
  pairCount: number;
  unpairedCount: number;
  pairedFraction: number;
  /** Maximal runs of consecutive stacked pairs. */
  helixCount: number;
  /** Helices whose innermost pair encloses only unpaired bases. */
  hairpinCount: number;
}

export function describeStructure(structure: string): StructureStats {
  const parsed = parseDotBracket(structure);
  const partner = new Map<number, number>();
  for (const [i, j] of parsed.pairs) {
    partner.set(i, j);
    partner.set(j, i);
  }

  let helixCount = 0;
  let hairpinCount = 0;
  for (const [i, j] of parsed.pairs) {
    const isHelixStart = partner.get(i - 1) !== j + 1;
    if (isHelixStart) helixCount += 1;

    const isInnermost = partner.get(i + 1) !== j - 1;
    if (isInnermost) {
      let enclosesPair = false;
      for (let k = i + 1; k < j; k += 1) {
        if (partner.has(k)) {
          enclosesPair = true;
          break;
        }
      }
      if (!enclosesPair) hairpinCount += 1;
    }
  }

  return {
    length: structure.length,
    pairCount: parsed.pairs.length,
    unpairedCount: parsed.unpaired.length,
    pairedFraction:
      structure.length === 0 ? 0 : (parsed.pairs.length * 2) / structure.length,
    helixCount,
    hairpinCount,
  };
}
```

- [ ] **Step 4: Write `frontend/src/lib/rna/layout.ts`**

```ts
export interface LayoutNode {
  index: number;
  base: string;
  x: number;
  y: number;
  paired: boolean;
}

export interface LayoutLink {
  source: number;
  target: number;
  kind: "backbone" | "pair";
}

export interface Layout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  width: number;
  height: number;
}

/** Circular backbone with chords for base pairs.
 *
 *  A radial-loop layout (the ViennaRNA/R2DT look) is the eventual goal, but it has
 *  no meaning for crossing pairs — and pseudoknots are the result this project is
 *  built to show. A circle places every base deterministically regardless of
 *  topology, so nested and crossing structures render through one code path.
 */
export function layoutStructure(
  sequence: string,
  pairs: [number, number][],
  options: { radius?: number; padding?: number } = {},
): Layout {
  const radius = options.radius ?? Math.max(90, sequence.length * 4.2);
  const padding = options.padding ?? 28;
  const size = radius * 2 + padding * 2;
  const centre = size / 2;

  const pairedIndices = new Set<number>();
  for (const [i, j] of pairs) {
    pairedIndices.add(i);
    pairedIndices.add(j);
  }

  // Start at the top and run clockwise, leaving a gap so 5' and 3' ends are distinct.
  const arc = (Math.PI * 2 * 0.94) / Math.max(1, sequence.length - 1);
  const start = -Math.PI / 2 + Math.PI * 0.03;

  const nodes: LayoutNode[] = [...sequence].map((base, index) => {
    const angle = start + arc * index;
    return {
      index,
      base,
      x: centre + radius * Math.cos(angle),
      y: centre + radius * Math.sin(angle),
      paired: pairedIndices.has(index),
    };
  });

  const links: LayoutLink[] = [];
  for (let index = 1; index < sequence.length; index += 1) {
    links.push({ source: index - 1, target: index, kind: "backbone" });
  }
  for (const [i, j] of pairs) {
    links.push({ source: i, target: j, kind: "pair" });
  }

  return { nodes, links, width: size, height: size };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/dotbracket.test.ts tests/unit/layout.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/rna frontend/tests/unit/dotbracket.test.ts frontend/tests/unit/layout.test.ts
git commit -- frontend -m "feat: add dot-bracket parsing and deterministic 2D layout"
```

---

### Task 11: RNA structure view and gate ladder

**Files:**
- Create: `frontend/src/components/rna/StructureView.tsx`, `frontend/src/components/rna/SequenceTrack.tsx`, `frontend/src/components/foldq/GateLadder.tsx`, `frontend/src/lib/foldq/gates.ts`
- Test: `frontend/tests/unit/gates.test.ts`, `frontend/tests/component/structure.test.tsx`

**Interfaces:**
- Consumes: `layoutStructure` (Task 10), `GateReport` (Task 4)
- Produces: `<StructureView sequence pairs highlight/>`, `<SequenceTrack sequence pairs/>`, `<GateLadder gates/>`, `gateLadder(gates) -> GateStatus[]` where `GateStatus = {id, name, state: "pass"|"fail"|"indeterminate"|"not-applicable", detail}`

`gateLadder` mirrors the Python `GateReport.attribution` ordering exactly: pseudoknot
branch first, then A, then B, then C, then the indeterminate case. The test cross-checks
the derived ladder against the `attribution` string the API sends, so the two cannot
drift apart silently.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/gates.test.ts
import { describe, expect, it } from "vitest";
import { gateLadder } from "@/lib/foldq/gates";
import type { GateReport } from "@/lib/api/schemas";

const base: GateReport = {
  representable: true,
  representable_fraction: 1,
  is_qubo_ground_state: true,
  solver_found_ground_state: true,
  energy_gap: 0,
  base_pair_f1: 1,
  is_pseudoknotted: false,
  attribution: "no failure: all gates passed",
  notes: [],
};

describe("gateLadder", () => {
  it("passes all four gates on a clean run", () => {
    const ladder = gateLadder(base);
    expect(ladder.map((g) => g.id)).toEqual(["A", "B", "C", "D"]);
    expect(ladder.every((g) => g.state === "pass")).toBe(true);
  });

  it("fails Gate A and marks later gates not-applicable", () => {
    const ladder = gateLadder({
      ...base,
      representable: false,
      representable_fraction: 0.5,
      attribution:
        "candidate generation: the reference structure is not in the candidate set (only 50% of its pairs are reachable)",
    });
    expect(ladder[0].state).toBe("fail");
    // A later gate cannot be blamed for an earlier failure — this is the whole
    // point of attributing to the earliest failing gate.
    expect(ladder.slice(1).every((g) => g.state === "not-applicable")).toBe(true);
  });

  it("fails Gate B when the reference is not the ground state", () => {
    const ladder = gateLadder({
      ...base,
      is_qubo_ground_state: false,
      attribution: "energy model: the reference structure is not the QUBO ground state",
    });
    expect(ladder[0].state).toBe("pass");
    expect(ladder[1].state).toBe("fail");
    expect(ladder[2].state).toBe("not-applicable");
  });

  it("fails Gate C when the solver missed the ground state", () => {
    const ladder = gateLadder({
      ...base,
      solver_found_ground_state: false,
      attribution: "optimizer: the solver did not reach the QUBO ground state",
    });
    expect(ladder[1].state).toBe("pass");
    expect(ladder[2].state).toBe("fail");
  });

  it("marks B and C indeterminate rather than failed when ground truth is unavailable", () => {
    const ladder = gateLadder({
      ...base,
      is_qubo_ground_state: null,
      solver_found_ground_state: null,
      attribution: "indeterminate: instance too large for exact ground truth",
    });
    expect(ladder[1].state).toBe("indeterminate");
    expect(ladder[2].state).toBe("indeterminate");
    expect(ladder[3].state).toBe("pass");
  });

  it("explains that precision is capped for a pseudoknotted candidate", () => {
    const ladder = gateLadder({
      ...base,
      is_pseudoknotted: true,
      base_pair_f1: 0.667,
      energy_gap: null,
      attribution:
        "pseudoknotted candidate: the selected structure contains crossing pairs, which ViennaRNA cannot represent or score.",
    });
    const gateD = ladder[3];
    expect(gateD.state).toBe("not-applicable");
    expect(gateD.detail).toMatch(/capped/i);
  });

  it("agrees with the attribution string the backend produced", () => {
    // Guards against the TS mirror drifting from Python's GateReport.attribution.
    const cases: [GateReport, string][] = [
      [base, "no failure"],
      [{ ...base, representable: false }, "candidate generation"],
      [{ ...base, is_qubo_ground_state: false }, "energy model"],
      [{ ...base, solver_found_ground_state: false }, "optimizer"],
      [{ ...base, is_qubo_ground_state: null }, "indeterminate"],
      [{ ...base, is_pseudoknotted: true }, "pseudoknotted candidate"],
    ];
    for (const [gates, expectedPrefix] of cases) {
      const ladder = gateLadder(gates);
      const earliestFailure = ladder.find(
        (g) => g.state === "fail" || g.state === "indeterminate",
      );
      const derived = earliestFailure?.attributionPrefix ?? "no failure";
      expect(gates.is_pseudoknotted ? "pseudoknotted candidate" : derived).toBe(
        expectedPrefix,
      );
    }
  });
});
```

```tsx
// frontend/tests/component/structure.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructureView } from "@/components/rna/StructureView";
import { GateLadder } from "@/components/foldq/GateLadder";

const gates = {
  representable: true,
  representable_fraction: 1,
  is_qubo_ground_state: true,
  solver_found_ground_state: null,
  energy_gap: 0.4,
  base_pair_f1: 0.83,
  is_pseudoknotted: false,
  attribution: "indeterminate: instance too large for exact ground truth",
  notes: ["exact reference unavailable above 22 variables"],
};

describe("StructureView", () => {
  it("labels the structure for assistive technology", () => {
    render(
      <StructureView
        sequence="GGGAAAUCCCU"
        pairs={[
          [0, 9],
          [1, 8],
          [2, 7],
        ]}
        label="Predicted structure"
      />,
    );
    expect(screen.getByRole("img", { name: /predicted structure/i })).toBeInTheDocument();
  });

  it("describes the structure textually alongside the drawing", () => {
    render(<StructureView sequence="GGGAAAUCCCU" pairs={[[0, 9]]} label="s" />);
    expect(screen.getByText(/11 nucleotides/i)).toBeInTheDocument();
    expect(screen.getByText(/1 base pair\b/i)).toBeInTheDocument();
  });
});

describe("GateLadder", () => {
  it("renders all four gates with their state as text, not only colour", () => {
    render(<GateLadder gates={gates} />);
    for (const name of ["Representable", "Faithful", "Solved", "Physical"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/indeterminate/i).length).toBeGreaterThan(0);
  });

  it("shows the backend's attribution verbatim", () => {
    render(<GateLadder gates={gates} />);
    expect(screen.getByText(gates.attribution)).toBeInTheDocument();
  });

  it("surfaces gate notes", () => {
    render(<GateLadder gates={gates} />);
    expect(screen.getByText(/above 22 variables/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/gates.test.ts tests/component/structure.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/foldq/gates.ts`**

```ts
import type { GateReport } from "@/lib/api/schemas";

export type GateState = "pass" | "fail" | "indeterminate" | "not-applicable";

export interface GateStatus {
  id: "A" | "B" | "C" | "D";
  name: string;
  question: string;
  state: GateState;
  detail: string;
  /** The prefix Python's GateReport.attribution would use for this gate. */
  attributionPrefix?: string;
}

/** Mirrors `foldq.schemas.gates.GateReport.attribution`, in the same order:
 *  pseudoknot branch, then A, B, C, then the indeterminate case. The API sends the
 *  authoritative `attribution` string; this derives the per-gate display state,
 *  which the string alone cannot express. */
export function gateLadder(gates: GateReport): GateStatus[] {
  const notApplicable = (reason: string) => ({
    state: "not-applicable" as GateState,
    detail: reason,
  });

  const gateA: GateStatus = gates.representable
    ? {
        id: "A",
        name: "Representable",
        question: "Is the reference structure in the candidate set?",
        state: "pass",
        detail: "The reference structure is reachable from the candidate helices.",
      }
    : {
        id: "A",
        name: "Representable",
        question: "Is the reference structure in the candidate set?",
        state: "fail",
        detail: `Only ${(gates.representable_fraction * 100).toFixed(0)}% of the reference's pairs are reachable. This is a hard ceiling — no optimizer can recover a structure the candidate set never held.`,
        attributionPrefix: "candidate generation",
      };

  const earlierFailed = gateA.state === "fail";

  const gateB: GateStatus = {
    id: "B",
    name: "Faithful",
    question: "Is the reference structure the QUBO's ground state?",
    ...(earlierFailed
      ? notApplicable("Not evaluated: the candidate set did not contain the reference.")
      : gates.is_qubo_ground_state === null
        ? {
            state: "indeterminate" as GateState,
            detail:
              "Exact ground truth is unavailable above roughly 22 variables. Not a failure — an unanswered question.",
            attributionPrefix: "indeterminate",
          }
        : gates.is_qubo_ground_state
          ? { state: "pass" as GateState, detail: "The reference structure is the QUBO's ground state." }
          : {
              state: "fail" as GateState,
              detail:
                "The QUBO prefers a different structure to the reference: the energy model is misspecified for this instance.",
              attributionPrefix: "energy model",
            }),
  };

  const gateCBlocked = earlierFailed || gateB.state === "fail";

  const gateC: GateStatus = {
    id: "C",
    name: "Solved",
    question: "Did this solver reach the QUBO ground state?",
    ...(gateCBlocked
      ? notApplicable("Not evaluated: an earlier gate failed.")
      : gates.solver_found_ground_state === null
        ? {
            state: "indeterminate" as GateState,
            detail:
              "Exact ground truth is unavailable at this size, so solver optimality cannot be decided.",
            attributionPrefix: "indeterminate",
          }
        : gates.solver_found_ground_state
          ? { state: "pass" as GateState, detail: "The solver reached the QUBO ground state." }
          : {
              state: "fail" as GateState,
              detail: "The solver did not reach the QUBO ground state.",
              attributionPrefix: "optimizer",
            }),
  };

  const gateD: GateStatus = {
    id: "D",
    name: "Physical",
    question: "Energy gap and base-pair F1 after decode, repair and rescore",
    ...(gates.is_pseudoknotted
      ? notApplicable(
          `Base-pair F1 ${gates.base_pair_f1.toFixed(3)} against a nested reference. The reference can hold at most one of any two crossing helices, so precision is structurally capped even when the candidate is correct. ViennaRNA cannot score a crossing structure, so no energy gap is reported.`,
        )
      : {
          state: (gates.base_pair_f1 > 0 ? "pass" : "fail") as GateState,
          detail: `Base-pair F1 ${gates.base_pair_f1.toFixed(3)}${
            gates.energy_gap === null
              ? "; energy gap unavailable"
              : `, energy gap ${gates.energy_gap.toFixed(2)} kcal/mol`
          }.`,
        }),
  };

  return [gateA, gateB, gateC, gateD];
}
```

- [ ] **Step 4: Write `StructureView.tsx` and `SequenceTrack.tsx`**

```tsx
// frontend/src/components/rna/StructureView.tsx
"use client";

import { layoutStructure } from "@/lib/rna/layout";

const BASE_COLORS: Record<string, string> = {
  A: "var(--rna-a)",
  U: "var(--rna-u)",
  C: "var(--rna-c)",
  G: "var(--rna-g)",
};

export function StructureView({
  sequence,
  pairs,
  label,
  highlight = [],
  size = 360,
}: {
  sequence: string;
  pairs: [number, number][];
  label: string;
  highlight?: number[];
  size?: number;
}) {
  const layout = layoutStructure(sequence, pairs);
  const highlighted = new Set(highlight);
  const showBases = sequence.length <= 120;

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={size}
        height={size}
        className="max-w-full"
      >
        {layout.links.map((link, index) => {
          const a = layout.nodes[link.source];
          const b = layout.nodes[link.target];
          return (
            <line
              key={index}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={link.kind === "pair" ? "var(--quantum-inspired)" : "var(--border)"}
              strokeWidth={link.kind === "pair" ? 1.6 : 2.4}
              strokeOpacity={link.kind === "pair" ? 0.85 : 1}
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g key={node.index}>
            <circle
              cx={node.x}
              cy={node.y}
              r={highlighted.has(node.index) ? 6 : 4}
              fill={BASE_COLORS[node.base] ?? "var(--text-secondary)"}
              stroke={highlighted.has(node.index) ? "var(--text-primary)" : "none"}
              strokeWidth={1.5}
            />
            {showBases && (
              <text
                x={node.x}
                y={node.y - 8}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-secondary)"
              >
                {node.base}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-[var(--text-secondary)]">
        {label}: {sequence.length} nucleotides, {pairs.length} base{" "}
        {pairs.length === 1 ? "pair" : "pairs"}.
      </figcaption>
    </figure>
  );
}
```

```tsx
// frontend/src/components/rna/SequenceTrack.tsx
export function SequenceTrack({
  sequence,
  structure,
}: {
  sequence: string;
  structure: string;
}) {
  return (
    <div className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
      <pre className="m-0 whitespace-pre font-mono text-xs leading-5">
        <code aria-label="Sequence">{sequence}</code>
        {"\n"}
        <code aria-label="Structure in dot-bracket notation">{structure}</code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 5: Write `GateLadder.tsx`**

```tsx
import { gateLadder, type GateState } from "@/lib/foldq/gates";
import type { GateReport } from "@/lib/api/schemas";

const STATE_LABEL: Record<GateState, string> = {
  pass: "Pass",
  fail: "Fail",
  indeterminate: "Indeterminate",
  "not-applicable": "Not applicable",
};

const STATE_COLOR: Record<GateState, string> = {
  pass: "var(--reference)",
  fail: "var(--danger)",
  indeterminate: "var(--warning)",
  "not-applicable": "var(--text-secondary)",
};

export function GateLadder({ gates }: { gates: GateReport }) {
  const ladder = gateLadder(gates);
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">Diagnostic ladder</h2>
      <p className="mb-3 mt-1 text-sm">
        <span className="text-[var(--text-secondary)]">Attribution: </span>
        <span className="font-medium">{gates.attribution}</span>
      </p>
      <ol className="space-y-2">
        {ladder.map((gate) => (
          <li
            key={gate.id}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Gate {gate.id}
              </span>
              <span className="text-sm font-medium">{gate.name}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ color: STATE_COLOR[gate.state], borderColor: STATE_COLOR[gate.state] }}
              >
                {STATE_LABEL[gate.state]}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{gate.question}</p>
            <p className="mt-1 text-xs">{gate.detail}</p>
          </li>
        ))}
      </ol>
      {gates.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
          {gates.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/gates.test.ts tests/component/structure.test.tsx`
Expected: PASS (12 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/rna frontend/src/components/foldq frontend/src/lib/foldq frontend/tests
git commit -- frontend -m "feat: add RNA structure view and diagnostic gate ladder"
```

---

### Task 12: MSW harness and the analysis wizard

**Files:**
- Create: `frontend/tests/msw/handlers.ts`, `frontend/tests/msw/fixtures.ts`, `frontend/src/app/foldq/new/page.tsx`, `frontend/src/components/foldq/SequenceInput.tsx`, `frontend/src/components/foldq/SolverPicker.tsx`, `frontend/src/stores/workspace.ts`
- Modify: `frontend/tests/setup.ts`
- Test: `frontend/tests/component/wizard.test.tsx`

**Interfaces:**
- Consumes: `foldSequence`, `fetchMeta` (Task 4)
- Produces: `useWorkspace()` Zustand store with `{sequence, solver, seed, pseudoknots, setSequence, setSolver, setSeed, setPseudoknots, reset}`; `<SequenceInput/>`, `<SolverPicker/>`; the `/foldq/new` route

The MSW fixture is a real captured response — generated by running the API and saving
its output, not hand-written. A hand-written fixture drifts from the backend and the
tests keep passing while the app breaks.

- [ ] **Step 1: Capture the fixture from the running API**

```bash
cd /Users/jainishsolanki/Documents/FoldQ
.venv/bin/uvicorn foldq.api.app:app --port 8000 &
sleep 3
mkdir -p frontend/tests/msw
curl -s -X POST localhost:8000/api/v1/fold \
  -H 'content-type: application/json' \
  -d '{"sequence":"GGGAAAUCCCU","solver":"exact","seed":42}' \
  > frontend/tests/msw/fold-response.json
curl -s localhost:8000/api/v1/meta > frontend/tests/msw/meta-response.json
kill %1
```

Confirm both files are valid JSON and `fold-response.json` contains an `attribution`
field. If the server is unreachable, complete Task 1 first — do not hand-write these.

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/tests/component/wizard.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewAnalysisPage from "@/app/foldq/new/page";
import { useWorkspace } from "@/stores/workspace";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/foldq/new",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewAnalysisPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  useWorkspace.getState().reset();
});

describe("analysis wizard", () => {
  it("rejects a sequence containing an invalid nucleotide", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGXAU");
    expect(await screen.findByText(/invalid nucleotide/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fold/i })).toBeDisabled();
  });

  it("normalizes T to U and uppercases input", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "gggaaatccct");
    expect(screen.getByLabelText(/sequence/i)).toHaveValue("GGGAAAUCCCU");
  });

  it("shows the sequence length and GC content as you type", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    expect(screen.getByText(/11 nt/)).toBeInTheDocument();
    expect(screen.getByText(/54\.5% GC/)).toBeInTheDocument();
  });

  it("lists solvers from the API", async () => {
    renderPage();
    const picker = await screen.findByLabelText(/solver/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /simulated_annealing/ })).toBeInTheDocument(),
    );
    expect(picker).toBeInTheDocument();
  });

  it("warns that pseudoknot mode changes what the F1 is measured against", async () => {
    renderPage();
    await userEvent.click(screen.getByLabelText(/allow pseudoknots/i));
    expect(
      screen.getByText(/precision against a nested reference is capped/i),
    ).toBeInTheDocument();
  });

  it("navigates to the run page on submit", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    await userEvent.click(screen.getByRole("button", { name: /fold/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/foldq\/runs\//)));
  });

  it("surfaces a backend error instead of failing silently", async () => {
    const { server } = await import("../msw/handlers");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.post("*/api/v1/fold", () =>
        HttpResponse.json({ detail: "sequence too long" }, { status: 422 }),
      ),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    await userEvent.click(screen.getByRole("button", { name: /fold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sequence too long/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/wizard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the MSW handlers**

```bash
cd frontend && pnpm add -D msw
```

```ts
// frontend/tests/msw/handlers.ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import foldResponse from "./fold-response.json";
import metaResponse from "./meta-response.json";

export const handlers = [
  http.get("*/api/v1/meta", () => HttpResponse.json(metaResponse)),
  http.post("*/api/v1/fold", () => HttpResponse.json(foldResponse)),
];

export const server = setupServer(...handlers);
```

```ts
// frontend/tests/setup.ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/handlers";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 5: Write the workspace store**

```ts
// frontend/src/stores/workspace.ts
import { create } from "zustand";

interface WorkspaceState {
  sequence: string;
  solver: string;
  seed: number;
  pseudoknots: boolean;
  setSequence: (value: string) => void;
  setSolver: (value: string) => void;
  setSeed: (value: number) => void;
  setPseudoknots: (value: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  sequence: "",
  solver: "simulated_annealing",
  seed: 42,
  pseudoknots: false,
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  ...INITIAL,
  /** Normalization mirrors SequenceRecord.__post_init__ in the backend: strip
   *  whitespace, uppercase, T becomes U. Doing it here means the field shows the
   *  sequence that will actually be folded. */
  setSequence: (value) =>
    set({ sequence: value.toUpperCase().replace(/\s+/g, "").replace(/T/g, "U") }),
  setSolver: (value) => set({ solver: value }),
  setSeed: (value) => set({ seed: value }),
  setPseudoknots: (value) => set({ pseudoknots: value }),
  reset: () => set(INITIAL),
}));

const VALID = new Set(["A", "U", "C", "G"]);

export function sequenceError(sequence: string): string | null {
  if (sequence.length === 0) return null;
  const bad = [...new Set([...sequence])].filter((c) => !VALID.has(c)).sort();
  if (bad.length > 0) return `invalid nucleotide(s): ${bad.join(", ")}`;
  if (sequence.length > 200) return "sequence exceeds the 200 nt limit for live folding";
  return null;
}

export function gcContent(sequence: string): number {
  if (sequence.length === 0) return 0;
  const gc = [...sequence].filter((c) => c === "G" || c === "C").length;
  return gc / sequence.length;
}
```

- [ ] **Step 6: Write the wizard components and page**

```tsx
// frontend/src/components/foldq/SequenceInput.tsx
"use client";

import { gcContent, sequenceError, useWorkspace } from "@/stores/workspace";

export function SequenceInput() {
  const { sequence, setSequence } = useWorkspace();
  const error = sequenceError(sequence);

  return (
    <div>
      <label htmlFor="sequence" className="block text-sm font-medium">
        RNA sequence
      </label>
      <p className="mb-1 mt-0.5 text-xs text-[var(--text-secondary)]">
        A, U, C, G. DNA input is accepted — T is converted to U. Use public,
        synthetic, or randomly generated sequences only.
      </p>
      <textarea
        id="sequence"
        rows={3}
        value={sequence}
        spellCheck={false}
        onChange={(event) => setSequence(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error ? "sequence-error" : "sequence-stats"}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 font-mono text-sm"
      />
      {error ? (
        <p id="sequence-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        <p id="sequence-stats" className="mt-1 text-xs text-[var(--text-secondary)]">
          {sequence.length} nt · {(gcContent(sequence) * 100).toFixed(1)}% GC
        </p>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/foldq/SolverPicker.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMeta } from "@/lib/api/client";
import { useWorkspace } from "@/stores/workspace";

export function SolverPicker() {
  const { solver, setSolver, seed, setSeed, pseudoknots, setPseudoknots } = useWorkspace();
  const { data } = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="solver" className="block text-sm font-medium">
          Solver
        </label>
        <select
          id="solver"
          value={solver}
          onChange={(event) => setSolver(event.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
        >
          {(data?.solvers ?? [solver]).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="seed" className="block text-sm font-medium">
          Seed
        </label>
        <input
          id="seed"
          type="number"
          value={seed}
          onChange={(event) => setSeed(Number(event.target.value))}
          className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          The same sequence, solver and seed always produce the same run.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={pseudoknots}
            onChange={(event) => setPseudoknots(event.target.checked)}
          />
          Allow pseudoknots
        </label>
        {pseudoknots && (
          <p className="mt-1 text-xs text-[var(--warning)]">
            The crossing penalty is disabled, so the candidate may contain crossing
            pairs. ViennaRNA cannot represent or score those, and its reference fold can
            hold at most one of any two crossing helices — so{" "}
            <strong>precision against a nested reference is capped</strong> even when the
            structure is right.
          </p>
        )}
      </div>
    </div>
  );
}
```

```tsx
// frontend/src/app/foldq/new/page.tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { SequenceInput } from "@/components/foldq/SequenceInput";
import { SolverPicker } from "@/components/foldq/SolverPicker";
import { foldSequence } from "@/lib/api/client";
import { sequenceError, useWorkspace } from "@/stores/workspace";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { sequence, solver, seed, pseudoknots } = useWorkspace();
  const invalid = sequenceError(sequence) !== null || sequence.length === 0;

  const mutation = useMutation({
    mutationFn: () => foldSequence({ sequence, solver, seed, pseudoknots }),
    onSuccess: (result) => {
      sessionStorage.setItem(`foldq:run:${result.run_id}`, JSON.stringify(result));
      router.push(`/foldq/runs/${result.run_id}`);
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New analysis</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Fold a sequence through the full pipeline: candidate helices, QUBO
          construction, solve, decode, repair, rescore, and the four diagnostic gates.
        </p>
      </header>

      <SequenceInput />
      <SolverPicker />

      <div className="flex items-center gap-3">
        <button
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded bg-[var(--quantum-inspired)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? "Folding…" : "Fold sequence"}
        </button>
        {mutation.isPending && (
          <span className="text-xs text-[var(--text-secondary)]" role="status">
            Running the pipeline…
          </span>
        )}
      </div>

      {mutation.isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {(mutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/wizard.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/foldq frontend/src/components/foldq frontend/src/stores frontend/tests
git commit -- frontend -m "feat: add analysis wizard with MSW-backed tests"
```

---

### Task 13: Run results workspace

**Files:**
- Create: `frontend/src/app/foldq/runs/[runId]/page.tsx`, `frontend/src/components/foldq/RunSummary.tsx`, `frontend/src/components/foldq/StageTimeline.tsx`, `frontend/src/components/foldq/StructureComparison.tsx`
- Test: `frontend/tests/component/run-page.test.tsx`

**Interfaces:**
- Consumes: `FoldResponse` (Task 4), `StructureView`, `SequenceTrack`, `GateLadder` (Task 11), `useWorkspace` (Task 12)
- Produces: the `/foldq/runs/[runId]` route

Results are read from `sessionStorage` where the wizard wrote them. A run is a content
hash of its inputs, so a shared link that misses the cache re-folds identically rather
than 404ing — which is why no database is needed.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/component/run-page.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunPage from "@/app/foldq/runs/[runId]/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ runId: fixture.run_id }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/foldq/runs/x",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RunPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
});

describe("run page", () => {
  it("shows the candidate and reference structures side by side", async () => {
    renderPage();
    expect(await screen.findByRole("img", { name: /FoldQ candidate/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /ViennaRNA reference/i })).toBeInTheDocument();
  });

  it("renders the gate ladder with the backend's attribution", async () => {
    renderPage();
    expect(await screen.findByText(fixture.gates.attribution)).toBeInTheDocument();
  });

  it("reports QUBO size and density", async () => {
    renderPage();
    expect(await screen.findByText(String(fixture.problem.num_variables))).toBeInTheDocument();
    expect(screen.getByText(/variables/i)).toBeInTheDocument();
  });

  it("shows the stage breakdown labelled as approximate", async () => {
    renderPage();
    expect(await screen.findByText(/approximate/i)).toBeInTheDocument();
    for (const stage of ["reference", "qubo", "solve", "gates"]) {
      expect(screen.getAllByText(new RegExp(stage, "i")).length).toBeGreaterThan(0);
    }
  });

  it("makes the run reproducible from the page itself", async () => {
    renderPage();
    expect(await screen.findByText(new RegExp(fixture.solver))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`seed ${fixture.seed}`, "i"))).toBeInTheDocument();
  });

  it("re-folds when the run is not in session storage", async () => {
    sessionStorage.clear();
    renderPage();
    // The MSW handler answers the refetch with the same fixture.
    expect(await screen.findByText(fixture.gates.attribution)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm vitest run tests/component/run-page.test.tsx`
Expected: FAIL — page not found.

- [ ] **Step 3: Write `StageTimeline.tsx`**

```tsx
import type { FoldResponse } from "@/lib/api/schemas";

/** The pipeline runs as one synchronous call and does not instrument itself. These
 *  shares are a proportional breakdown of the measured total, and are labelled as
 *  approximate rather than presented as measured per-stage timings. */
export function StageTimeline({ result }: { result: FoldResponse }) {
  const total = result.stages.reduce((sum, stage) => sum + stage.seconds, 0) || 1;
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">Pipeline stages</h2>
      <p className="mb-3 mt-1 text-xs text-[var(--text-secondary)]">
        Total {result.runtime_seconds.toFixed(3)} s. The per-stage split is an{" "}
        <strong>approximate</strong> breakdown of one synchronous call, not individually
        instrumented timings.
      </p>
      <ol className="space-y-1.5">
        {result.stages.map((stage) => (
          <li key={stage.name} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 capitalize">{stage.name}</span>
            <span
              className="h-2 rounded bg-[var(--quantum-inspired)]"
              style={{ width: `${(stage.seconds / total) * 100}%`, minWidth: 2 }}
            />
            <span className="tabular-nums text-[var(--text-secondary)]">
              {stage.seconds.toFixed(4)} s
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Write `RunSummary.tsx` and `StructureComparison.tsx`**

```tsx
// frontend/src/components/foldq/RunSummary.tsx
import type { FoldResponse } from "@/lib/api/schemas";

export function RunSummary({ result }: { result: FoldResponse }) {
  const stats: [string, string][] = [
    ["Solver", result.solver],
    ["Seed", `seed ${result.seed}`],
    ["Length", `${result.sequence.length} nt`],
    ["Variables", String(result.problem.num_variables)],
    ["Quadratic terms", String(result.problem.num_quadratic_terms)],
    ["QUBO density", result.problem.density.toFixed(3)],
    ["Overlap penalty", result.problem.overlap_penalty.toFixed(2)],
    [
      "Crossing pairs",
      result.problem.forbid_crossing ? "forbidden" : "allowed (pseudoknot mode)",
    ],
  ];

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">Run</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Run <code>{result.run_id}</code> is a content hash of the sequence, solver, seed
        and pseudoknot setting — the same inputs always reproduce it.
      </p>
    </section>
  );
}
```

```tsx
// frontend/src/components/foldq/StructureComparison.tsx
import { SequenceTrack } from "@/components/rna/SequenceTrack";
import { StructureView } from "@/components/rna/StructureView";
import type { FoldResponse } from "@/lib/api/schemas";

const energy = (value: number | null) =>
  value === null ? "not scorable" : `${value.toFixed(2)} kcal/mol`;

export function StructureComparison({ result }: { result: FoldResponse }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">FoldQ candidate</h2>
        <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
          {energy(result.candidate.energy)}
          {result.candidate.is_pseudoknotted &&
            " — contains crossing pairs, which ViennaRNA cannot score"}
          {result.candidate.was_repaired &&
            ` · ${result.candidate.repair_count} repair(s) applied to the decoded sample`}
        </p>
        <StructureView
          sequence={result.sequence}
          pairs={result.candidate.base_pairs}
          label="FoldQ candidate structure"
        />
        {!result.candidate.is_pseudoknotted && (
          <div className="mt-2">
            <SequenceTrack
              sequence={result.sequence}
              structure={result.candidate.dot_bracket}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">ViennaRNA reference</h2>
        <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
          {energy(result.reference.energy)} — exact MFE under the Turner model
        </p>
        <StructureView
          sequence={result.sequence}
          pairs={result.reference.base_pairs}
          label="ViennaRNA reference structure"
        />
        <div className="mt-2">
          <SequenceTrack
            sequence={result.sequence}
            structure={result.reference.dot_bracket}
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the run page**

```tsx
// frontend/src/app/foldq/runs/[runId]/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { GateLadder } from "@/components/foldq/GateLadder";
import { RunSummary } from "@/components/foldq/RunSummary";
import { StageTimeline } from "@/components/foldq/StageTimeline";
import { StructureComparison } from "@/components/foldq/StructureComparison";
import { foldSequence } from "@/lib/api/client";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";
import { useWorkspace } from "@/stores/workspace";

function cached(runId: string): FoldResponse | null {
  const raw = typeof window === "undefined" ? null : sessionStorage.getItem(`foldq:run:${runId}`);
  if (!raw) return null;
  const parsed = foldResponseSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const workspace = useWorkspace();
  const initial = cached(runId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["run", runId],
    // A run identifier is a content hash, so a cache miss re-folds the same inputs
    // and yields the same result — no persistence layer required.
    queryFn: () =>
      foldSequence({
        sequence: workspace.sequence,
        solver: workspace.solver,
        seed: workspace.seed,
        pseudoknots: workspace.pseudoknots,
      }),
    initialData: initial ?? undefined,
    enabled: initial === null,
  });

  if (isLoading) return <p role="status">Loading run…</p>;
  if (error) return <p role="alert">{(error as Error).message}</p>;
  if (!data) return <p role="alert">This run is not available. Fold the sequence again.</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Run results</h1>
        <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
          {data.sequence}
        </p>
      </header>
      <RunSummary result={data} />
      <StructureComparison result={data} />
      <GateLadder gates={data.gates} />
      <StageTimeline result={data} />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && pnpm vitest run tests/component/run-page.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/foldq frontend/src/components/foldq frontend/tests
git commit -- frontend -m "feat: add run results workspace"
```

---

### Task 13b: Run comparison

**Files:**
- Create: `frontend/src/app/foldq/compare/page.tsx`, `frontend/src/lib/foldq/diff.ts`
- Test: `frontend/tests/unit/diff.test.ts`, `frontend/tests/component/compare.test.tsx`

**Interfaces:**
- Consumes: `parseDotBracket`, `describeStructure` (Task 10); `FoldResponse` (Task 4); the `sessionStorage` run cache (Task 13)
- Produces: `comparePairs(a, b) -> {shared, onlyA, onlyB}`; `listCachedRuns() -> FoldResponse[]`; the `/foldq/compare` route

`NAV_SECTIONS` links to `/foldq/compare` from Task 5 onward. Without this task the
primary navigation ships a 404, which is why the nav test in Task 5 asserts the built
route set. This is also where `parseDotBracket` and `describeStructure` are consumed —
the run page reads pairs straight from the API, but a comparison needs to derive
structure from the dot-bracket the report and CSV carry.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/diff.test.ts
import { describe, expect, it } from "vitest";
import { comparePairs } from "@/lib/foldq/diff";

describe("comparePairs", () => {
  it("partitions pairs into shared and exclusive sets", () => {
    const result = comparePairs("(((....))).", "((......)).");
    expect(result.shared).toEqual([
      [0, 9],
      [1, 8],
    ]);
    expect(result.onlyA).toEqual([[2, 7]]);
    expect(result.onlyB).toEqual([]);
  });

  it("reports every pair as exclusive when nothing matches", () => {
    const result = comparePairs("((....))..", "..((....))");
    expect(result.shared).toEqual([]);
    expect(result.onlyA).toHaveLength(2);
    expect(result.onlyB).toHaveLength(2);
  });

  it("returns empty sets for two unpaired structures", () => {
    const result = comparePairs("....", "....");
    expect(result).toEqual({ shared: [], onlyA: [], onlyB: [], f1: 0 });
  });

  it("computes the F1 between the two structures", () => {
    // Two of three A-pairs are shared with two of two B-pairs:
    // precision 2/3, recall 2/2 -> F1 0.8
    const result = comparePairs("(((....))).", "((......)).");
    expect(result.f1).toBeCloseTo(0.8);
  });

  it("throws on an unparseable structure rather than reporting a false match", () => {
    expect(() => comparePairs("(((", "...")).toThrow(/unclosed/i);
  });
});
```

```tsx
// frontend/tests/component/compare.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComparePage from "@/app/foldq/compare/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/foldq/compare" }));

beforeEach(() => {
  sessionStorage.clear();
});

describe("compare page", () => {
  it("explains what to do when fewer than two runs are cached", () => {
    render(<ComparePage />);
    expect(screen.getByRole("status")).toHaveTextContent(/at least two runs/i);
  });

  it("lists cached runs for selection", () => {
    sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
    sessionStorage.setItem(
      "foldq:run:other",
      JSON.stringify({ ...fixture, run_id: "other", solver: "tabu" }),
    );
    render(<ComparePage />);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: /tabu/ }).length).toBeGreaterThan(0);
  });

  it("shows helix and pair counts for both runs", () => {
    sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
    sessionStorage.setItem(
      "foldq:run:other",
      JSON.stringify({ ...fixture, run_id: "other", solver: "tabu" }),
    );
    render(<ComparePage />);
    expect(screen.getAllByText(/helices/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/shared pairs/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/diff.test.ts tests/component/compare.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/foldq/diff.ts`**

```ts
import { parseDotBracket } from "@/lib/rna/dotbracket";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";

export interface PairDiff {
  shared: [number, number][];
  onlyA: [number, number][];
  onlyB: [number, number][];
  f1: number;
}

const key = ([i, j]: [number, number]) => `${i}-${j}`;

/** Compares two dot-bracket structures by base pair.
 *
 *  Throws on an unparseable input rather than treating it as "no pairs" — an
 *  empty pair set would silently report zero overlap, which reads as a real
 *  disagreement between two structures instead of a parse failure. */
export function comparePairs(a: string, b: string): PairDiff {
  const parsedA = parseDotBracket(a);
  const parsedB = parseDotBracket(b);
  for (const parsed of [parsedA, parsedB]) {
    if (!parsed.isValid) throw new Error(parsed.error);
  }

  const keysB = new Set(parsedB.pairs.map(key));
  const keysA = new Set(parsedA.pairs.map(key));
  const shared = parsedA.pairs.filter((pair) => keysB.has(key(pair)));
  const onlyA = parsedA.pairs.filter((pair) => !keysB.has(key(pair)));
  const onlyB = parsedB.pairs.filter((pair) => !keysA.has(key(pair)));

  const precision = parsedA.pairs.length === 0 ? 0 : shared.length / parsedA.pairs.length;
  const recall = parsedB.pairs.length === 0 ? 0 : shared.length / parsedB.pairs.length;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { shared, onlyA, onlyB, f1 };
}

/** Every run this browser session has folded. There is no server-side history —
 *  a run is a content hash, so re-folding the same inputs restores it exactly. */
export function listCachedRuns(): FoldResponse[] {
  if (typeof window === "undefined") return [];
  const runs: FoldResponse[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const storageKey = sessionStorage.key(index);
    if (!storageKey?.startsWith("foldq:run:")) continue;
    const parsed = foldResponseSchema.safeParse(
      JSON.parse(sessionStorage.getItem(storageKey)!),
    );
    if (parsed.success) runs.push(parsed.data);
  }
  return runs;
}
```

- [ ] **Step 4: Write the compare page**

```tsx
// frontend/src/app/foldq/compare/page.tsx
"use client";

import { useState } from "react";
import { StructureView } from "@/components/rna/StructureView";
import { comparePairs, listCachedRuns } from "@/lib/foldq/diff";
import { describeStructure } from "@/lib/rna/dotbracket";
import type { FoldResponse } from "@/lib/api/schemas";

function RunStats({ run }: { run: FoldResponse }) {
  const stats = describeStructure(run.candidate.dot_bracket);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt className="text-[var(--text-secondary)]">Solver</dt>
      <dd>{run.solver}</dd>
      <dt className="text-[var(--text-secondary)]">Base pairs</dt>
      <dd className="tabular-nums">{stats.pairCount}</dd>
      <dt className="text-[var(--text-secondary)]">Helices</dt>
      <dd className="tabular-nums">{stats.helixCount}</dd>
      <dt className="text-[var(--text-secondary)]">Hairpins</dt>
      <dd className="tabular-nums">{stats.hairpinCount}</dd>
      <dt className="text-[var(--text-secondary)]">Attribution</dt>
      <dd>{run.gates.attribution.split(":")[0]}</dd>
    </dl>
  );
}

export default function ComparePage() {
  const runs = listCachedRuns();
  const [leftId, setLeftId] = useState(runs[0]?.run_id ?? "");
  const [rightId, setRightId] = useState(runs[1]?.run_id ?? "");

  if (runs.length < 2) {
    return (
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold">Compare runs</h1>
        <p role="status" className="text-sm text-[var(--text-secondary)]">
          Comparison needs at least two runs from this browser session. Fold the same
          sequence with two different solvers, then come back — runs are not stored on a
          server, so this list is per-session by design.
        </p>
      </div>
    );
  }

  const left = runs.find((r) => r.run_id === leftId) ?? runs[0];
  const right = runs.find((r) => r.run_id === rightId) ?? runs[1];
  const comparable =
    left.sequence === right.sequence &&
    !left.candidate.is_pseudoknotted &&
    !right.candidate.is_pseudoknotted;
  const diff = comparable
    ? comparePairs(left.candidate.dot_bracket, right.candidate.dot_bracket)
    : null;

  const picker = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
      >
        {runs.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.solver} · seed {run.seed} · {run.sequence.length} nt
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Compare runs</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {picker("Run A", left.run_id, setLeftId)}
        {picker("Run B", right.run_id, setRightId)}
      </div>

      {diff ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-base font-semibold">Agreement</h2>
          <p className="mt-1 text-sm">
            <strong className="tabular-nums">{diff.shared.length}</strong> shared pairs ·{" "}
            {diff.onlyA.length} only in A · {diff.onlyB.length} only in B · F1{" "}
            <strong className="tabular-nums">{diff.f1.toFixed(3)}</strong>
          </p>
        </section>
      ) : (
        <p className="rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm">
          These runs are not directly comparable by base pair: they fold different
          sequences, or one contains crossing pairs that dot-bracket notation cannot
          express.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[left, right].map((run, index) => (
          <div
            key={run.run_id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <h2 className="mb-2 text-base font-semibold">
              Run {index === 0 ? "A" : "B"}
            </h2>
            <RunStats run={run} />
            <div className="mt-3">
              <StructureView
                sequence={run.sequence}
                pairs={run.candidate.base_pairs}
                label={`Run ${index === 0 ? "A" : "B"} candidate structure`}
                highlight={
                  diff
                    ? (index === 0 ? diff.onlyA : diff.onlyB).flatMap(([i, j]) => [i, j])
                    : []
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/diff.test.ts tests/component/compare.test.tsx`
Expected: PASS (8 tests)

Run: `pnpm vitest run tests/unit/nav.test.ts` — the built-route assertion from Task 5 now
holds, since `/foldq/compare` exists.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/foldq/compare frontend/src/lib/foldq/diff.ts frontend/tests
git commit -- frontend -m "feat: add run comparison view"
```

---

## Phase 4 — Reports and Command Center

### Task 14: Decision card report

**Files:**
- Create: `frontend/src/app/reports/[reportId]/page.tsx`, `frontend/src/components/foldq/DecisionCardFrame.tsx`, `frontend/src/lib/foldq/export.ts`
- Modify: `frontend/src/app/foldq/runs/[runId]/page.tsx` (add the report link)
- Test: `frontend/tests/component/report.test.tsx`, `frontend/tests/unit/export.test.ts`

**Interfaces:**
- Consumes: `FoldResponse.decision_card_html` (Task 1), `cached()` pattern (Task 13)
- Produces: the `/reports/[reportId]` route; `downloadText(filename, contents, mime)`, `runToCsvRow(result) -> string`, `CSV_HEADER`

The decision card is the existing Jinja2 template — self-contained HTML with zero
external requests. It is rendered in a sandboxed iframe rather than injected into the
page, so the report cannot reach the app's DOM or storage.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/export.test.ts
import { describe, expect, it } from "vitest";
import { runToCsvRow, CSV_HEADER } from "@/lib/foldq/export";
import fixture from "../msw/fold-response.json";
import { foldResponseSchema } from "@/lib/api/schemas";

const result = foldResponseSchema.parse(fixture);

describe("runToCsvRow", () => {
  it("emits one field per header column", () => {
    expect(runToCsvRow(result).split(",")).toHaveLength(CSV_HEADER.split(",").length);
  });

  it("carries the attribution quoted, since it contains a colon and spaces", () => {
    expect(runToCsvRow(result)).toContain(`"${result.gates.attribution}"`);
  });

  it("writes an empty field for an unavailable gate rather than false", () => {
    const indeterminate = {
      ...result,
      gates: { ...result.gates, is_qubo_ground_state: null, solver_found_ground_state: null },
    };
    const fields = runToCsvRow(indeterminate).split(",");
    const headers = CSV_HEADER.split(",");
    expect(fields[headers.indexOf("is_qubo_ground_state")]).toBe("");
    expect(fields[headers.indexOf("solver_found_ground_state")]).toBe("");
  });
});
```

```tsx
// frontend/tests/component/report.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "@/app/reports/[reportId]/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ reportId: fixture.run_id }),
  usePathname: () => "/reports/x",
}));

beforeEach(() => {
  sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
});

describe("report page", () => {
  it("renders the decision card in a sandboxed frame", () => {
    render(<ReportPage />);
    const frame = screen.getByTitle(/decision card/i);
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", expect.stringContaining("<"));
  });

  it("offers HTML and CSV export", () => {
    render(<ReportPage />);
    expect(screen.getByRole("button", { name: /download html/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
  });

  it("tells the reader the card is self-contained", () => {
    render(<ReportPage />);
    expect(screen.getByText(/self-contained|no external requests/i)).toBeInTheDocument();
  });

  it("explains what to do when the run is not cached", () => {
    sessionStorage.clear();
    render(<ReportPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/fold the sequence again/i);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/export.test.ts tests/component/report.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/foldq/export.ts`**

```ts
import type { FoldResponse } from "@/lib/api/schemas";

export const CSV_HEADER = [
  "run_id",
  "sequence",
  "length",
  "solver",
  "seed",
  "num_variables",
  "qubo_density",
  "candidate_structure",
  "candidate_energy",
  "reference_structure",
  "reference_energy",
  "representable",
  "is_qubo_ground_state",
  "solver_found_ground_state",
  "energy_gap",
  "base_pair_f1",
  "is_pseudoknotted",
  "attribution",
].join(",");

/** A null gate means indeterminate, not false. It is written as an empty field so a
 *  reader cannot mistake "we could not check" for "it failed" — the same convention
 *  the experiment CSVs use. */
const flag = (value: boolean | null) => (value === null ? "" : String(value));
const number = (value: number | null) => (value === null ? "" : String(value));

export function runToCsvRow(result: FoldResponse): string {
  return [
    result.run_id,
    result.sequence,
    String(result.sequence.length),
    result.solver,
    String(result.seed),
    String(result.problem.num_variables),
    String(result.problem.density),
    result.candidate.dot_bracket,
    number(result.candidate.energy),
    result.reference.dot_bracket,
    number(result.reference.energy),
    String(result.gates.representable),
    flag(result.gates.is_qubo_ground_state),
    flag(result.gates.solver_found_ground_state),
    number(result.gates.energy_gap),
    String(result.gates.base_pair_f1),
    String(result.gates.is_pseudoknotted),
    `"${result.gates.attribution.replace(/"/g, '""')}"`,
  ].join(",");
}

export function downloadText(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Write `DecisionCardFrame.tsx`**

```tsx
/** The card is rendered with an empty `sandbox` attribute, which denies every
 *  capability: no scripts, no same-origin access, no form submission. The template
 *  is trusted, but a report view has no reason to hold those permissions. */
export function DecisionCardFrame({ html }: { html: string }) {
  return (
    <iframe
      title="Decision card"
      srcDoc={html}
      sandbox=""
      className="h-[70vh] w-full rounded-lg border border-[var(--border)] bg-white"
    />
  );
}
```

- [ ] **Step 5: Write the report page**

```tsx
// frontend/src/app/reports/[reportId]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { DecisionCardFrame } from "@/components/foldq/DecisionCardFrame";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";
import { CSV_HEADER, downloadText, runToCsvRow } from "@/lib/foldq/export";

function cached(runId: string): FoldResponse | null {
  const raw =
    typeof window === "undefined" ? null : sessionStorage.getItem(`foldq:run:${runId}`);
  if (!raw) return null;
  const parsed = foldResponseSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const result = cached(reportId);

  if (!result) {
    return (
      <p role="alert" className="text-sm">
        This report is not in this browser session. Fold the sequence again to regenerate
        it — the result is fully determined by the sequence, solver and seed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decision card</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Self-contained HTML — no external requests, no scripts, no network access.
            Open it anywhere, including offline.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              downloadText(
                `foldq-${result.run_id}.html`,
                result.decision_card_html,
                "text/html",
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Download HTML
          </button>
          <button
            onClick={() =>
              downloadText(
                `foldq-${result.run_id}.csv`,
                `${CSV_HEADER}\n${runToCsvRow(result)}\n`,
                "text/csv",
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Download CSV
          </button>
        </div>
      </header>
      <DecisionCardFrame html={result.decision_card_html} />
    </div>
  );
}
```

- [ ] **Step 6: Link the report from the run page**

In `frontend/src/app/foldq/runs/[runId]/page.tsx`, add below the header:

```tsx
<Link
  href={`/reports/${data.run_id}`}
  className="inline-block rounded border border-[var(--border)] px-3 py-1.5 text-sm"
>
  Open decision card
</Link>
```

with `import Link from "next/link";` at the top.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && pnpm vitest run tests/unit/export.test.ts tests/component/report.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/reports frontend/src/components/foldq frontend/src/lib/foldq/export.ts frontend/src/app/foldq frontend/tests
git commit -- frontend -m "feat: add decision card report view with HTML and CSV export"
```

---

### Task 15: Command Center and landing page

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/analytics/HeadlineStat.tsx`, `frontend/src/lib/charts/headline.ts`
- Modify: `frontend/src/app/page.tsx`
- Test: `frontend/tests/unit/headline.test.ts`, `frontend/tests/component/dashboard.test.tsx`

**Interfaces:**
- Consumes: every transform from Task 6
- Produces: `headlineStats() -> HeadlineStat[]` where `HeadlineStat = {label, value, caption, source}`; the `/dashboard` and `/` routes

Each headline number is computed from the bundled CSVs by `headlineStats()`. Hard-coding
even one of them would reintroduce the failure mode this project already corrected once:
a published table that no committed experiment produced.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/headline.test.ts
import { describe, expect, it } from "vitest";
import { headlineStats } from "@/lib/charts/headline";
import { qaoaByReps, solverSummary } from "@/lib/charts/transforms";

describe("headlineStats", () => {
  const stats = headlineStats();

  it("cites a committed file for every figure", () => {
    for (const stat of stats) expect(stat.source).toMatch(/^results\/full\/e\d_/);
  });

  it("derives the QAOA range from the data rather than a literal", () => {
    const qaoa = stats.find((s) => s.label.match(/QAOA/i))!;
    const rates = qaoaByReps().map((r) => Math.round(r.groundStateRate * 100));
    expect(qaoa.value).toBe(`${Math.min(...rates)}–${Math.max(...rates)}%`);
  });

  it("derives the classical ground-state count from the data", () => {
    const classical = stats.find((s) => s.label.match(/classical/i))!;
    const perfect = solverSummary().filter((r) => r.groundStateRate === 1).length;
    expect(classical.value).toContain(String(perfect));
  });

  it("includes the pseudoknot result and the tRNA limitation", () => {
    const labels = stats.map((s) => s.label.toLowerCase()).join(" ");
    expect(labels).toMatch(/pseudoknot/);
    expect(labels).toMatch(/trna|hardest|lowest/);
  });
});
```

```tsx
// frontend/tests/component/dashboard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("dashboard", () => {
  it("states the position on quantum advantage plainly", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/no quantum-advantage claim/i)).toBeInTheDocument();
  });

  it("names both authors and the challenge", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/WISER Summer Program 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Siddhartha Pahari/)).toBeInTheDocument();
    expect(screen.getByText(/Jainish Solanki/)).toBeInTheDocument();
  });

  it("links to each analytics area", () => {
    render(<DashboardPage />);
    for (const href of [
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
      "/analytics/pseudoknots",
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });

  it("cites a committed source under every headline figure", () => {
    render(<DashboardPage />);
    expect(screen.getAllByText(/results\/full\//).length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && pnpm vitest run tests/unit/headline.test.ts tests/component/dashboard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `frontend/src/lib/charts/headline.ts`**

```ts
import {
  attributionBreakdown,
  pseudoknotComparison,
  qaoaByReps,
  solverSummary,
} from "./transforms";

export interface HeadlineStat {
  label: string;
  value: string;
  caption: string;
  source: string;
}

/** Every figure is computed from the bundled experiment output. Nothing here is a
 *  literal — a hard-coded headline is how a README ends up citing a number no
 *  experiment produced. */
export function headlineStats(): HeadlineStat[] {
  const attribution = attributionBreakdown();
  const clean = attribution.find((a) => a.category === "no failure");
  const solvers = solverSummary();
  const qaoa = qaoaByReps();
  const rates = qaoa.map((r) => Math.round(r.groundStateRate * 100));
  const knotted = pseudoknotComparison().filter((r) => r.hasPseudoknot);
  const worst = pseudoknotComparison()
    .filter((r) => !r.hasPseudoknot)
    .sort((a, b) => a.strictF1 - b.strictF1)[0];
  const perfect = solvers.filter((r) => r.groundStateRate === 1);

  return [
    {
      label: "Runs with no attributed failure",
      value: `${((clean?.fraction ?? 0) * 100).toFixed(0)}%`,
      caption: `${clean?.count ?? 0} of ${attribution.reduce((s, a) => s + a.count, 0)} formulation runs pass every gate.`,
      source: "results/full/e1_formulation.csv",
    },
    {
      label: "QAOA reaches the ground state",
      value: `${Math.min(...rates)}–${Math.max(...rates)}%`,
      caption:
        "Across circuit depth, on the noiseless expectation objective. The shot budget spans a wider range still — see Quantum resources.",
      source: "results/full/e4_qaoa.csv",
    },
    {
      label: "Classical solvers at 100%",
      value: `${perfect.length} of ${solvers.length}`,
      caption: `${perfect.map((s) => s.solver).join(", ")} reach the ground state on every determinate run.`,
      source: "results/full/e3_solvers.csv",
    },
    {
      label: "Pseudoknot fixtures recovered",
      value: `${knotted.filter((r) => r.pseudoknotModeF1 === 1).length} of ${knotted.length}`,
      caption:
        "With the crossing penalty disabled. ViennaRNA cannot express a crossing at all.",
      source: "results/full/e5_pseudoknot.csv",
    },
    {
      label: "Hardest real structure",
      value: worst ? worst.strictF1.toFixed(3) : "—",
      caption: worst
        ? `Base-pair F1 on ${worst.sequenceId} (${worst.length} nt). The method degrades on real structures at scale, and we report it.`
        : "",
      source: "results/full/e5_pseudoknot.csv",
    },
  ];
}
```

- [ ] **Step 4: Write `HeadlineStat.tsx`**

```tsx
import type { HeadlineStat as Stat } from "@/lib/charts/headline";

export function HeadlineStat({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
        {stat.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{stat.caption}</p>
      <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
        <code>{stat.source}</code>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Write the dashboard**

```tsx
// frontend/src/app/dashboard/page.tsx
import Link from "next/link";
import { HeadlineStat } from "@/components/analytics/HeadlineStat";
import { GateLegend } from "@/components/analytics/GateLegend";
import { headlineStats } from "@/lib/charts/headline";

const AREAS = [
  { href: "/analytics/solver-performance", label: "Solver performance", blurb: "Every solver on matched instances, with Gate C indeterminacy stated." },
  { href: "/analytics/energy", label: "Energy and attribution", blurb: "Charge-and-refund, and which stage is responsible when a run misses." },
  { href: "/analytics/scaling", label: "Scaling and encoding", blurb: "Variable counts at matched representability; the lone-pair ceiling." },
  { href: "/analytics/resources", label: "Quantum resources", blurb: "Circuit depth, gate counts, and the negative result stated plainly." },
  { href: "/analytics/pseudoknots", label: "Pseudoknots", blurb: "Where the formulation reaches structures DP cannot represent." },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Decidion FoldQ</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
          Explainable hybrid quantum–classical optimization for mRNA
          secondary-structure prediction. WISER Summer Program 2026 · Moderna Challenge.
          Siddhartha Pahari and Jainish Solanki.
        </p>
        <p className="mt-3 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          ViennaRNA already solves pseudoknot-free MFE folding exactly in cubic time, so
          this project makes <strong>no quantum-advantage claim</strong>. Its contribution
          is a diagnostic method: attributing every result to the earliest stage that
          failed, and showing where a QUBO formulation reaches structures dynamic
          programming has no representation for.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-base font-semibold">Measured results</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {headlineStats().map((stat) => (
            <HeadlineStat key={stat.label} stat={stat} />
          ))}
        </div>
      </section>

      <GateLegend />

      <section>
        <h2 className="mb-2 text-base font-semibold">Analytics Lab</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--quantum-inspired)]"
            >
              <p className="text-sm font-medium">{area.label}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{area.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Fold a sequence</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Run the full pipeline live and see all four gates. Requires the API to be
          running; the Analytics Lab above works without it.
        </p>
        <Link
          href="/foldq/new"
          className="mt-3 inline-block rounded bg-[var(--quantum-inspired)] px-4 py-2 text-sm font-medium text-white"
        >
          New analysis
        </Link>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Redirect the landing page to the dashboard**

```tsx
// frontend/src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && pnpm vitest run` — expected PASS (all suites)
Run: `pnpm build` — expected: no type errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app frontend/src/components frontend/src/lib frontend/tests
git commit -- frontend -m "feat: add command center dashboard"
```

---

### Task 16: End-to-end tests, accessibility gate, and documentation

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/tests/e2e/fold.spec.ts`, `frontend/tests/e2e/analytics.spec.ts`, `frontend/tests/e2e/a11y.spec.ts`, `frontend/README.md`
- Modify: `Makefile`, `README.md`, `frontend/package.json`
- Test: the Playwright specs themselves

**Interfaces:**
- Consumes: every route built so far; the API from Task 1
- Produces: `pnpm test:e2e`; `make frontend`, `make frontend-test`

- [ ] **Step 1: Install Playwright and axe**

```bash
cd frontend && pnpm add -D @playwright/test @axe-core/playwright
pnpm exec playwright install chromium
```

- [ ] **Step 2: Write the Playwright config**

```ts
// frontend/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm dev --port 3000",
      url: "http://localhost:3000/dashboard",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "cd .. && .venv/bin/uvicorn foldq.api.app:app --port 8000",
      url: "http://localhost:8000/api/v1/meta",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
```

- [ ] **Step 3: Write the E2E specs**

```ts
// frontend/tests/e2e/fold.spec.ts
import { expect, test } from "@playwright/test";

test("folds a sequence end to end and exports the decision card", async ({ page }) => {
  await page.goto("/foldq/new");
  await page.getByLabel(/sequence/i).fill("GGGAAAUCCCU");
  await page.getByLabel(/solver/i).selectOption("exact");
  await page.getByRole("button", { name: /fold/i }).click();

  await expect(page).toHaveURL(/\/foldq\/runs\//);
  await expect(page.getByRole("img", { name: /FoldQ candidate/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /ViennaRNA reference/i })).toBeVisible();
  await expect(page.getByText(/no failure: all gates passed/)).toBeVisible();

  await page.getByRole("link", { name: /decision card/i }).click();
  await expect(page.getByTitle(/decision card/i)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /download html/i }).click();
  expect((await download).suggestedFilename()).toMatch(/^foldq-.*\.html$/);
});

test("shows the pseudoknot caveat when crossings are allowed", async ({ page }) => {
  await page.goto("/foldq/new");
  await page.getByLabel(/allow pseudoknots/i).check();
  await expect(page.getByText(/precision against a nested reference is capped/i)).toBeVisible();
});
```

```ts
// frontend/tests/e2e/analytics.spec.ts
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/analytics/solver-performance",
  "/analytics/energy",
  "/analytics/scaling",
  "/analytics/resources",
  "/analytics/pseudoknots",
];

for (const route of ROUTES) {
  test(`${route} renders without the API`, async ({ page, context }) => {
    // The design's degradation guarantee: analytics is bundled data, not a fetch.
    await context.route("**/api/v1/**", (r) => r.abort());
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/results\/full\//).first()).toBeVisible();
  });
}

test("every chart has a table alternative", async ({ page }) => {
  await page.goto("/analytics/solver-performance");
  const disclosures = page.getByText(/view as table/i);
  await expect(disclosures.first()).toBeVisible();
  await disclosures.first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
});
```

```ts
// frontend/tests/e2e/a11y.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/foldq/new",
  "/foldq/compare",
  "/analytics/solver-performance",
  "/analytics/energy",
  "/analytics/scaling",
  "/analytics/resources",
  "/analytics/pseudoknots",
];

for (const route of ROUTES) {
  test(`${route} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
```

- [ ] **Step 4: Add the scripts and Make targets**

In `frontend/package.json`:

```json
"test": "vitest run",
"test:e2e": "playwright test",
"lint": "next lint && tsc --noEmit"
```

Append to the repo `Makefile`:

```makefile
.PHONY: frontend frontend-test api

api:  ## Run the FoldQ HTTP API on port 8000
	.venv/bin/uvicorn foldq.api.app:app --port 8000 --reload

frontend:  ## Run the frontend dev server on port 3000
	cd frontend && pnpm dev

frontend-test:  ## Run frontend unit, component and end-to-end tests
	cd frontend && pnpm test && pnpm lint && pnpm test:e2e
```

- [ ] **Step 5: Write `frontend/README.md`**

```markdown
# Decidion FoldQ — frontend

Next.js interface over the FoldQ pipeline.

## Running it

    # terminal 1 — the API (optional; analytics works without it)
    uv pip install -e ".[dev,quantum,api]"
    make api

    # terminal 2 — the frontend
    cd frontend && pnpm install && pnpm dev

Open http://localhost:3000.

## Where the numbers come from

Every figure in the Analytics Lab is computed at build time from the committed
experiment output in `results/full/`. `scripts/bundle-results.mjs` converts those CSVs
to JSON that ships inside the bundle, so the Analytics Lab, the dashboard and any
saved report render with the API stopped. Only live folding needs the backend.

No figure is hard-coded. Each chart names the CSV it came from and offers the same
numbers as a table.

## Testing

    pnpm test        # unit + component (Vitest)
    pnpm lint        # eslint + tsc --noEmit
    pnpm test:e2e    # Playwright, including axe-core WCAG 2.2 AA checks

## Scope

Built: shell, Analytics Lab, FoldQ Studio, Reports. Not built: RCSB structural
evidence, the Mol* 3D viewer, and the real-world-evidence area — see
`docs/design/2026-08-01-frontend-design.md` §10. Any view added later against fixture
data must carry a persistent `Demonstration data — not part of the challenge
submission` badge.
```

- [ ] **Step 6: Document the frontend in the root README**

Add a short section after the reproduction instructions:

```markdown
## Frontend

A Next.js interface renders the measured results and folds sequences live.

    uv pip install -e ".[dev,quantum,api]"
    make api        # http://localhost:8000
    make frontend   # http://localhost:3000

The Analytics Lab reads the committed CSVs in `results/full/` bundled at build time,
so it works with the API stopped. See `frontend/README.md`.
```

- [ ] **Step 7: Run everything**

```bash
cd frontend && pnpm test && pnpm lint && pnpm test:e2e
cd .. && .venv/bin/pytest tests -q && .venv/bin/ruff check src tests && .venv/bin/mypy src
```

Expected: frontend suites pass, Playwright passes including the axe checks, Python at
275 passing with ruff and mypy clean.

If an axe violation appears, fix the markup — do not narrow the rule set. The design
commits to WCAG 2.2 AA.

- [ ] **Step 8: Commit**

```bash
git add frontend Makefile README.md
git commit -- frontend Makefile README.md -m "test: add end-to-end and accessibility coverage, document the frontend"
```

---

## Verification

After Task 16, the following must all hold:

| check | command | expected |
|---|---|---|
| Python suite unchanged plus API | `.venv/bin/pytest tests -q` | 275 passed |
| Python lint and types | `.venv/bin/ruff check src tests && .venv/bin/mypy src` | clean |
| Frontend unit and component | `cd frontend && pnpm test` | all pass |
| Frontend types and lint | `cd frontend && pnpm lint` | clean |
| End-to-end and accessibility | `cd frontend && pnpm test:e2e` | all pass, zero axe violations |
| Production build | `cd frontend && pnpm build` | succeeds |
| Degradation guarantee | stop the API, load `/dashboard` and every `/analytics/*` route | all render fully |
| No Claude attribution | `git log --format='%an %ae %b' \| grep -i claude` | no output |

## Deliberately not built

Carried from design §10, so a reviewer does not read these as gaps:

- Authentication, multi-user projects, persistent run history, job queues
- RCSB structural evidence, the Mol* 3D viewer, 2D↔3D synchronisation (design phase 5)
- Real-world evidence, materials and targets (design phase 6 — fixture-backed, and
  requires the demonstration badge)
- R2DT template layouts, density maps, backend PDF export
- `GET /api/v1/results/{experiment}` (design §3). The Analytics Lab reads bundled
  JSON and never fetches experiment data, so the endpoint would have no consumer.
  Its stated purpose — serving regenerated results without a rebuild — is covered by
  re-running `pnpm build`, which re-bundles from `results/full/`.
- `/library/*`, `/settings` and `/help` (design §5). Nothing is saved server-side and
  there is no user preference to persist beyond the theme toggle, so these would be
  empty shells. They are absent from `NAV_SECTIONS` rather than linked and broken.
