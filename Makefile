PY := .venv/bin/python
PYTEST := .venv/bin/pytest

.PHONY: test lint typecheck reproduce clean api frontend frontend-test

test:
	$(PYTEST) tests -q

lint:
	.venv/bin/ruff check src tests
	.venv/bin/ruff format --check src tests

typecheck:
	.venv/bin/mypy src/foldq

reproduce:
	$(PY) -m foldq.experiments.run_all --output results/

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage

api:  ## Run the FoldQ HTTP API on port 8010 (8000 is often occupied)
	.venv/bin/uvicorn foldq.api.app:app --port 8010 --reload

frontend:  ## Run the frontend dev server on port 3000
	cd frontend && pnpm dev

frontend-test:  ## Run frontend unit, component and end-to-end tests
	cd frontend && pnpm test && pnpm lint && pnpm test:e2e
