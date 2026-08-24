SITES_FILE ?= data/sites_initial.json

.DEFAULT_GOAL := help

.PHONY: help setup backend frontend import import-upsert import-sync test verify backend-check frontend-check check-apis live-check

help:
	@echo "Local workflow"
	@echo "  make setup          Install dependencies, copy missing env files, and migrate"
	@echo "  make backend        Start the Django API at http://127.0.0.1:8000"
	@echo "  make frontend       Start the Next.js app at http://127.0.0.1:3000"
	@echo "  make import-upsert  Add/reactivate sites from SITES_FILE (default: $(SITES_FILE))"
	@echo "  make import-sync    Make SITES_FILE the complete active site set"
	@echo "  make verify         Run all offline tests and static checks"
	@echo "  make live-check     Explicitly check configured provider connectivity"

setup:
	test -f .env || cp .env.example .env
	test -f frontend/.env.local || cp frontend/.env.local.example frontend/.env.local
	cd backend && uv sync --locked
	cd frontend && bun install --frozen-lockfile
	cd backend && uv run python manage.py migrate

backend:
	cd backend && uv run python manage.py runserver 127.0.0.1:8000

frontend:
	cd frontend && bun run dev

import: import-upsert

import-upsert:
	cd backend && uv run python manage.py import_sites "$(abspath $(SITES_FILE))" --mode upsert

import-sync:
	cd backend && uv run python manage.py import_sites "$(abspath $(SITES_FILE))" --mode sync

test: verify

verify: backend-check frontend-check

backend-check:
	cd backend && uv run pytest
	cd backend && uv run mypy .
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .
	cd backend && uv run python manage.py check
	cd backend && uv run python manage.py makemigrations --check --dry-run

frontend-check:
	cd frontend && bun run test
	cd frontend && bun run typecheck
	cd frontend && bun run lint

live-check:
	cd backend && uv run python manage.py check_external_apis

check-apis: live-check
