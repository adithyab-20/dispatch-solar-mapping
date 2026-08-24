# Dispatch Solar Mapping

A local Django and React application for mapping U.S. solar sites and showing
their Solar Resource and PVWatts results. The current backend includes the Site
domain, its read-only API, and an idempotent site-import workflow with
geocoding, Solar Resource retrieval, and PVWatts V8 estimates; the frontend is
added in a later slice.

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

Use sync mode when the file is the complete authoritative active-site set:

```sh
uv run python manage.py import_sites PATH_TO_SITES.json --mode sync
```

Sync validates and normalizes the entire document before changing the
database. Any invalid row aborts with no lifecycle changes. A valid document
atomically creates new pairs, reactivates inactive exact matches, preserves
active exact matches, and deactivates records omitted from the file. Records
are never deleted, and replacing a normalized pair creates a new record while
deactivating the old one. Duplicate pairs after the first are skipped.

The lifecycle reconciliation commits before newly created sites are processed
sequentially. Existing and reactivated sites retain their display strings and
all provider state without new provider calls. An unexpected provider failure
therefore leaves the reconciled active set committed and the affected new site
available for a later retry.

For occasional manual lifecycle changes, sign in at `/admin/`, select Site
records, and use **Deactivate selected sites** or **Reactivate selected sites**.
These Admin actions change lifecycle only and never call providers.

After the complete upsert is committed, new records are geocoded sequentially
through Nominatim. Each resolved site then independently retrieves Solar
Resource V1 data and runs a standardized PVWatts V8 estimate through NLR using
its coordinates. A handled Solar Resource failure does not prevent PVWatts
from running; unresolved and geocoding-failed sites leave both downstream
stages `blocked`. Each provider stage commits its pending state before I/O and
stores either canonical results or a safe, stage-specific failure.
Byte-identical addresses share one handled geocoding result during a single
command run, while Solar Resource and PVWatts outcomes are never reused between
resolved records. Formatting variants remain separate geocoding requests, the
cache is discarded when the command exits, and repeating an unchanged import
makes no provider request.

The public Nominatim service is appropriate here only for this small local
assessment. The importer sends a custom User-Agent, serializes requests, spaces
request starts by at least 1.1 seconds, and follows the official
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
Replace the rows in `data/sites_initial.json` when the authoritative site list
arrives, then run the same command again.

### Nominatim public-service policy

The public service is donated infrastructure, not a production geocoding
backend. Its policy sets an absolute maximum of one request per second, requires
an identifying User-Agent and attribution, discourages periodic or repeated
searches, and forbids autocomplete and systematic querying. This project keeps
public-service use deliberately small and replaceable:

| Policy concern | Project control |
| --- | --- |
| One request per second maximum | One process-local lock covers the rate gate and HTTP request; starts are at least 1.1 seconds apart. |
| Identify the application | Every request uses `dispatch-solar-assessment/1.0`; `CONTACT_EMAIL` is included when configured. |
| Small, single-threaded use | New sites are processed sequentially in one local process. |
| Cache and avoid repeat searches | One import reuses byte-identical handled results, and unchanged later imports make no request. |
| No periodic search monitoring | Live checks use Nominatim's dedicated `/status?format=json` endpoint and never submit a search. |
| No autocomplete or systematic queries | Geocoding occurs only for explicit imports; reads and typing never call Nominatim. |
| Switch providers without a software release | `NOMINATIM_BASE_URL` can point the shared gateway at another provider or self-hosted instance. |

Do not schedule the public Nominatim check or enable it on routine push or pull
request CI. Production or higher-volume use must switch to a commercial
provider or a self-hosted Nominatim instance.

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

### Opt-in live provider integration tests

The live tests are non-mutating and excluded from ordinary pytest runs. One
test makes exactly one Nominatim status request (not a geocoding search). The
other makes exactly one Solar Resource V1 request for the documented fixed
coordinate `40, -105` and validates the response with the production parser.

Configure a real contact email and NLR key in the untracked `.env`, then opt in
explicitly from `backend/`:

```sh
uv run pytest sites/tests/live -m live --run-live
```

Without `--run-live`, both tests are skipped and sockets remain disabled. The
GitHub Actions live-provider job is likewise disabled for push and pull request
events. After repository secrets named `CONTACT_EMAIL` and `NLR_API_KEY` are
configured, it can be run manually through the **Backend CI** workflow by
selecting **Run the opt-in live Nominatim and NLR integration tests**. The
checkbox defaults to off.

## Configuration

`.env.example` documents the provider configuration. Copy it to the untracked
`.env`; `python-dotenv` loads that repository-root file without overriding
variables already present in the environment. `CONTACT_EMAIL` is included in
the Nominatim User-Agent when present; otherwise the importer logs a warning
and still sends a descriptive application User-Agent. `NOMINATIM_BASE_URL`
defaults to the public service and can be changed without modifying source.
`NLR_API_KEY` is required for both Solar Resource and PVWatts; when it is absent,
resolved sites retain a safe configuration failure for each stage without
making an NLR request. The NLR developer APIs allow 1,000 requests per hour per
key by default.
