.PHONY: install run migrate test

install:
	pip install -r requirements.txt

run:
	cd app && uvicorn main:app --reload --port 8000

migrate:
	alembic upgrade head

test:
	pytest tests/ -v
