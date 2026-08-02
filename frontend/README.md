# Decidion FoldQ — frontend

Next.js interface over the FoldQ pipeline.

## Running it

    # terminal 1 — the API (optional; analytics works without it)
    uv pip install -e ".[dev,quantum,api]"
    make api         # http://localhost:8010 -- 8000 is often occupied on dev machines

    # terminal 2 — the frontend
    cd frontend && pnpm install && pnpm dev

Open http://localhost:3000.

By default the frontend talks to the API at `http://localhost:8010`. Override this with
`NEXT_PUBLIC_API_URL` (see `.env.example`) if your API runs elsewhere.

## Where the numbers come from

Every figure in the Analytics Lab is computed at build time from the committed
experiment output in `results/full/`. `scripts/bundle-results.mjs` converts those CSVs
to JSON that ships inside the bundle, so the Analytics Lab, the dashboard and any
saved report render with the API stopped. Only live folding and RCSB structure search
need the backend.

No figure is hard-coded. Each chart names the CSV it came from and offers the same
numbers as a table.

## Testing

    pnpm test        # unit + component (Vitest)
    pnpm lint        # eslint + tsc --noEmit
    pnpm test:e2e    # Playwright, including axe-core WCAG 2.2 AA checks

`pnpm test:e2e` starts both the frontend (port 3000) and the API (port 8010) for you —
see `playwright.config.ts` — so neither needs to be running first. The first run also
needs the Chromium browser once:

    pnpm exec playwright install chromium

## Scope

Built: shell, Analytics Lab, FoldQ Studio, Reports, and structural evidence (RCSB
search at `/structures` and the Mol* 3D viewer at `/structures/[pdbId]`) — see
`docs/plans/2026-08-01-frontend-structures.md`. Deliberately not built: the CQD
material layer (no underlying data), the real-world-evidence/materials/targets routes
that depended on it, 2D↔3D selection sync (RCSB's residue numbering does not map
cleanly onto sequence position), and automated comparison of FoldQ output against
experimental base pairs (RCSB serves no secondary-structure annotation) — see that
plan's "Deliberately not built" section for the full list and reasoning. Any view added
later against fixture data must carry a persistent `Demonstration data — not part of
the challenge submission` badge.

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
