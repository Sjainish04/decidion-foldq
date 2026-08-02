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
    return MetaResponse(versions=versions, solvers=sorted(SOLVER_REGISTRY), commit=_commit())
