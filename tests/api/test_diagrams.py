"""Tests for the R2DT diagram endpoints.

Every test runs offline against a mock transport. The shape of the mock is not
invented: it reproduces what the live EBI service returned for this project's
tRNA-Phe benchmark, including the `E_Phe` GtRNAdb template match.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from foldq.api import r2dt
from foldq.api.app import create_app

TRNA_PHE = "GCGGAUUUAGCUCAGUUGGGAGAGCGCCAGACUGAAGAUCUGGAGGUCCUGUGUUCGAUCCACAGAAUUCGCACCA"

JOB_ID = "r2dt-R20260803-183836-0100-97291858-p1m"

# Trimmed to the parts the code reads; the real response is ~20 kB.
SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>G</text><text>C</text></svg>'

# Real column layout: sequence name, template, template source.
TSV = "test\tE_Phe\tGtRNAdb\n"


@pytest.fixture(autouse=True)
def clear_cache():
    """The module caches by sequence; a leaked entry would mask a broken call."""
    r2dt._CACHE.clear()
    yield
    r2dt._CACHE.clear()


def mock_transport(*, state: str = "FINISHED", tsv: str | None = TSV) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/run"):
            return httpx.Response(200, text=JOB_ID)
        if "/status/" in path:
            return httpx.Response(200, text=state)
        if path.endswith("/svg"):
            return httpx.Response(200, text=SVG)
        if path.endswith("/tsv"):
            if tsv is None:
                return httpx.Response(404, text="not found")
            return httpx.Response(200, text=tsv)
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def patched(monkeypatch):
    """Swap the module's client factory for one on a mock transport."""

    def install(**kwargs):
        transport = mock_transport(**kwargs)
        monkeypatch.setattr(r2dt, "_client", lambda: httpx.Client(transport=transport))
        return TestClient(create_app(), raise_server_exceptions=False)

    return install


def test_submit_returns_a_job_id(patched):
    client = patched()
    response = client.post("/api/v1/diagrams/r2dt", json={"sequence": TRNA_PHE})
    assert response.status_code == 200
    assert response.json()["job_id"] == JOB_ID


def test_finished_job_returns_svg_and_template(patched):
    client = patched()
    response = client.get(f"/api/v1/diagrams/r2dt/{JOB_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "FINISHED"
    assert body["svg"].startswith("<svg")
    # The template is the point: it is what makes the drawing conventional.
    assert body["template"] == "E_Phe"
    assert body["template_source"] == "GtRNAdb"
    assert body["templated"] is True


def test_running_job_reports_state_without_a_diagram(patched):
    client = patched(state="RUNNING")
    body = client.get(f"/api/v1/diagrams/r2dt/{JOB_ID}").json()
    assert body["state"] == "RUNNING"
    assert body["svg"] is None


def test_untemplated_result_is_flagged_not_dropped(patched):
    """No template match still yields a usable diagram, marked as such.

    Reporting `templated: false` rather than hiding the difference: a fallback
    layout carries no family convention, and presenting it as though it did
    would overstate what R2DT returned.
    """
    client = patched(tsv=None)
    body = client.get(f"/api/v1/diagrams/r2dt/{JOB_ID}").json()
    assert body["svg"].startswith("<svg")
    assert body["template"] is None
    assert body["templated"] is False


def test_failed_job_is_404_not_500(patched):
    client = patched(state="FAILURE")
    response = client.get(f"/api/v1/diagrams/r2dt/{JOB_ID}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STRUCTURE_NOT_FOUND"


def test_invalid_sequence_is_rejected_before_reaching_ebi(patched):
    """Validation happens here, so a bad request never becomes someone else's job."""
    client = patched()
    response = client.post("/api/v1/diagrams/r2dt", json={"sequence": "GCXZ!!"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_SEQUENCE"


def test_overlong_sequence_is_rejected(patched):
    client = patched()
    response = client.post("/api/v1/diagrams/r2dt", json={"sequence": "GCAU" * 300})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SEQUENCE_TOO_LONG_FOR_SOLVER"


def test_ebi_outage_is_503_not_500(monkeypatch):
    """A dependency being down must not look like this app crashing."""

    def broken() -> httpx.Client:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        return httpx.Client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(r2dt, "_client", broken)
    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.post("/api/v1/diagrams/r2dt", json={"sequence": TRNA_PHE})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STRUCTURE_SOURCE_UNAVAILABLE"
