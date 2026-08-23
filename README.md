# Dispatch Solar Mapping

A local Django and React application for mapping U.S. solar sites and showing
their Solar Resource and PVWatts results. Ticket 2 establishes the backend Site
domain and its read-only API; provider workflows and the frontend are added in
later slices.

## Backend quickstart

Requirements: Python 3.12-3.14 and
[`uv`](https://docs.astral.sh/uv/getting-started/installation/).

```sh
uv sync
cp -n .env.example .env
uv run python backend/manage.py migrate
uv run python backend/manage.py runserver 127.0.0.1:8000
```

The backend then exposes:

- `GET http://127.0.0.1:8000/api/sites/` - active-site identity, coordinates,
  and geocoding status.
- `GET http://127.0.0.1:8000/api/sites/<id>/` - the complete stored state for
  one active site.

Both endpoints are read-only. Inactive records are excluded from the list and
return `404` by ID. The only allowed browser origins are
`http://localhost:3000` and `http://127.0.0.1:3000`; cross-origin credentials
and allow-all CORS are disabled.

Until the import workflow lands, a record can be created through the Django
shell:

```sh
uv run python backend/manage.py shell -c \
  'from sites.models import Site; Site.objects.create(name="Example Solar", address="200 W Washington St, Chicago, IL")'
```

## Backend verification

```sh
uv run pytest
uv run mypy backend
uv run ruff check backend
uv run ruff format --check backend
uv run python backend/manage.py check
uv run python backend/manage.py makemigrations --check --dry-run
```

Automated tests cannot reach the network by construction: `pytest-socket` is
enabled with `--disable-socket` in the checked-in pytest configuration.

## Configuration

`.env.example` documents the eventual provider configuration. Copy it to the
untracked `.env`; `python-dotenv` loads that repository-root file without
overriding variables already present in the environment. A missing NLR key
does not prevent this read-only backend slice from starting.
