"""Adapter over EMBL-EBI's R2DT service.

R2DT draws RNA secondary structure using curated templates, so a tRNA comes out
in the cloverleaf orientation a biologist expects rather than in whatever shape a
force simulation settles into. That is the value of it here: this project's own
layouts are computed from the structure alone and have no notion of how a family
is conventionally drawn.

It is a job service, not a request/response API — submit, poll, then fetch — so
this wraps that pattern and nothing else. Results are cached in-process keyed by
sequence, because R2DT takes tens of seconds and the same benchmark sequences are
requested repeatedly.

Verified against the live service: submitting this project's tRNA-Phe benchmark
returns a match to the GtRNAdb `E_Phe` template, which is the canonical
cloverleaf.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

BASE = "https://www.ebi.ac.uk/Tools/services/rest/r2dt"

# EBI asks for a contact address on job submission so they can reach the owner of
# a runaway job. It is the project's own address, not a user's.
CONTACT = "jainish.solanki@mail.utoronto.ca"


class R2dtError(RuntimeError):
    """R2DT could not produce a diagram."""


@dataclass(frozen=True)
class R2dtDiagram:
    job_id: str
    svg: str
    template: str | None
    source: str | None

    @property
    def matched_a_template(self) -> bool:
        """False when R2DT fell back to a computed layout.

        Worth surfacing: a templated diagram carries the conventional orientation
        for its family, and a fallback one does not, so the two should not be
        presented as though they mean the same thing.
        """
        return bool(self.template)


def _client() -> httpx.Client:
    return httpx.Client(timeout=30.0, headers={"User-Agent": f"decidion-foldq ({CONTACT})"})


def submit(sequence: str, *, title: str = "foldq") -> str:
    """Start a job and return its identifier."""
    with _client() as client:
        response = client.post(
            f"{BASE}/run",
            data={"email": CONTACT, "sequence": f">{title}\n{sequence}"},
        )
        response.raise_for_status()
        return response.text.strip()


def status(job_id: str) -> str:
    with _client() as client:
        response = client.get(f"{BASE}/status/{job_id}")
        response.raise_for_status()
        return response.text.strip()


def _result(job_id: str, kind: str) -> str:
    with _client() as client:
        response = client.get(f"{BASE}/result/{job_id}/{kind}")
        response.raise_for_status()
        return response.text


def fetch(job_id: str) -> R2dtDiagram:
    """Collect a finished job's SVG and the template it matched."""
    svg = _result(job_id, "svg")

    template: str | None = None
    source: str | None = None
    try:
        # The TSV names the template R2DT selected, e.g. "E_Phe" from GtRNAdb.
        row = _result(job_id, "tsv").strip().split("\n")[0].split("\t")
        if len(row) >= 3:
            template, source = row[1] or None, row[2] or None
    except httpx.HTTPError:
        # A missing TSV means no template matched; the SVG is still valid.
        pass

    return R2dtDiagram(job_id=job_id, svg=svg, template=template, source=source)


_CACHE: dict[str, R2dtDiagram] = {}


def diagram(sequence: str, *, timeout_seconds: float = 180.0, poll: float = 3.0) -> R2dtDiagram:
    """Submit, wait, and return the diagram, caching by sequence.

    Blocking on purpose. A job takes tens of seconds, which is too long for a
    request, so the HTTP layer above runs this in the background and the frontend
    polls — this function stays a plain synchronous call so it can also be used
    from a script or a notebook.
    """
    key = sequence.strip().upper()
    if key in _CACHE:
        return _CACHE[key]

    job_id = submit(key)
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        state = status(job_id)
        if state == "FINISHED":
            result = fetch(job_id)
            _CACHE[key] = result
            return result
        if state in {"ERROR", "FAILURE", "NOT_FOUND"}:
            raise R2dtError(f"R2DT job {job_id} ended in state {state}")
        time.sleep(poll)

    raise R2dtError(f"R2DT job {job_id} did not finish within {timeout_seconds:.0f}s")
