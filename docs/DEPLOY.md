# Deploying Decidion FoldQ on Vercel (free)

**Live now:**

| | URL |
|---|---|
| Site | <https://decidion-foldq.vercel.app> |
| API | <https://decidion-foldq-api.vercel.app> |


Both halves run on **Vercel Hobby**, as two projects from this one repository. No
card, no other provider.

| project | Root Directory | what it serves |
|---|---|---|
| `foldq` | `frontend` | the Next.js site |
| `foldq-api` | *(repo root)* | the FastAPI serverless function |

**Both are connected to the GitHub repository**, so a push to `main` redeploys
them automatically. The site project's Root Directory is set to `frontend`; the
API project builds from the repository root.

One trap worth recording: `.vercelignore` patterns are matched at **any depth**
unless they start with `/`. An unanchored `scripts/` excluded `frontend/scripts`
as well, which removed `bundle-results.mjs` and broke the site's prebuild. It
stayed hidden while deploys were done by CLI from inside `frontend/`, because a
CLI deploy run from a subdirectory never reads a root `.vercelignore` at all.

They are separate projects because they **degrade** separately. The Analytics
Lab, the dashboard and saved reports read experiment data bundled at build time
and never call the API, so if the API is broken or removed entirely, everything
except live folding and the PDB structure views still works. That is covered by
`frontend/tests/e2e/analytics.spec.ts`, which aborts every `/api/**` request and
asserts the pages still render.

---

## What this deployment leaves out, and why

Vercel caps a serverless function at **250 MB uncompressed**. The full dependency
set is ~490 MB, so `requirements.txt` installs the classical stack only —
**147 MB measured** — and omits qiskit, qiskit-aer, scipy, pandas and matplotlib.

That is not a compromise on the fold path: tracing a real `simulated_annealing`
run shows it imports ViennaRNA, numpy, networkx, dimod and dwave-samplers and
nothing heavier. Verified in a clean Python 3.11 environment with only
`requirements.txt` installed — `/meta`, a simulated-annealing fold, an exact fold
(F1 1.0), decision-card rendering and the RCSB proxy all work.

**The consequence: `qaoa` and `cvar_qaoa` are not available on the deployed API.**
`foldq.pipeline` probes for qiskit and does not register what it cannot run, so
`/api/v1/meta` advertises the seven classical solvers, the frontend's solver
picker offers exactly those, and asking for `qaoa` returns a 422 naming the ones
that exist. The QAOA results in the README come from `make reproduce` run
locally, and the Analytics Lab renders them from committed CSVs either way.

---

## 1. API project

Deployed from the repository root, where `api/index.py`, `requirements.txt` and
`vercel.json` live.

1. <https://vercel.com/new> → import `Sjainish04/decidion-foldq`.
2. **Project Name** `decidion-foldq-api` · **Root Directory** the repository root.
3. Deploy. Vercel detects the FastAPI app and routes every path to it.

   **Do not add a `rewrites` rule for `/api/*`.** Vercel now routes backend
   framework projects using the *rewritten destination* path, so a rewrite to
   `/api/index` makes every request arrive at the app as `/api/index` and each
   one 404s — including `/openapi.json`. Native detection already routes
   correctly; the absence of a rewrite is the fix.
4. Check it:

   ```bash
   curl https://decidion-foldq-api.vercel.app/api/v1/meta
   ```

   Expect seven solvers and `"python": "3.1x"`. `qaoa` should be **absent** —
   that is correct, not a broken build.

## 2. Frontend project

1. <https://vercel.com/new> → import the **same repository** again.
2. **Project Name** `decidion-foldq` · **Root Directory** → **`frontend`**.

   The frontend is self-contained: `frontend/src/lib/results/data/*.json` is
   committed, so the build does not need `results/` from the repository root.
   `bundle-results.mjs` regenerates that JSON when the CSVs are present and keeps
   the committed copy when they are not.

   The repository root carries a `package.json` whose only job is to declare
   `packageManager`, so Vercel resolves the same pnpm that wrote the lockfile.
   Without it the build fails with "Ignoring not compatible lockfile".
3. Framework preset should read *Next.js*. Leave the build command alone:
   `pnpm build` runs `prebuild`, which converts the committed experiment CSVs to
   JSON. That step is why the site shows real measured numbers with no API.
4. Environment variable, for Production and Preview:

   ```
   NEXT_PUBLIC_API_URL = https://decidion-foldq-api.vercel.app
   ```

   `NEXT_PUBLIC_` is required — the value is read in the browser.
5. Deploy.

## 3. Point CORS at the frontend

On the **API** project → *Settings → Environment Variables*:

```
FOLDQ_ALLOWED_ORIGINS = https://decidion-foldq.vercel.app
```

Comma-separate more origins if you want preview deployments to fold. Redeploy the
API afterwards so the new value is picked up.

Until this is set the API allows only `http://localhost:3000`, and the browser
blocks every call — the site looks broken while the API is perfectly healthy. It
is the most common cause of "the fold button does nothing".

## 4. Verify

```bash
curl https://<api>/api/v1/meta
curl -X POST https://<api>/api/v1/fold \
  -H 'content-type: application/json' \
  -d '{"sequence":"GGGAAAUCCCU","solver":"exact","seed":42}'
```

The fold returns `"attribution": "no failure: all gates passed"`.

In the browser:

- `/dashboard` and every `/analytics/*` route must render **without** the API. If
  they do not, the problem is the frontend build, not the API.
- `/foldq/new` → fold a sequence. A network error here is almost always
  `FOLDQ_ALLOWED_ORIGINS` not matching the frontend origin exactly — scheme
  included, no trailing slash.

## Limits worth knowing

- **Cold starts.** The first request after idle pays the ViennaRNA and dimod
  import. Subsequent folds are fast; a small fold is well under a second.
- **`maxDuration` is 60 s** in `vercel.json`. `exact` is capped at 60 nt in the
  API and the circuit solvers at 40 nt, so nothing on this deployment can run
  long enough to hit it.
- **Hobby is non-commercial.** Fine for an academic submission.
- `deploy/Dockerfile` remains in the repository for hosts that take a container
  (Cloud Run, Koyeb, a Space with Docker enabled). It has **not** been built —
  there was no Docker daemon available when it was written — so treat its first
  build log as the real test. The Vercel path above is the one that has been
  exercised.
