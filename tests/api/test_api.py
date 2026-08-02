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
    response = client.post("/api/v1/fold", json={"sequence": "GGGAAAUCCCU", "solver": "nope"})
    assert response.status_code == 422


def test_fold_reports_stage_timings(client):
    body = client.post("/api/v1/fold", json={"sequence": "GGGAAAUCCCU", "solver": "exact"}).json()
    names = [stage["name"] for stage in body["stages"]]
    assert "reference" in names and "solve" in names
    assert all(stage["seconds"] >= 0 for stage in body["stages"])


def test_fold_refuses_a_circuit_simulation_that_would_never_finish(client):
    response = client.post("/api/v1/fold", json={"sequence": "GC" * 40, "solver": "qaoa"})
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


def test_health_is_cheap_and_dependency_free(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["uptime_seconds"] >= 0


def test_capabilities_reports_this_deployment_not_the_codebase(client):
    body = client.get("/api/v1/capabilities").json()
    names = {s["name"] for s in body["solvers"]}
    assert names == set(_registry_names())
    # The quantum flag and the solver list must agree: a deployment without the
    # extra must not advertise gate-based solvers it cannot run.
    gate_based = {s["name"] for s in body["solvers"] if s["kind"] == "gate-based"}
    assert bool(gate_based) == body["quantum_extra_installed"]


def test_capabilities_surfaces_the_length_caps(client):
    body = client.get("/api/v1/capabilities").json()
    caps = {s["name"]: s["max_sequence_length"] for s in body["solvers"]}
    assert caps["exact"] == 60
    assert caps["simulated_annealing"] is None


def test_preflight_estimates_size_without_folding(client):
    body = client.post(
        "/api/v1/preflight", json={"sequence": "GGGAAAUCCCU", "solver": "exact"}
    ).json()
    assert body["sequence_length"] == 11
    assert body["estimated_variables"] > 0
    assert body["exact_gates_available"] is True
    assert body["within_limits"] is True
    assert body["warnings"] == []


def test_preflight_warns_before_the_gates_go_indeterminate(client):
    # Long enough to exceed the exact solver's variable ceiling.
    body = client.post(
        "/api/v1/preflight",
        json={
            "sequence": "GCGCGCAAAAGCGCGCUUUUGCGCGCAAAAGCGCGCUUUUGCGCGCAAAAGCGCGC",
            "solver": "simulated_annealing",
        },
    ).json()
    assert body["exact_gates_available"] is False
    assert any("indeterminate" in w for w in body["warnings"])


def test_preflight_reports_rather_than_errors_on_a_bad_request(client):
    # Asking what something costs is not itself an error, so this answers 200
    # with the reason instead of a 4xx a client would have to special-case.
    response = client.post("/api/v1/preflight", json={"sequence": "GGXAU"})
    assert response.status_code == 200
    assert response.json()["within_limits"] is False
    assert any("invalid nucleotide" in w.lower() for w in response.json()["warnings"])


def test_preflight_warns_when_a_solver_exceeds_its_cap(client):
    body = client.post("/api/v1/preflight", json={"sequence": "GC" * 40, "solver": "exact"}).json()
    assert body["within_limits"] is False
    assert any("capped at 60" in w for w in body["warnings"])


def _registry_names():
    from foldq.pipeline import SOLVER_REGISTRY

    return sorted(SOLVER_REGISTRY)
