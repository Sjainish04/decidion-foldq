PY := .venv/bin/python
PYTEST := .venv/bin/pytest

.PHONY: test lint typecheck reproduce clean

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
