"""Vercel serverless entry point for the FoldQ API.

Vercel's Python runtime serves an ASGI application named `app` from a module
under `api/`. This is the same `create_app()` the local server and the test suite
use, so the deployment is not a separate code path.

`src` is put on the path rather than installing the project, because installing
it would drag in the full `[project] dependencies` list -- scipy, pandas,
matplotlib, typer -- none of which a fold touches and which together would take
the bundle past Vercel's 250 MB serverless limit. `requirements.txt` beside this
file pins the classical set instead: about 118 MB, traced from a real
simulated_annealing fold.

The QAOA solvers are therefore absent from this deployment by design.
`foldq.pipeline` probes for qiskit and does not advertise what it cannot run, so
`GET /api/v1/meta` reports the solvers this deployment actually supports.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from foldq.api.app import create_app  # noqa: E402

app = create_app()
