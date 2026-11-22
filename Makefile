PYTHON ?= python

.PHONY: run test eval clean

run:
	$(PYTHON) run.py

test:
	$(PYTHON) -m pip install -r requirements.txt -r requirements-dev.txt
	$(PYTHON) -m pytest -v tests/

eval:
	$(PYTHON) -m app.retrieval.eval_retrieval

demo:
	$(PYTHON) -m app.retrieval.demo_retrieval

clean:
	$(PYTHON) -c "import shutil,pathlib; [shutil.rmtree(p, ignore_errors=True) for p in pathlib.Path('.').rglob('__pycache__')]; shutil.rmtree('.pytest_cache', ignore_errors=True)"
