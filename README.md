# Dispatch Energy Solar

A local Django + React application for mapping U.S. solar sites and reviewing
their Solar Resource and PVWatts results. The backend owns the Site domain, an
active-site API, and an idempotent import workflow that geocodes each site,
retrieves Solar Resource V1 data, and runs a standardized PVWatts V8 estimate.
The frontend renders the catalogue on a map, opens a detail view per site, and
lets operators upload and deactivate sites from the browser.

## Screenshots

**Landing** — the active-site catalogue beside the map. Sites resolve into "On
the map" and "Not on the map", and select mode deactivates a chosen subset.

![Landing page](images/Landing_Page.png)

**Site detail** — the complete stored state for one site, with focused retries
for geocoding, Solar Resource, and PVWatts.

![Site detail, overview](images/Site_Detail_1.png)

![Site detail, results](images/Site_Detail_2.png)

## Quickstart

Requirements:
- Python 3.12–3.14 and [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- [Bun](https://bun.sh/) for the frontend

### 1. Backend (API on `:8000`)

```sh
cp -n .env.example .env
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py import_sites ../data/sites_initial.json --mode upsert
uv run python manage.py runserver 127.0.0.1:8000
```

### 2. Frontend (app on `:3000`)

In a second terminal:

```sh
cd frontend
cp -n .env.local.example .env.local
bun install
bun run dev
```

Open <http://127.0.0.1:3000>. The only allowed browser origins are
`http://localhost:3000` and `http://127.0.0.1:3000`; cross-origin credentials
and allow-all CORS are disabled.

## Managing the site list

A site's identity is the normalized `(name, address)` pair. Two rows are the
same site only when **both** match; sharing just a name or just an address
creates a separate record and reports a warning so a human can spot a typo.
Deactivation is a reversible soft delete — the record and all its stored
provider results are kept, just hidden from the list and map.

### From the browser

- **Upload sites** (app bar) — paste-free upload of a JSON array of
  `{ "name", "address" }` objects. New pairs are created, geocoded, and scored;
  inactive exact matches are reactivated without resetting their stored state.
  Nothing is ever removed. Warnings appear only for rows that create a new
  record which partially matches an existing active site.
- **Deactivate** — use **Select** in the catalogue rail, choose sites, and
  deactivate them from the pinned action bar.

### From the terminal

```sh
cd backend
uv run python manage.py import_sites PATH_TO_SITES.json --mode upsert   # additive
uv run python manage.py import_sites PATH_TO_SITES.json --mode sync      # authoritative
```

`upsert` is additive and matches the browser upload. `sync` treats the file as
the complete authoritative active set: it validates and normalizes the entire
document first (any invalid row aborts with no changes), then atomically creates
new pairs, reactivates inactive exact matches, preserves active exact matches,
and **deactivates records omitted from the file**. Records are never deleted;
replacing a normalized pair creates a new record and deactivates the old one.

> **Sync is terminal-only by design.** The browser upload and the
> `POST /api/sites/import/` endpoint accept only `upsert`, so no web action can
> deactivate sites an operator did not explicitly select. The destructive
> whole-list replace stays behind the command line.

### From Django Admin

Sign in at `/admin/`, select Site records, and use **Deactivate selected
sites** or **Reactivate selected sites**. These change lifecycle only and never
call providers. Hard delete is available in Admin for full operator control.

## API

Served under `http://127.0.0.1:8000/api/`:

| Method & path | Purpose |
| --- | --- |
| `GET /sites/` | Active-site catalogue: identity, coordinates, geocoding status. |
| `GET /sites/<id>/` | Complete stored state for one active site. |
| `PATCH /sites/<id>/` | Edit name, address, or both; a meaningful address change re-runs the full workflow. |
| `POST /sites/<id>/geocode/` | Clear location and dependent results, then re-run the workflow. |
| `POST /sites/<id>/solar-resource/` | Clear and retry only Solar Resource (needs resolved coordinates). |
| `POST /sites/<id>/pvwatts/` | Clear and retry only PVWatts (needs resolved coordinates). |
| `POST /sites/import/` | Upload a site list (`upsert` only) and process new sites. |
| `POST /sites/deactivate/` | Soft-deactivate the selected active sites; never calls providers. |

Inactive records are excluded from the list and every ID-based operation
returns `404` for them.

## How import processing works

After an upsert commits, new records are geocoded sequentially through
Nominatim. Each resolved site then independently retrieves Solar Resource V1
data and runs a standardized PVWatts V8 estimate through NLR. A handled Solar
Resource failure does not block PVWatts; unresolved and geocoding-failed sites
leave both downstream stages `blocked`. Each stage commits its pending state
before I/O and stores either canonical results or a safe, stage-specific
failure.

Existing and reactivated sites keep their display strings and all provider
state with no new provider calls, so an unexpected provider failure leaves the
reconciled active set committed and only the affected new site pending a retry.
Byte-identical addresses share one handled geocoding result within a single
run; Solar Resource and PVWatts outcomes are never reused between records; and
repeating an unchanged import makes no provider request.

## Nominatim public-service policy

The public Nominatim service is donated infrastructure, appropriate here only
for this small local assessment. Its policy sets an absolute maximum of one
request per second, requires an identifying User-Agent and attribution, and
forbids autocomplete and systematic querying. This project keeps public-service
use deliberately small and replaceable:

| Policy concern | Project control |
| --- | --- |
| One request per second maximum | One process-local lock covers the rate gate and HTTP request; starts are at least 1.1 seconds apart. |
| Identify the application | Every request uses `dispatch-solar-assessment/1.0`; `CONTACT_EMAIL` is included when configured. |
| Small, single-threaded use | New sites are processed sequentially in one local process. |
| Cache and avoid repeat searches | One import reuses byte-identical handled results, and unchanged later imports make no request. |
| No periodic search monitoring | Live checks use Nominatim's dedicated `/status?format=json` endpoint and never submit a search. |
| No autocomplete or systematic queries | Geocoding occurs only for explicit imports; reads and typing never call Nominatim. |
| Switch providers without a release | `NOMINATIM_BASE_URL` can point the shared gateway at another provider or a self-hosted instance. |

Do not schedule the public Nominatim check or enable it on routine push or pull
request CI. Production or higher-volume use must switch to a commercial provider
or a self-hosted Nominatim instance.

## Verification

### Backend

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

### Frontend

```sh
cd frontend
bun run test
bun run typecheck
bun run lint
```

### Opt-in live provider integration tests

The live tests are non-mutating and excluded from ordinary runs. One makes
exactly one Nominatim status request (not a geocoding search); the other makes
exactly one Solar Resource V1 request for the fixed coordinate `40, -105` and
validates it with the production parser.

Configure a real contact email and NLR key in the untracked `.env`, then opt in
explicitly from `backend/`:

```sh
uv run pytest sites/tests/live -m live --run-live
```

Without `--run-live`, both tests are skipped and sockets remain disabled. The
GitHub Actions live-provider job is likewise disabled for push and pull request
events; after repository secrets `CONTACT_EMAIL` and `NLR_API_KEY` are
configured, it can be run manually through the **Backend CI** workflow.

## Configuration

`.env.example` documents the provider configuration. Copy it to the untracked
`.env`; `python-dotenv` loads that repository-root file without overriding
variables already present in the environment.

- `CONTACT_EMAIL` — included in the Nominatim User-Agent when present; otherwise
  the importer logs a warning and still sends a descriptive User-Agent.
- `NOMINATIM_BASE_URL` — defaults to the public service; change it without
  modifying source to use another provider or a self-hosted instance.
- `NLR_API_KEY` — required for both Solar Resource and PVWatts. When absent,
  resolved sites retain a safe configuration failure for each stage without an
  NLR request. NLR developer APIs allow 1,000 requests per hour per key by
  default.

The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `frontend/.env.local`
(default `http://127.0.0.1:8000/api`).
