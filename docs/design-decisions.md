# Dispatch Solar Mapping: Accepted Design Decisions

Status: pre-implementation design record  
Assessment source: `Software Engineer Intern - Technical Assessment 2026.pdf`  
Last updated: 2026-08-23

## 1. Purpose and scope

Build a local application that ingests at least five named U.S. solar-site
addresses, geocodes them, displays resolved sites on a map, retrieves solar
resource data, and produces a standardized PVWatts V8 estimate for each
resolved location.

The implementation will use:

- Next.js, TypeScript, React, React Leaflet, and Bun for the frontend.
- Django, Django REST Framework, SQLite, and `uv` for the backend.
- The public Nominatim instance for geocoding.
- The NLR Solar Resource V1 and PVWatts V8 APIs.

The assessment is deliberately a local, single-process application for a
small, curated dataset. Production-scale geocoding, authentication,
background jobs, and cloud deployment are out of scope.

## 2. Core domain rules

### 2.1 Site identity

Neither a site name nor an address is unique by itself.

- Django's internal `Site.id` identifies a specific existing record.
- `(normalized_name, normalized_address)` is used only for exact-match
  deduplication, idempotency, and collision detection.
- A database `UniqueConstraint` applies to that normalized pair across all
  active and inactive rows.
- The same normalized name may appear at different normalized addresses.
- The same normalized address may appear under different normalized names.
- Those two cases create separate records and an ingestion warning. They are
  never automatically merged.
- Batch ingestion never infers that a changed name or address belongs to an
  existing site.
- An explicit PATCH identifies continuity through `Site.id`, so it may update
  the same record while preserving its ID.

If a sync replaces one normalized pair with another, the old record becomes
inactive and a new record is created. Preserving identity through such a
batch change would require a stable external identifier, which this input
contract does not provide.

### 2.2 Display strings

`name` and `address` always contain unnormalized, user-provided display text.

- A newly accepted import stores the input strings verbatim.
- An unchanged or reactivated import match keeps the previously stored
  display strings; formatting drift in the incoming row is discarded.
- PATCH always stores each provided display field verbatim, including a
  cosmetic edit whose normalized value is unchanged.
- Normalized strings are internal identity keys. They are never displayed or
  sent to Nominatim.

Display strings therefore represent the latest explicit input: the first
accepted import, followed by any later explicit PATCH.

### 2.3 Normalization

`normalize_text(value)` will live only in
`sites/services/normalization.py`. Ingestion, PATCH validation, and tests must
import this function rather than reimplementing it.

It performs these operations in order:

1. Apply `unicodedata.normalize("NFKC", value)`.
2. Replace every character whose Unicode category starts with `P` with one
   space. Do not delete punctuation.
3. Strip leading and trailing whitespace and collapse every internal
   whitespace run to one space.
4. Apply `casefold()`.

It does nothing else. In particular, it does not expand abbreviations, parse
addresses, reorder components, remove unit designators, or apply
address-specific intelligence.

Examples:

- `"  200 W. Washington St. "` equals `"200 W Washington St"`.
- `"St."` equals `"St"`.
- `"St"` does not equal `"Street"`.
- `"Unit A"` does not equal `"Unit B"`.
- `"12-14 Main"` normalizes to `"12 14 main"`, not `"1214 main"`.
- `"O'Neill"` normalizes to `"o neill"`.

Punctuation-only variants deliberately share one identity. This accepts a
small false-positive risk: two distinct sites whose name and address token
sequences differ only in punctuation could collide. The tradeoff is accepted
for a small curated list because punctuation drift across imports is more
likely. Any difference in remaining word tokens is a real identity change.

A field is structurally invalid if its normalized value is empty, even when
the original value contains non-whitespace punctuation.

## 3. Site model and invariants

The `Site` model will contain the following logical fields.

### 3.1 Identity and lifecycle

- `id`
- `name`
- `normalized_name`
- `address`
- `normalized_address`
- `is_active`

### 3.2 Geocoding

- `latitude`
- `longitude`
- `resolved_address`
- `geocode_status`
- `geocode_error`
- `geocode_attempted_at`

`geocode_status` has exactly these values:

- `pending`
- `resolved`
- `unresolved`
- `failed`

`unresolved` means Nominatim returned no result. Its user-facing explanation
is:

> No matching U.S. location was found for this address.

`failed` means a handled provider, network, configuration, or response error.
It is retryable. `is_active` remains independent of all geocoding outcomes.

The database enforces:

- Latitude and longitude are both null or both present.
- `resolved` requires both coordinates.
- Every non-`resolved` status requires null coordinates.
- Latitude, when present, is between -90 and 90.
- Longitude, when present, is between -180 and 180.

### 3.3 Solar Resource

- `solar_resource_status`
- `annual_ghi_kwh_m2_day`
- `annual_dni_kwh_m2_day`
- `annual_latitude_tilt_kwh_m2_day`
- `monthly_solar_data`
- `solar_resource_error`
- `solar_resource_attempted_at`

### 3.4 PVWatts

- `pvwatts_status`
- `pvwatts_assumptions`
- `annual_ac_kwh`
- `capacity_factor_percent`
- `annual_solar_radiation_kwh_m2_day`
- `monthly_pvwatts_data`
- `pvwatts_error`
- `pvwatts_attempted_at`

Both downstream status fields have exactly these values:

- `blocked`
- `pending`
- `succeeded`
- `failed`

There is no `running` state. `pending` represents a stage awaiting or
undergoing an attempt. If the process crashes after the pending state is
committed, a later retry can resume it.

### 3.5 General timestamps

- `created_at`
- `updated_at`

Each stage's `*_attempted_at` is nullable.

- It is set when a handled outcome is persisted: resolved, unresolved,
  succeeded, or failed.
- It is cleared during destructive invalidation before the next call.
- It remains null if an unexpected exception escapes while the stage is
  pending.
- The detail page labels these timestamps as `last attempted` or `as of`, as
  appropriate.

There is no cross-record result reuse, so timestamps are never copied between
database records.

## 4. Input and ingestion

### 4.1 Input contract

The command accepts a JSON array. Every row requires:

```json
{
  "name": "non-empty string",
  "address": "non-empty string"
}
```

Input rows never contain database IDs. Missing, null, non-string,
whitespace-only, or normalize-to-empty values are structurally invalid.

### 4.2 Upsert mode

`upsert` is additive.

- Add valid new normalized pairs.
- Leave active exact matches unchanged.
- Reactivate inactive exact matches.
- Reject structurally invalid rows and continue processing the batch.
- Skip later normalized-pair duplicates within the same batch after the first
  occurrence.
- Never deactivate records omitted from the batch.
- Never rewrite display strings on unchanged or reactivated matches.
- Never retry processing on unchanged or reactivated matches.

Reactivation is lifecycle-only: it changes `is_active` and `updated_at`, while
preserving all stage fields, statuses, errors, results, and attempt timestamps.

### 4.3 Sync mode

`sync` treats the file as the complete authoritative active site list.

The complete file is validated and normalized before active-state
reconciliation. If any row is structurally invalid, sync aborts before any
creation, reactivation, or deactivation.

For a valid sync:

- Existing exact matches remain active.
- Inactive exact matches are reactivated without external retries.
- New records are created.
- Existing records absent from the normalized incoming set become inactive.
- No record is hard deleted.

All creation, reactivation, and deactivation commits in one database
transaction before any external processing begins. Newly created sites are
then processed sequentially outside that transaction. An unexpected external
exception may leave the affected new site pending, but it does not roll back
the authoritative active list.

### 4.4 Duplicate warnings

The importer reports, but never resolves or merges:

- Same normalized address with a different normalized name.
- Same normalized name with a different normalized address.

Semantic post-geocode duplicate detection by OSM object or coordinate
proximity is intentionally excluded. It may be considered later.

### 4.5 In-import Nominatim reuse

There is no persistent cross-record cache and no Solar Resource or PVWatts
reuse.

One import command keeps an in-memory mapping from the byte-identical,
verbatim address string to the handled geocoding result. It is discarded when
the command exits.

- Byte-identical addresses in one batch cause one Nominatim call.
- Punctuation variants remain separate calls because their verbatim query
  strings differ.
- Resolved, unresolved, and handled-failure outcomes are all reused within
  that one command run.
- Every site receiving the reused result gets the same
  `geocode_attempted_at`, representing the one real request.
- If the result is resolved, Solar Resource and PVWatts still run separately
  for every new site.
- Unexpected exceptions are not cached and propagate.

Persisted per-site results, unchanged-row short-circuiting, zero-call repeat
imports, and this batch-local reuse form the caching strategy for the
take-home's small one-time bulk workflow.

## 5. Processing and transactions

### 5.1 Service boundaries

The backend will keep provider calls and workflow logic out of views and
management commands:

```text
sites/services/
├── normalization.py
├── geocoding.py
├── solar_resource.py
├── pvwatts.py
└── workflow.py
```

The public workflow functions remain conceptually:

```python
geocode_site(site)
fetch_solar_resource(site)
run_pvwatts(site)
process_site(site)
```

Shared helpers own location invalidation, geocode refresh, stage refresh, and
canonical response transforms. The management command calls Python services
directly; it never sends HTTP requests to its own Django API.

### 5.2 New-site workflow

1. Persist the new site with geocoding pending and downstream stages blocked.
2. Call Nominatim.
3. If resolved, persist the coordinates and resolved address.
4. Attempt Solar Resource.
5. Attempt PVWatts even when Solar Resource fails.
6. Persist every handled stage outcome independently.

Valid partial success includes:

```text
Geocoding: resolved
Solar Resource: failed
PVWatts: succeeded
```

An unresolved or failed geocoding result leaves both downstream stages
blocked.

### 5.3 Commit-before-call rule

No external workflow runs inside one long transaction.

- Database creation or mutation commits first.
- A destructive refresh clears the affected state, sets `pending` or
  `blocked`, clears attempt timestamps, and commits before the network call.
- External calls run synchronously outside the transaction.
- Every handled outcome is persisted independently.
- Unexpected exceptions propagate and leave the committed pending state for
  recovery.

### 5.4 Exception boundary

Each provider service catches only its documented external failure set:

- `requests.Timeout`
- `requests.ConnectionError`
- other `requests.RequestException` subclasses
- explicitly checked non-2xx responses
- `json.JSONDecodeError`
- deliberate validation failures for required provider response fields and
  types

Expected failures persist the stage as failed and return through the API as a
normal detail payload. No service or view uses `except Exception` or a bare
`except`.

Unexpected programming or process failures propagate. They may produce a 500
in local development, while the previously committed stage remains pending.

### 5.5 User-visible errors and server logs

Persisted error fields contain concise, categorized, safe UI text, such as:

- `Geocoding timed out after 10s`
- `Solar Resource service returned HTTP 503`
- `PVWatts returned an unexpected response`
- `NLR rate limit exceeded - retry in about an hour`
- `NLR_API_KEY not configured`

Persisted errors never contain provider bodies, request URLs, query
parameters, headers, API keys, or `str(exception)` from Requests.

Unexpected-response logs use the Python `logging` module and may include the
site ID, stage, HTTP status, endpoint path, and a provider-body snippet of
approximately 500 characters. They never include a full request URL, query
parameters, headers, or secrets.

## 6. Provider integrations

### 6.1 Nominatim search

All Nominatim traffic passes through one request gateway in
`sites/services/geocoding.py`. No other module constructs a Nominatim URL or
session.

Search parameters are:

```text
q=<verbatim stored address>
format=jsonv2
limit=1
countrycodes=us
```

`addressdetails` is not requested or stored. The app accepts Nominatim's
first-ranked U.S. result and persists only:

- `lat` as latitude
- `lon` as longitude
- `display_name` as resolved address

An empty list is unresolved. A result with a missing or empty display name,
non-numeric/non-finite coordinates, or out-of-range coordinates is a failed
unexpected response.

Geocoding is triggered only by:

- Importing a new site.
- PATCH with a normalized address change.
- Explicit `POST /api/sites/{id}/geocode/` refresh.

It never occurs on keystrokes, autocomplete, page loads, or GET requests.

### 6.2 Nominatim policy controls

The module uses one shared `requests.Session` with a custom User-Agent:

```text
dispatch-solar-assessment/1.0 (interview take-home; <CONTACT_EMAIL>)
```

`CONTACT_EMAIL` comes from Django settings. When absent, the email portion is
omitted, a warning is logged, and requests still use the descriptive custom
User-Agent.

A module-level `threading.Lock` serializes the complete rate gate and HTTP
request. While holding the lock, the request gateway:

1. Uses `time.monotonic()` to calculate time since the previous request
   began.
2. Sleeps the remainder needed to place request starts at least 1.1 seconds
   apart.
3. Records the new start timestamp immediately before the request.
4. Holds the lock through the HTTP call.
5. Releases the lock after the call finishes.

This limiter is process-local and is sufficient because the application runs
as one local Django process. A multi-process deployment would require an
external limiter and a production-appropriate geocoding arrangement.

All Nominatim calls use explicit timeouts of at most 10 seconds and run
sequentially.

Attribution appears separately for map tiles and geocoding:

- Leaflet map tiles: `© OpenStreetMap contributors`.
- Detail page or global footer: `Geocoding © OpenStreetMap contributors, via
  Nominatim.`

The README will link to the official Nominatim usage policy and include a
requirement-to-control compliance table. It will state that the public API is
suitable only at this take-home's scale and that production should use a
commercial provider or self-hosted Nominatim.

### 6.3 NLR configuration and errors

Both NLR services use one setting:

```text
NLR_API_BASE=https://developer.nlr.gov
```

The retired legacy developer hostname must not appear anywhere in source. The
endpoints are:

```text
{NLR_API_BASE}/api/solar/solar_resource/v1.json
{NLR_API_BASE}/api/pvwatts/v8.json
```

`NLR_API_KEY` is required for these stages. There is no `DEMO_KEY` fallback.
When missing, each stage fails without a network call and stores
`NLR_API_KEY not configured`. The application itself continues running.

HTTP 429 maps to `NLR rate limit exceeded - retry in about an hour`, distinct
from generic HTTP errors. The README documents the default limit of 1,000
requests per hour per key across developer.nlr.gov APIs.

### 6.4 Provider response validation

Successful HTTP status is not enough.

- A non-empty NLR top-level `errors` array fails the stage.
- A recognized PVWatts no-climate-data-within-radius error receives a
  distinct safe message.
- Other provider errors receive categorized safe messages, with provider
  details logged server-side.
- Provider `warnings` do not fail a valid result; they are logged and are not
  added to the database for this assessment.

Only consumed fields are validated, while unrelated extra fields are
allowed. Consumed numeric values must be finite numbers, excluding booleans.
Month collections must contain exactly 12 values.

Solar Resource requires annual and January-through-December values for:

- `avg_ghi`
- `avg_dni`
- `avg_lat_tilt`

PVWatts requires:

- 12 `ac_monthly` values
- 12 `solrad_monthly` values
- `ac_annual`
- `solrad_annual`
- `capacity_factor`

Missing, wrongly typed, non-finite, or wrong-length consumed fields produce
the safe unexpected-response failure.

### 6.5 Canonical monthly data

Services transform validated provider responses into stable application
shapes before persistence. A single `MONTHS` constant shared by service
transforms and tests defines `jan` through `dec`.

`monthly_solar_data`:

```json
[
  {
    "month": "jan",
    "ghi_kwh_m2_day": 2.5,
    "dni_kwh_m2_day": 5.0,
    "latitude_tilt_kwh_m2_day": 4.79
  }
]
```

`monthly_pvwatts_data`:

```json
[
  {
    "month": "jan",
    "ac_kwh": 8200.4,
    "solar_radiation_kwh_m2_day": 4.1
  }
]
```

Both arrays always contain exactly 12 ordered entries. Failed stages store
null rather than partial arrays. No provider-specific response shape escapes
the service layer.

### 6.6 PVWatts relationship and assumptions

Solar Resource and PVWatts are parallel consumers of resolved coordinates.
The Solar Resource response is contextual irradiance data; it is not passed
to PVWatts. PVWatts V8 selects its own NSRDB weather data. Consequently,
PVWatts still runs when Solar Resource fails.

The complete explicit PVWatts request is:

```text
system_capacity=100
module_type=0
array_type=0
azimuth=180
tilt=<site latitude rounded to 1 decimal place>
losses=14
dataset=nsrdb
timeframe=monthly
dc_ac_ratio=1.2
gcr=0.4
inv_eff=96
radius=100
lat=<site latitude>
lon=<site longitude>
api_key=<NLR_API_KEY>
```

The base constants live once in `PVWATTS_BASE_ASSUMPTIONS`. The service adds
tilt and coordinates per site.

`pvwatts_assumptions` persists every item above except the API key, plus:

```json
{
  "endpoint": "pvwatts",
  "version": "v8"
}
```

This JSON is the reproducibility record and feeds the detail page's
assumptions display.

## 7. Backend API

### 7.1 Visibility rule

The application API exposes active sites only. List, GET detail, PATCH, and
every retry endpoint share a base queryset equivalent to:

```python
Site.objects.filter(is_active=True)
```

Inactive IDs return 404 from:

- `GET /api/sites/{id}/`
- `PATCH /api/sites/{id}/`
- `POST /api/sites/{id}/geocode/`
- `POST /api/sites/{id}/solar-resource/`
- `POST /api/sites/{id}/pvwatts/`

PATCH never reads or writes `is_active`. Reactivation occurs only through
Django Admin or sync/upsert ingestion.

### 7.2 Read endpoints

`GET /api/sites/` returns active sites for the landing page. It includes the
ID, display name/address, coordinates, and geocoding status.

`GET /api/sites/{id}/` returns the complete stored site state, including
display data, resolved location, normalized-independent results, statuses,
errors, assumptions, and timestamps.

GET requests never trigger external calls.

### 7.3 PATCH accepted payload

PATCH accepts a JSON object containing `name`, `address`, or both. At least one
must be provided. Values must be non-empty strings whose normalized values
are also non-empty.

Every other key is rejected. Unknown keys are never silently ignored. PATCH
cannot accept lifecycle state, coordinates, provider values, statuses,
errors, or timestamps.

All payload-shape validation completes before no-op detection and conflict
checking. A malformed payload therefore returns 400 even if its proposed
normalized pair would conflict.

The deterministic 400 shape is:

```json
{
  "detail": "The PATCH payload is invalid.",
  "errors": {
    "unsupported_fields": ["is_active", "latitude"],
    "name": ["Must be a non-empty string."]
  }
}
```

- Unsupported fields are unique and sorted lexicographically.
- All discoverable payload-shape errors are returned together.
- `non_field_errors` reports the absence of both editable fields.
- A 400 causes no mutation, conflict query, or external call.

### 7.4 Exact PATCH no-op

After successful payload validation, compare only provided display values
byte-for-byte with their stored values. If every provided value is identical:

- Return 200 with the current detail payload.
- Do not query for a conflict.
- Do not call `save()`.
- Do not change `updated_at` or any stage timestamp.
- Do not call an external service.

A second identical submission is therefore a no-op with an identical
response.

### 7.5 PATCH collision handling

For a non-no-op, compute the post-edit normalized pair using incoming values
where provided and stored values otherwise. Before mutation, query all active
and inactive records while excluding the target ID.

If a match exists, return 409:

```json
{
  "detail": "Human-readable explanation.",
  "conflict_site_id": 42,
  "conflict_is_active": false
}
```

When the conflict is inactive, the detail message directs the operator to
reactivate it through Django Admin or the import lifecycle. A cosmetic
self-rename is not a conflict because the target ID is excluded.

On 409, do not mutate, invalidate, change a status, or call an external API.
Never merge or deactivate either record.

The pre-check is backed by the database unique constraint. The save runs in
an inner atomic block. If it raises `IntegrityError`, roll back that savepoint
and query for the post-edit pair again. Return the same 409 only if a real
conflicting record is found. Otherwise re-raise the original integrity error;
never invent a conflicting ID.

### 7.6 PATCH edit semantics

Address change is determined only by comparing normalized addresses. Raw
address inequality alone never invalidates location data.

For a name-only or cosmetic edit:

- Store every provided display field verbatim.
- Recompute the corresponding normalized field.
- Preserve coordinates, resolved address, every provider value, all stage
  statuses, errors, and attempt timestamps.
- Make no external call.
- Allow only `updated_at` to advance.

For a normalized address change:

- Preserve the same site ID and active state.
- Store the new display and normalized fields.
- Clear latitude, longitude, and resolved address.
- Clear every Solar Resource and PVWatts value, error, and attempt timestamp.
- Set geocoding to pending.
- Set both downstream stages to blocked.
- Commit this invalidated state before any external call.
- Run the full geocode, Solar Resource, and PVWatts workflow synchronously
  outside the transaction.

The endpoint returns 200 with the full detail serializer after processing,
regardless of handled external outcomes. HTTP status indicates whether the
edit was applied; stage statuses and errors communicate provider outcomes.

### 7.7 Explicit geocode refresh

`POST /api/sites/{id}/geocode/` is a destructive, consistency-first refresh.
It reuses the same invalidation and workflow helper as address-changing
PATCH.

- Clear old coordinates, resolved address, all downstream values/errors, and
  all stage attempt timestamps.
- Commit geocoding pending and downstream blocked.
- Call Nominatim, then both downstream stages if resolved.
- Never restore prior data after failure or an unresolved result.
- Return 200 with the full detail payload after every handled outcome.

### 7.8 Per-stage refresh

`POST /api/sites/{id}/solar-resource/` and
`POST /api/sites/{id}/pvwatts/` are destructive only to their own stage.

Before either call, require:

- `geocode_status == "resolved"`
- non-null latitude
- non-null longitude

Otherwise return 409 without mutation or an external call, including the
current geocode status in the response.

For an allowed refresh:

- Clear only that stage's values, error, and attempted timestamp.
- Set only that stage to pending and commit.
- Call synchronously.
- Store succeeded values or a failed error; never restore old values.
- Never touch geocoding or the other downstream stage.
- Return 200 with the full detail payload for handled success or failure.

One shared stage-refresh helper is parameterized by the fields to clear and
the provider service to call. The two views do not duplicate this workflow.

## 8. Django Admin lifecycle controls

Django Admin provides occasional lifecycle management instead of a separate
user-facing management UI.

It includes bulk actions to:

- Deactivate selected sites.
- Reactivate selected sites.

These actions change only lifecycle state and `updated_at`. They never invoke
external services. Hard deletion is not part of normal application behavior.

## 9. Frontend behavior

### 9.1 API client and CORS

All frontend requests go through one API client module reading
`NEXT_PUBLIC_API_BASE_URL`, with this development default:

```text
http://127.0.0.1:8000/api
```

The backend uses `django-cors-headers` with only:

```text
http://localhost:3000
http://127.0.0.1:3000
```

`CORS_ALLOW_ALL_ORIGINS` and credentialed CORS remain disabled. There is no
Next.js proxy.

### 9.2 Landing page

The landing page displays:

- A U.S. map.
- One marker for every resolved active site.
- A list of all active sites.
- Clear unresolved, failed, blocked, and pending states.
- Detail-page links.

Active unresolved and failed sites remain in the list but do not receive map
markers. Inactive sites are absent.

### 9.3 Detail page

The detail page shows:

- Display name and address.
- Resolved address and coordinates.
- Unit-explicit Solar Resource annual and monthly values.
- Unit-explicit PVWatts annual and monthly values.
- The complete persisted PVWatts assumptions.
- A monthly production visualization.
- User-safe stage errors and statuses.
- Per-stage `last attempted` or `as of` timestamps.
- Focused retry buttons for retryable stages.

It also displays the geocoding attribution required by Nominatim.

## 10. Configuration and local workflow

### 10.1 Environment files

The repository-root `.env.example` is tracked and intentionally includes the
developer's public contact email:

```dotenv
NLR_API_KEY=get-a-free-key-at-developer.nlr.gov
CONTACT_EMAIL=ab12095@nyu.edu
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
```

The local `.env` is gitignored and copied from the example without being
overwritten. The developer fills in `NLR_API_KEY`.

`python-dotenv` loads the repository-root `.env` exactly once in Django
settings using a path derived from `__file__`, never the current working
directory, with `override=False`.

Settings then define:

- `NLR_API_KEY`
- `NLR_API_BASE`
- `CONTACT_EMAIL`
- `NOMINATIM_BASE_URL`

Services import them only from `django.conf.settings`; service modules never
call `os.getenv`.

The frontend tracks `frontend/.env.local.example`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
```

The README distinguishes backend and frontend environment files.

### 10.2 Makefile

A repository-root Makefile provides:

- `make setup`: run `uv sync`, migrate, run `bun install`, and copy both env
  examples into place only when their targets do not exist.
- `make import`: sync `data/sites_initial.json` through `import_sites`.
- `make backend`: run Django's development server in terminal 1.
- `make frontend`: run Next.js through Bun in terminal 2.
- `make test`: run backend pytest, frontend lint, and frontend tests.
- `make check-apis`: run the explicit live external-service smoke check.

There is no combined `make dev` runner.

README quickstart:

1. `make setup`
2. Add `NLR_API_KEY` to `.env`.
3. `make import`
4. Run `make backend` in terminal 1.
5. Run `make frontend` in terminal 2.
6. Open `http://localhost:3000`.

## 11. Live API smoke check

`check_external_apis` is an explicit, non-mutating Django management command.
It is excluded from the automated suite.

Opt-in pytest integration checks exercise the same public provider-check
interfaces. They are marked `live`, require `--run-live`, and remain skipped
under normal pytest and push/pull-request CI. A manual GitHub Actions input may
run them after the required secrets are configured; that input defaults to
false and no scheduled trigger is permitted.

Nominatim uses its dedicated `/status?format=json` endpoint through the same
shared session, User-Agent, lock, limiter, and timeout gateway. It passes only
when HTTP status is 200 and JSON `status` is `0`. A nonzero body status reports
Nominatim's own safe status message. It does not issue a search query; the
command explains that the search path is exercised during the first real site
import.

The NLR legs call Solar Resource and PVWatts once each at a fixed, documented
coordinate and run the responses through the application's production
validators.

The command:

- Does not create, update, or delete Site records.
- Prints safe stage outcomes only.
- Never prints an API key, full request URL, query parameters, or provider
  body.
- Exits nonzero when configuration is missing or a check fails.

The README states:

> The connectivity check uses Nominatim's dedicated status endpoint rather
> than repeating search queries, per the usage policy's caching expectations.

The Nominatim compliance table includes:

| Policy requirement | How this project complies |
|---|---|
| Health checks | Use Nominatim's `/status` endpoint; search queries are never repeated for monitoring |

## 12. Testing strategy

Automated backend tests use pytest, pytest-django, and pytest-socket. Network
access is disabled by construction. Provider HTTP calls, the Nominatim clock,
and sleeping are mocked. Frontend tests mock the shared API client.

Live integration checks run only through an explicit path:
`check_external_apis`/`make check-apis`, or pytest's `live` marker together
with `--run-live`. Both paths are non-mutating and use production validators.

The README includes:

> Automated tests cannot reach the network by construction (pytest-socket);
> external services are contacted only by the running application and the
> explicit operator check or opt-in live integration suite.

### 12.1 Normalization tests

- Case, whitespace, NFKC, non-breaking spaces, and full-width characters.
- Punctuation replacement, including periods, hyphens, and apostrophes.
- `St` differs from `Street`; unit tokens remain significant.
- Non-empty strings that normalize to empty are rejected.

### 12.2 Ingestion tests

- Valid JSON and malformed JSON.
- Unsupported top-level structure.
- Missing, null, non-string, blank, and normalize-to-empty fields.
- Duplicate normalized pairs in one batch.
- Repeated idempotent imports.
- Same address/different name and same name/different address warnings.
- Upsert never deactivates omitted records.
- Exact inactive matches reactivate without retrying stages.
- Structurally invalid sync performs no reconciliation.
- Valid sync commits the active set before external processing.
- An unchanged punctuation variant preserves stored display strings and
  makes no external call.
- Byte-identical addresses in one batch make one Nominatim call and reuse all
  handled outcomes.
- Punctuation-variant verbatim addresses make separate Nominatim calls.
- Every new site runs its own Solar Resource and PVWatts stages.

### 12.3 PATCH tests

- Inactive target returns 404.
- Empty, whitespace-only, null, non-string, normalize-to-empty, array, or
  non-object payloads return 400 as applicable.
- Missing editable fields returns 400.
- One or several unknown fields are all reported and the record is untouched.
- Attempts to write `is_active`, coordinates, or provider fields return 400.
- Malformed and conflicting input returns 400 before conflict lookup.
- Byte-identical full or partial PATCH returns 200 without save, timestamp
  change, conflict query, or external call.
- Cosmetic name and address edits update display strings only.
- `St` to `Street` causes invalidation and processing.
- Active and inactive pair conflicts return the specified 409 body.
- 409 leaves the target byte-for-byte unchanged and makes no external call.
- A confirmed `IntegrityError` uniqueness race returns 409; an unrelated
  integrity error propagates.
- Name-only changes preserve every location and provider field.
- Address changes commit pending/blocked invalidation before external calls.
- Resolved, unresolved, handled-failure, partial-success, and unexpected-crash
  paths persist the specified states and timestamps.

### 12.4 Retry tests

- GET detail and all retry endpoints return 404 for inactive records.
- Geocode refresh clears healthy state before repopulating it.
- Geocode outage after healthy state leaves old coordinates absent and
  downstream blocked.
- Solar/PVWatts refresh without a consistent resolved location returns 409
  without mutation.
- Each per-stage refresh clears only its own stage.
- A failed refresh never restores stale values.
- Solar failure does not prevent successful PVWatts.
- A crash leaves pending plus a null attempt timestamp, and a subsequent
  retry succeeds.

### 12.5 Provider and compliance tests

- Every Nominatim call path uses the custom User-Agent.
- Concurrent/sequential geocode calls pass through the lock and maintain at
  least 1.1 seconds between request starts without real sleeping.
- No module outside geocoding owns the Nominatim base URL or session.
- No source file contains the retired NLR developer domain.
- Missing `NLR_API_KEY` fails both downstream stages without network calls.
- NLR 429 receives the rate-limit-specific message.
- Timeout, connection failure, non-2xx, non-JSON, body-level errors, missing
  fields, wrong types, non-finite numbers, and wrong month counts produce the
  specified handled failures.
- Unexpected exceptions propagate and leave pending state.
- Provider warnings are logged but do not fail valid results.
- Nominatim status requires HTTP 200 and JSON status zero.

### 12.6 Transform and API tests

- Valid provider fixtures produce exact, ordered canonical monthly data.
- Transform guards reject incomplete month collections.
- List and detail serializers use unit-explicit names.
- List includes active unresolved/failed sites but only resolved sites have
  marker coordinates.
- Detail returns complete statuses, errors, assumptions, and timestamps.

## 13. Explicitly deferred work

- Semantic duplicate detection based on geocoded proximity or OSM identity.
- Persistent cross-record geocoding, Solar Resource, or PVWatts caches.
- A user-facing inactive-site or lifecycle-management interface.
- Hard deletion.
- Automatic retries, background workers, Celery, or Redis.
- Authentication and authorization beyond local-only use.
- Multi-process rate limiting.
- Production deployment and production use of the public Nominatim instance.

## 14. Remaining decisions before implementation spec

The following details have not yet been pinned:

- Maximum accepted lengths and database field types for name and address.
- Exact 409 response body for blocked downstream retries.
- Whether provider version/source/station metadata beyond the PVWatts
  assumption record is persisted.
- Final list/detail serializer field inventories.
- Import summary shape, process exit codes, and unexpected-error reporting.
- API URL/router/view organization.
- Frontend component structure, loading behavior, and chart library.
- The five initial sample sites and the later authoritative site-data handoff.
- Final repository layout and staged build order.
