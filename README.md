# Dispatch Solar Mapping

A local Django and React application for mapping U.S. solar sites and showing
their Solar Resource and PVWatts results. The current backend includes the Site
domain, its read-only API, and an idempotent site-import workflow with
geocoding and Solar Resource retrieval; PVWatts and the frontend are added in
later slices.

## Backend quickstart

Requirements: Python 3.12-3.14 and
[`uv`](https://docs.astral.sh/uv/getting-started/installation/).

```sh
cp -n .env.example .env
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py import_sites ../data/sites_initial.json --mode upsert
uv run python manage.py runserver 127.0.0.1:8000
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

## Importing sites

The replaceable [`data/sites_initial.json`](data/sites_initial.json) file
contains five named sample sites across the U.S. Import any file with the same
contract from `backend/`:

```sh
uv run python manage.py import_sites PATH_TO_SITES.json --mode upsert
```

The document must be a JSON array. Every row requires string `name` and
`address` values that are non-blank and remain non-empty after normalization.
`--mode upsert` is explicit and additive: it creates new normalized
name/address pairs, leaves active matches untouched, reactivates inactive exact
matches without resetting their stored provider state, and never deactivates a
site omitted from the file. Later duplicate pairs are skipped. Invalid rows and
same-name/different-address or same-address/different-name ambiguities are
reported without preventing other valid rows from being accepted.

After the complete upsert is committed, new records are geocoded sequentially
through Nominatim. Each resolved site then retrieves Solar Resource V1 data
from NLR using its coordinates; unresolved and geocoding-failed sites leave
downstream work `blocked`. Each provider stage commits its pending state before
I/O and stores either canonical results or a safe, stage-specific failure.
Byte-identical addresses share one handled geocoding result during a single
command run, while Solar Resource outcomes are never reused between resolved
records. Formatting variants remain separate geocoding requests, the cache is
discarded when the command exits, and repeating an unchanged import makes no
provider request.

The public Nominatim service is appropriate here only for this small local
assessment. The importer sends a custom User-Agent, serializes requests, spaces
request starts by at least 1.1 seconds, and follows the official
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
Replace the rows in `data/sites_initial.json` when the authoritative site list
arrives, then run the same command again.

## Backend verification

```sh
cd backend
uv run pytest
uv run mypy .
uv run ruff check .
uv run ruff format --check .
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
```

Automated tests cannot reach the network by construction: `pytest-socket` is
enabled with `--disable-socket` in the checked-in pytest configuration.

## Configuration

`.env.example` documents the provider configuration. Copy it to the untracked
`.env`; `python-dotenv` loads that repository-root file without overriding
variables already present in the environment. `CONTACT_EMAIL` is included in
the Nominatim User-Agent when present; otherwise the importer logs a warning
and still sends a descriptive application User-Agent. `NLR_API_KEY` is required
for Solar Resource retrieval; when it is absent, resolved sites retain a safe
stage-specific configuration failure without making an NLR request. The NLR
developer APIs allow 1,000 requests per hour per key by default.
