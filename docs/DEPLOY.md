# Deploying Decidion FoldQ for free

Two independent pieces:

| piece | host | why |
|---|---|---|
| Frontend (Next.js) | **Vercel Hobby** | native Next.js, no card, non-commercial use |
| API (FastAPI + ViennaRNA + Qiskit) | **Hugging Face Spaces**, Docker SDK | 16 GB RAM free; the dependency set is ~500 MB and will not fit a 512 MB tier |

They are deployed separately on purpose. **The Analytics Lab, the dashboard and
saved reports read data bundled at build time and never call the API**, so if the
Space is asleep or the API is down, everything except live folding and the PDB
structure views still works. That degradation is covered by
`frontend/tests/e2e/analytics.spec.ts`, which aborts every `/api/**` request and
asserts the pages still render.

Deploy the API first — you need its URL for the frontend.

---

## 1. API on Hugging Face Spaces

1. Create the Space at <https://huggingface.co/new-space>:
   - **Owner** your account · **Space name** `foldq-api`
   - **License** MIT
   - **SDK** → **Docker** → *Blank*
   - **Hardware** CPU basic (free) · **Visibility** Public

2. Clone it and copy this repository in. A Space is a git repo, and its
   `Dockerfile` must sit at the root — hence the copy rather than a submodule:

   ```bash
   git clone https://huggingface.co/spaces/<your-user>/foldq-api
   cd foldq-api

   # from a clone of this repository
   cp -r <path-to>/decidion-foldq/{src,data,results,pyproject.toml,README.md} .
   cp <path-to>/decidion-foldq/deploy/Dockerfile .
   ```

3. Prepend the Space header to `README.md`. Hugging Face reads this YAML block to
   configure the Space, and the `app_port` line is required — without it the Space
   serves nothing and gives no error explaining why:

   ```yaml
   ---
   title: FoldQ API
   emoji: 🧬
   colorFrom: indigo
   colorTo: purple
   sdk: docker
   app_port: 7860
   pinned: false
   license: mit
   ---
   ```

4. Push:

   ```bash
   git add -A && git commit -m "Deploy FoldQ API" && git push
   ```

   Watch the **Logs** tab. First build takes roughly 5–10 minutes, most of it
   installing Qiskit and SciPy.

5. Once it reports *Running*, check it:

   ```bash
   curl https://<your-user>-foldq-api.hf.space/api/v1/meta
   ```

   You should get the solver list and a `"python": "3.11.x"`. If you get a 404,
   `app_port: 7860` is missing from the README header.

6. **Set the CORS origin.** In *Settings → Variables and secrets*, add a variable
   (not a secret — it is not sensitive):

   ```
   FOLDQ_ALLOWED_ORIGINS = https://<your-vercel-domain>.vercel.app
   ```

   Comma-separate several if you also want preview deployments. Until this is
   set, the browser blocks every call and the site looks broken while the API is
   perfectly healthy — the API defaults to allowing only `http://localhost:3000`.
   You will not have the Vercel domain until step 2 below, so come back to this.

---

## 2. Frontend on Vercel

1. <https://vercel.com/new> → import `Sjainish04/decidion-foldq`.

2. **Set Root Directory to `frontend`.** This is the one setting that is not
   auto-detected and the one that breaks the build if missed — the Next.js app is
   not at the repository root. Vercel still checks out the whole repository, which
   matters because the build reads `results/full/*.csv` from two directories up.

3. Framework preset should read *Next.js*. Leave the build and install commands
   alone: `pnpm build` runs `prebuild`, which converts the committed experiment
   CSVs to JSON. That step is why the site renders real numbers with no API.

4. Add an environment variable:

   ```
   NEXT_PUBLIC_API_URL = https://<your-user>-foldq-api.hf.space
   ```

   It must be set for *Production* (and *Preview*, if you want previews to fold).
   `NEXT_PUBLIC_` is required — the value is read in the browser.

5. Deploy. Then go back and set `FOLDQ_ALLOWED_ORIGINS` on the Space to the
   Vercel domain you were just given, and restart the Space.

---

## 3. Verify the deployment

```bash
# API is up
curl https://<your-user>-foldq-api.hf.space/api/v1/meta

# a real fold
curl -X POST https://<your-user>-foldq-api.hf.space/api/v1/fold \
  -H 'content-type: application/json' \
  -d '{"sequence":"GGGAAAUCCCU","solver":"exact","seed":42}'
```

The fold should return `"attribution": "no failure: all gates passed"`.

In the browser:

- `/dashboard` and every `/analytics/*` route render **without** the API. If they
  break, the problem is the Vercel build, not the Space.
- `/foldq/new` → fold a sequence. If the page reports a network error, the cause
  is almost always `FOLDQ_ALLOWED_ORIGINS` not matching the Vercel domain exactly
  (scheme included, no trailing slash).

---

## Known limits of the free tiers

- **Spaces sleep** after ~48 h idle and take ~30 s to wake. First fold after a
  sleep is slow; nothing breaks.
- **Do not point the demo at `qaoa` for long sequences.** The API caps circuit
  simulation at 40 nt (`exact` at 60) for exactly this reason — an unguarded
  request would hold the worker for a very long time.
- **Vercel Hobby is non-commercial.** Fine for an academic submission.
- Neither tier requires a card.

## Deploying the API elsewhere

The Dockerfile is not Spaces-specific; only the port is a convention. For Google
Cloud Run or Koyeb, build the same image and have it listen on the port the
platform injects:

```dockerfile
CMD ["sh", "-c", "uvicorn foldq.api.app:app --host 0.0.0.0 --port ${PORT:-7860}"]
```

Avoid 512 MB tiers such as Render's free plan: qiskit-aer plus SciPy and pandas
will exhaust that during import.

> **Status:** `deploy/Dockerfile` is written against the versions this project
> pins and its inputs are checked, but it has **not been built locally** — Docker
> was unavailable on the machine where it was authored. Treat the first Space
> build log as the real test.
