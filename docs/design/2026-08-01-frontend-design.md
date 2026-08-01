# Decidion FoldQ Frontend — Design

**Date:** 2026-08-01
**Status:** Approved
**Source spec:** `decidion_foldq_frontend_workflow.md` (42 sections, product vision)
**Deadline context:** WISER Summer Program 2026 submission, 2026-08-07

---

## 1. Premise correction

The source spec opens by assuming *"the backend, scientific pipeline, authentication,
experiment orchestration, and data persistence layers are already implemented."*

Only the scientific pipeline exists. Verified against the repository:

| assumed layer | reality |
|---|---|
| Backend HTTP API | absent — no FastAPI/Flask/uvicorn; spec names 10+ endpoints |
| Authentication | absent — spec has profiles, private structures, authed URLs |
| Data persistence | absent — results are CSV files on disk |
| Experiment orchestration | absent — `predict()` is a synchronous call; spec has run IDs, SSE telemetry, a 12-stage timeline |
| RWE → materials → targets | absent — no domain, schema, or data anywhere in FoldQ |
| RCSB PDB integration | absent — no adapter, ranking, or caching |
| Scientific pipeline | **present** — 267 tests, full reproduction in `results/full/` |

This design therefore specifies both the frontend and the minimum backend seam it
needs, and is explicit about which product areas are backed by real data.

## 2. Data reality per product area

The single most important decision in this design: **each product area declares its
data source, and areas without real data are labelled as demonstration.**

| product area | spec §§ | data source | reality |
|---|---|---|---|
| FoldQ Studio | 9–11 | thin API over `predict()` | real — pipeline exists, ~0.05 s per fold |
| Analytics Lab | 19–23 | committed `results/full/*.csv` | real — 1,008 rows across 5 experiments |
| Reports | 29 | existing Jinja2 decision card | real — self-contained HTML, 0 external requests |
| Structural Evidence | 13–15 | RCSB Search + Data API | live public API, no auth required |
| Command Center | 8 | derived from the above | real once the above land |
| RWE → materials → targets | 12, 24–25 | **fixtures via MSW** | **no data exists — labelled demonstration** |

**Rule:** any view rendering fixture data displays a persistent
`Demonstration data — not part of the challenge submission` badge. Showing invented
evidence records beside measured results would be the same class of credibility
failure the pipeline spent sixteen defects eliminating.

## 3. Backend seam

Added inside the existing Python package as an optional extra (`pip install ".[api]"`),
so the core library and CLI keep their current dependency footprint.

```
src/foldq/api/
  app.py                 FastAPI application, CORS, error handlers
  schemas.py             pydantic models mirroring the spec's TypeScript types
  routes/fold.py         POST /api/v1/fold
  routes/results.py      GET  /api/v1/results/{experiment}   (optional — see below)
  routes/structures.py   GET  /api/v1/structures/*   (RCSB adapter + ranking)
  routes/meta.py         GET  /api/v1/meta           (versions, manifest, health)
```

**The Analytics Lab does not depend on the API.** The five experiment CSVs are
imported at build time and shipped as static JSON in the bundle, so every analytics
route renders with the backend down or absent. `GET /api/v1/results/{experiment}`
exists only to serve freshly regenerated results without a rebuild, and the frontend
falls back to the bundled copy whenever it is unavailable. This is what makes the
degradation guarantee in §9 real rather than aspirational: with the API offline, the
Analytics Lab and Reports remain fully functional and only FoldQ Studio's live-fold
and the RCSB-backed Structural Evidence views go dark.

Four route groups, not the spec's ten. Deliberate omissions and why:

- **No authentication.** Nothing private is served. Adding auth would gate a public
  demonstration behind a login for no benefit.
- **No database.** Folds are ~0.05 s and deterministic given `(sequence, config, seed)`.
  Run identifiers are content hashes of that triple, which makes results shareable and
  reproducible without persistence.
- **No job queue or WebSocket.** A fold returns synchronously. The spec's live-run
  timeline (§10) renders as a staged animation over one real request, driven by actual
  stage boundaries reported in the response — not a fabricated progress bar.

`POST /api/v1/fold` returns the full `PipelineResult` shape: reference structure,
candidate, all four gate verdicts with attribution, energy gap, base-pair F1, QUBO
statistics, resource estimates, and the rendered decision card HTML.

## 4. Stack

As specified in source §4, with versions locked at implementation:

- **Framework** — Next.js (App Router), React, TypeScript strict
- **Styling** — Tailwind CSS, shadcn/ui, Radix primitives, CSS variables for themes
- **Data** — TanStack Query (server state), Zustand (workspace state), Zod (runtime
  validation of every backend response), React Hook Form, URL params for shareable state
- **Visualisation** — Mol* (3D), D3 (RNA 2D, energy landscapes), Apache ECharts
  (scientific charts)
- **Testing** — Vitest, React Testing Library, Playwright, Storybook, MSW, axe-core
- **Motion** — Framer Motion, disabled under `prefers-reduced-motion`

Dark scientific theme default, light publication theme available. Design tokens taken
from source §7.3 unchanged, including the per-nucleotide and per-solver-class colours.

## 5. Information architecture

Routes follow source §5. Those backed by fixtures are marked.

```
/                        marketing / overview
/dashboard               command center
/foldq/new               analysis wizard
/foldq/runs/[runId]      live run + results workspace
/foldq/compare           run comparison
/analytics/solver-performance
/analytics/energy
/analytics/scaling
/analytics/resources
/analytics/structural-evidence     (fixture)
/structures/search       RCSB discovery
/structures/pdb/[pdbId]  Mol* 3D viewer
/rwe, /rwe/[rweId]                 (fixture)
/targets, /targets/[targetId]      (fixture)
/materials, /materials/[id]        (fixture)
/library/*               saved sequences, runs, reports
/reports/[reportId]      decision card
/settings, /help
```

## 6. Component boundaries

Organised so each unit has one purpose and a testable interface:

- `components/rna/` — 2D structure rendering, sequence track, arc diagrams, contact
  maps. Pure functions of `(sequence, pairs, selection)`; no data fetching.
- `components/molecular/` — Mol* controller wrapper. Lazy-loaded, disposes cleanly,
  emits a typed `MolecularSelection`. The only WebGL surface.
- `components/analytics/` — chart components taking already-shaped data. Chart
  transforms live in `lib/charts/` so they are unit-testable without rendering.
- `components/foldq/` — wizard steps, candidate selector, gate ladder display,
  explanation panel.
- `features/*` — one folder per domain, owning its queries, schemas, and hooks.
- `lib/api/` — typed client; every response validated with Zod at the boundary.

The gate ladder gets its own component with the attribution logic mirrored from the
Python `GateReport.attribution`, including the pseudoknot branch where precision
against a nested reference is structurally capped.

## 7. Build order

Resequenced from the source spec's phases so submission-critical work lands first.

| phase | scope | est. |
|---|---|---|
| 1 | Shell, design system, tokens, routing, MSW harness, API client + Zod schemas | 1 d |
| 2 | **Analytics Lab** — all five experiments from committed CSVs | 1 d |
| 3 | **FoldQ Studio** — backend seam, wizard, live fold, RNA 2D, gate ladder | 1.5 d |
| 4 | **Reports** — decision cards rendered in-app, export | 0.5 d |
| 5 | Structural Evidence — RCSB search, ranking, Mol* 3D viewer | 1.5 d |
| 6 | RWE / materials / targets against labelled fixtures | 0.5 d |

Phases 1–4 constitute the WISER submission and are expected to complete. Phases 5–6
are the broader platform vision; Mol* integration and 2D↔3D synchronisation are the
heaviest items in the source spec and are **at genuine risk before 2026-08-07**.
Sequencing them last means an unfinished phase 5 leaves a complete working frontend
rather than six half-built areas.

## 8. Testing

- **Unit** — dot-bracket parsing, gate attribution logic, structure ranking, chart
  transforms, position mapping
- **Component** — RNA viewer, candidate selector, gate ladder, structure card
- **Integration** — Mol* initialises, loads, renders ligands as sticks and metals as
  spheres, emits selections, disposes cleanly
- **E2E (Playwright)** — enter sequence → launch → observe stages → inspect candidate →
  compare with ViennaRNA → export decision card
- **Accessibility** — axe-core in CI, WCAG 2.2 AA target, no colour-only encoding,
  textual alternatives for every chart and molecular scene

Every number the UI displays for FoldQ results must trace to committed output or to a
live API response. No figure is hard-coded.

## 9. Risks

| risk | mitigation |
|---|---|
| Phases 5–6 unfinished by deadline | Sequenced last; phases 1–4 ship standalone |
| Mol* bundle size and init cost | Lazy-load, BinaryCIF, dispose on unmount, viewer shell renders immediately |
| RCSB API unavailable during judging | Cache responses, show retrieval date, never substitute predicted models for experimental ones |
| Fixture data mistaken for real results | Persistent badge on every fixture-backed view; documented in the frontend README |
| Backend deployment fails during judging | Analytics Lab and Reports are static and work with the API down; degrade rather than break |
| Python version pin | `requires-python >=3.11,<3.12` must widen before any 3.12 hosting |

## 10. Out of scope

Authentication, multi-user projects, persistent run history, job queues, real RWE
data ingestion, R2DT template layouts, density maps, and PDF export via backend. All
are in the source spec and all are deferred; none blocks the submission.
