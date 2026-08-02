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


def test_allowed_origins_defaults_to_local_development(monkeypatch):
    from foldq.api.app import allowed_origins

    monkeypatch.delenv("FOLDQ_ALLOWED_ORIGINS", raising=False)
    assert allowed_origins() == ["http://localhost:3000"]


def test_allowed_origins_reads_a_comma_separated_list(monkeypatch):
    from foldq.api.app import allowed_origins

    monkeypatch.setenv(
        "FOLDQ_ALLOWED_ORIGINS",
        "https://foldq.vercel.app, https://preview.vercel.app ",
    )
    assert allowed_origins() == [
        "https://foldq.vercel.app",
        "https://preview.vercel.app",
    ]


def test_allowed_origins_never_silently_becomes_a_wildcard(monkeypatch):
    # A blank value must fall back to the explicit default, not to "*".
    from foldq.api.app import allowed_origins

    monkeypatch.setenv("FOLDQ_ALLOWED_ORIGINS", "   ")
    assert allowed_origins() == ["http://localhost:3000"]
    assert "*" not in allowed_origins()


def test_qaoa_is_not_advertised_without_the_quantum_extra(monkeypatch):
    """The registry must not offer a solver the deployment cannot run.

    Guards a real deployment case: a size-constrained host installs the API
    without the quantum extra, and every qiskit import in the solver modules is
    deferred into a function body, so importing them succeeds regardless.
    """
    import importlib
    import importlib.util

    real_find_spec = importlib.util.find_spec

    def without_qiskit(name, package=None):
        if name in {"qiskit", "qiskit_aer"}:
            return None
        return real_find_spec(name, package)

    monkeypatch.setattr(importlib.util, "find_spec", without_qiskit)
    pipeline = importlib.reload(importlib.import_module("foldq.pipeline"))
    try:
        assert "qaoa" not in pipeline.SOLVER_REGISTRY
        assert "cvar_qaoa" not in pipeline.SOLVER_REGISTRY
        # the classical solvers must all survive
        assert "simulated_annealing" in pipeline.SOLVER_REGISTRY
        assert "exact" in pipeline.SOLVER_REGISTRY
    finally:
        monkeypatch.undo()
        importlib.reload(pipeline)


def test_qaoa_is_advertised_when_qiskit_is_present():
    from foldq.pipeline import SOLVER_REGISTRY

    assert "qaoa" in SOLVER_REGISTRY
    assert "cvar_qaoa" in SOLVER_REGISTRY
