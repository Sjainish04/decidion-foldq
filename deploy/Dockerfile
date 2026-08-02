# Container for the FoldQ API, sized for a Hugging Face Space (Docker SDK).
#
# Python is pinned to 3.11 because the project requires >=3.11,<3.12 — the
# scientific stack has no wheels for newer interpreters and building from source
# on a free tier will time out.
FROM python:3.11-slim

# ViennaRNA ships manylinux wheels, so no compiler is needed at install time;
# curl is kept only so the container has a working healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Spaces run as UID 1000 and the home directory must be writable, or matplotlib
# and pip caches fail at import time with a permission error.
RUN useradd -m -u 1000 app
USER app
ENV HOME=/home/app \
    PATH=/home/app/.local/bin:$PATH \
    MPLCONFIGDIR=/home/app/.cache/matplotlib \
    PYTHONUNBUFFERED=1

WORKDIR /home/app/foldq

# Dependency metadata first so the layer caches across code changes.
COPY --chown=app pyproject.toml README.md ./
COPY --chown=app src ./src
RUN pip install --no-cache-dir --user ".[quantum,api]"

# Experiment output and fixtures. The API does not read the CSVs, but shipping
# them keeps the container able to run the CLI and the experiment runners.
COPY --chown=app data ./data
COPY --chown=app results ./results

# Spaces route external traffic to 7860.
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
  CMD curl -fsS http://localhost:7860/api/v1/meta || exit 1

CMD ["uvicorn", "foldq.api.app:app", "--host", "0.0.0.0", "--port", "7860"]
