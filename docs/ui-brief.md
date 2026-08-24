# Dispatch Solar Mapping: UI Brief

Status: proposed for approval (issue [#7](https://github.com/adithyab-20/dispatch-solar-mapping/issues/7))
Scope: the agreed visual direction and interaction model for the frontend
(landing map, site detail, editing, and focused retries), at a fidelity that
lets an implementation agent build tickets #8–#13 without inventing product
decisions.
Last updated: 2026-08-23

This brief is the written companion to the wireframes. Where a pixel-level
question arises, the artboards are the source of truth; where a rule or a
rationale is needed, this document is.

## Prototype and artboards

The prototype is a self-contained Claude Design canvas published from Claude
Code. Its complete editable state (every `.dc.html` artboard plus
`canvas.json`) lives inside the single file:

- **Prototype (open in a browser):** [`design/dispatch-solar-mapping-ui.html`](../design/dispatch-solar-mapping-ui.html)

The individual artboards, and the pipeline that produces them, live in
[`design/`](../design):

| Artboard | File | Covers |
| --- | --- | --- |
| Landing — map + catalog | `design/Main.dc.html` | Default landing, rail expanded |
| Landing — rail collapsed | `design/LandingCollapsed.dc.html` | Collapsed-rail landing, map full width |
| Detail — all stages succeeded | `design/Detail.dc.html` | Healthy detail page |
| Detail — partial (solar failed) | `design/DetailPartial.dc.html` | One stage failed, others valid |
| Detail — unresolved, blocked | `design/DetailUnresolved.dc.html` | No geocode match, downstream blocked |
| System states | `design/States.dc.html` | Loading, empty, API error, not found, inline feedback |
| Editing, conflicts, retries | `design/Edit.dc.html` | Edit panel steps and confirmations |
| Foundations | `design/System.dc.html` | Color, type, status semantics, charts, a11y, map |
| Small screens | `design/Mobile.dc.html` | Phone landing and detail |

Pipeline: `gen-*.mjs` + `chartlib.mjs` generate `design/parts/*.body.html`;
`design/build.sh` assembles those parts with `design/_tokens.css` into the
`.dc.html` artboards. The build is deterministic — re-running it reproduces the
committed artboards byte-for-byte. `chartlib.mjs` exports the same twelve-month
`MONTHS` order the backend uses for its canonical monthly arrays, so chart and
table month order match the API without a second definition.

## 1. Direction

Dispatch Energy's own palette: white and near-white grounds, near-black text,
their greys for rules and secondary text, and a single accent — Dispatch green
`#006400` — for eyebrow labels, links, the success state, map markers,
selection, progress, and every irradiance data mark. Exactly one thing breaks
the green: the **PVWatts production bars**, the estimate the app exists to
produce, are solar orange `#C96A1C`. A status color never carries a data
series, and the data-mark orange never signals a status. Headings and section
labels are Poppins tracked wide; cards are flat with 2–3px radii and hairline
rules, never shadows.

**Hierarchy rule.** A site's own information leads — name, location, the
PVWatts estimate, then the solar resource. Machinery (processing stages, and
sites that produced no result) folds away until it is the thing the reader
actually needs.

**Honesty rule.** A stage that produced nothing shows nothing — never a zero,
never a stale value, never an interpolation. The processing-stages panel stays
collapsed while all three stages succeed, and opens itself the moment one
fails or is blocked, because that is the moment it stops being machinery and
becomes the answer.

## 2. Foundations (AC 7)

### Color

Measured against the ground `#F7F7F8`.

| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| ground | `#F7F7F8` | Page background | — |
| card / panel | `#FFFFFF` | Panel surface | — |
| sunk / disabled | `#F5F5F5` | Recessed / disabled surface | — |
| rule | `#E2E2E2` | Hairline separator | — |
| rule, strong | `#C2C2C2` | Stronger separator, input border | — |
| ink | `#101010` | Primary text | 17.8:1 |
| muted | `#58595B` | Secondary text | 6.6:1 |
| faint | `#767676` | Labels ≥10px only | 4.2:1 |
| Dispatch green | `#006400` | Links, labels, success, markers | 7.0:1 |
| solar, deep | `#004D00` | Green text / hover / column-hover | 9.5:1 |
| green, light | `#3E8E4F` | Irradiance data marks | 3.8:1 (graphical) |
| solar orange | `#C96A1C` | PVWatts production bars only | 3.5:1 (graphical) |
| status: caution | `#8A6100` | Caution / partial | 5.2:1 |
| status: failed | `#B3261E` | Failure | 6.1:1 |

Grid lines in charts are `#ECECEC`; a stronger baseline sits at `#C2C2C2`.

### Type

- **Poppins** — wordmark, headings, and section labels; tracked wide
  (`.13–.22em` on labels/wordmark). Headings use `-.01em`.
- **IBM Plex Sans** — body copy, guidance, and error prose. Never below 12px
  anywhere in the interface.
- **IBM Plex Mono** with tabular figures — every number and identifier, so
  columns align and a changing value never shifts its neighbours.

Reference sizes: page title 24/600; section/row name 15/600; section label
11/600 caps; body 13/400; field label 9.5 mono caps; hero metric 34 mono/500;
coordinates 13 mono. Units are always adjacent to the number, never only in a
column header.

### Spacing, rules, panels

- Spacing scale: 2, 4, 6, 8, 10, 12, 14, 16, 18, 24. Panel padding 14–18px;
  section gap 14px.
- Separation is a 1px `#E2E2E2` rule on a `#FFFFFF` panel — not a shadow.
  Shadows appear only on the floating map callout.
- No nested cards. A failed stage carries a 3px left rule in its status color —
  the one place a whole panel is tinted.
- Breakpoints: split view ≥1100px, stacked below, phone treatment ≤640px. The
  catalog rail is fixed at 400px; the map takes the rest and never drops below
  560px before the layout stacks.

### Status semantics — shape + word + color, never color alone (AC 6)

| Indicator | Stored state | Reader-facing word | On the map |
| --- | --- | --- | --- |
| Filled disc | `geocode_status = resolved` | *resolved* — coordinates shown beside it | Marker |
| Open arc | `pending` | *pending* — started, no outcome yet | No marker |
| Dashed ring | `unresolved` | **no match found** — an outcome, not a fault; never colored as error | No marker |
| Cross | `failed` | *failed* — safe message and time always shown with it | No marker |
| Square | `blocked` | **blocked** — always followed by the reason; retry disabled | — |

Wording rule: the interface says **no match found**, not "unresolved", and
**blocked** is always followed by why. The raw stored-state name appears only
where an engineer needs it (e.g. `mono` sublabels).

## 3. Landing page (AC 1)

Split view: a fixed 400px catalog rail on the left, an interactive US map
filling the rest. App bar shows the wordmark and the configured API origin.

**Catalog rail.** Two groups, both in fixed import order — no sorting or
filtering:

1. **Sites with results** — every active site that has resolved coordinates.
   A resting row shows name, display address, coordinates, and annual AC
   production with a small orange production sparkline. Hover or focus reveals
   one extra line: GHI / DNI / latitude-tilt annual averages as three micro
   bars in the lighter irradiance green. The selected row keeps that line open
   and is marked by a 4px solar left rule plus a tinted background (not color
   alone). A resolved site whose solar resource is missing still appears here
   with its production, plus a small caution glyph and a `solar resource
   missing` note — it has a marker because it has coordinates.
2. **Not on the map** — a folded group at the foot of the rail, with a count
   and a one-line breakdown (e.g. `1 pending · 1 no match · 1 failed`). It
   holds every active site without coordinates: pending, no-match, and failed.
   A site mid-import greys out and reads **processing** with a progress bar
   until an outcome is stored, then joins the results list or this group. The
   group opens itself when every remaining site is in it.

**Map.** One marker per resolved active site; unresolved and failed active
sites stay in the list but get no marker; inactive sites are absent entirely.
Markers are an 11px solar disc with a 2px panel-colored ring and soft halo;
selected is 16px deep-solar with a 2.5px ring. Clicking a marker opens a
floating callout (name, resolved address, annual AC, GHI/DNI/tilt, "Open
detail →"). Hovering or focusing either the map or a row highlights the other;
selecting a marker scrolls its row into view and vice versa. Controls: drag to
pan, scroll or `+`/`−` to zoom, and **Fit to sites**. A permanent legend states
that only resolved sites appear and counts those that do not. Standard
OpenStreetMap raster tiles, desaturated slightly so markers stay brightest.
Nothing on the map triggers a lookup — no search box, no autocomplete, no
geocode on pan.

**Rail collapse (`LandingCollapsed`).** Collapsing the rail hands full width to
the map and leaves a 56px spine with the site count and a status-dot summary.
Opening or closing the rail re-fits the map bounds using the rail width as left
padding, so a west-coast marker is never left stranded behind the panel.

**Attribution.** Tile attribution (`Map data © OpenStreetMap contributors`) and
geocoding attribution (`Geocoding © OpenStreetMap / Nominatim`) are separate
lines on the map.

## 4. Site detail page (AC 2)

Vertical stack, identity first:

1. **Header** — `← All sites` back link, the display name (24/600), a
   `Site #N · active` sublabel, and two actions: **Edit name or address** and
   the destructive **Refresh geocoding…**.
2. **Location strip** — a three-cell panel: *Input address (as imported,
   stored verbatim, used as the geocoding query)* · *Resolved address* (with
   Nominatim attribution, "first result, US only") · *Coordinates* with the
   geocode status chip and `attempted HH:MM`.
3. **Processing stages** — a single collapsible row. Collapsed while all three
   succeeded, showing a success chip and `Last run <date, time>`. It opens
   itself when any stage failed or is blocked, expanding into three per-stage
   cards (Geocoding · Solar resource · PVWatts), each with its status chip,
   `Last attempted`/`Never attempted` timestamp, a plain-language line, and its
   focused control.
4. **PVWatts v8 estimate** — the hero. Annual AC production (34px, solar-deep)
   plus capacity factor, annual solar radiation, and best month; then the
   monthly production chart and its backing table.
5. **Solar resource** — annual GHI, DNI, and latitude-tilt averages, each with
   a small monthly multiple, then the backing monthly table.
6. **Reproducibility — persisted PVWatts assumptions** — the full non-secret
   assumption record as a labeled grid (endpoint, version, system capacity,
   module/array type, azimuth, tilt = *site latitude, 1 dp*, losses, dataset,
   DC/AC ratio, GCR, inverter efficiency, search radius), with explicit notes:
   *Solar Resource is not an input to PVWatts*; *API key, URLs and query
   parameters are never stored or shown*; *values are model estimates, not
   metered production*.
7. **Footer** — geocoding + tile attribution, the data sources (NREL Solar
   Resource v1 & PVWatts v8), and the reassurance that *viewing this page makes
   no provider requests*.

Every stage timestamp is labeled `last attempted` or `as of` as appropriate.
All numbers are unit-explicit and tabular. The detail page has no map, so the
geocoding attribution also appears here.

## 5. Monthly production visualization (AC 3)

- **Form** — twelve ordered months of a single measure is a column chart. One
  measure per chart; never two y-axes.
- **Color** — a single series per chart. PVWatts production in solar orange
  `#C96A1C`; irradiance in the lighter green `#3E8E4F`. Height carries
  magnitude, so color never varies within a series.
- **Labels** — the peak and trough columns are labeled directly; the rest are
  read from the axis or on hover. Units live in the heading (`Monthly AC
  production — kWh`), not on every column.
- **Legend** — none for a single series; the heading names it and its unit.
- **Grid** — three horizontal rules at `#ECECEC`, a stronger baseline, no
  vertical grid, no border, no shadow.
- **Small multiples** — GHI, DNI, and latitude tilt share one 0–8.6 scale so
  their shapes compare honestly; the shared scale is stated in words beneath
  them.
- **Hover / keyboard** — a dark tooltip with month, value, and unit; the hovered
  column darkens to `#004D00`. Arrow keys move the same focus and the tooltip
  text is announced.
- **Backing table** — every chart is backed by the same numbers in a
  months-as-columns table on the same page, so the chart is never the only way
  to read a value.
- **Never** — no zero substituted for a missing month, no interpolation across
  a failed stage, no truncated y-axis.
- **Small screens** — the chart stays a first-class element at phone width and
  the monthly table stays with it, scrolling sideways rather than being
  dropped.

## 6. System states (AC 4)

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton that holds the layout still; the map area names what it waits for (`Loading sites…`). Under reduced motion the spinner becomes a static label. |
| **Empty catalog** | "No sites yet" — explains that sites arrive through the import command, not this page, and shows the exact `make import` command. No fake "Add site" button the API does not provide. |
| **Catalog request failed** | "Could not reach the application API" — names the failing request (`GET /api/sites/ · network error`) without leaking keys, query params, or raw exception text; states no data changed; offers **Try again** and **How to start the backend**. |
| **Site not found** | One response for unknown *and* deactivated IDs — never reveals that an inactive record exists. Offers **Back to all sites**. |
| **Unresolved** | Detail page with a neutral (not error-colored) banner: no US match, both solar stages blocked; plus a "What usually fixes this" panel and **Edit address** / **Refresh geocoding…**. |
| **Blocked** | Solar/PVWatts sections render as dashed placeholders: "Blocked — no data was requested … not a zero, not an estimate." |
| **Failed (partial success)** | Caution banner: the valid stage stands, the failed stage is isolated with its safe message, a **Retry** control, and a "What is unaffected" note. |
| **Stale-data-cleared** | Wherever a refresh has emptied a section, an explicit "Previous values were cleared before this attempt" note, so a blank panel is never read as a zero. |
| **Retry succeeded / failed again / unavailable** | Inline feedback strip in success-green, failure-red, or caution respectively; "unavailable" explains that the stage has no coordinates to work from. |

## 7. Editing and focused retries (AC 5)

**Edit panel.** Opened from the detail header; it stays on the detail route so
the site's current state remains visible behind it. Every state below is a step
in the *same* panel, never a separate page.

- **Unchanged** — Save disabled; "saving now would do nothing at all". Fields
  note they are saved exactly as typed and nothing is looked up while typing.
- **Change detected** — the panel states the cost before commit. *Name only*
  shows a "keeps results" chip: coordinates and both solar results are kept, no
  provider is called, button reads **Save changes**. *Address changed* shows a
  "clears results" caution: coordinates and both solar results (and their
  timestamps) are cleared, the address is looked up again, both solar stages
  re-run; button reads **Save and reprocess**.
- **Saving** — the panel stays open, controls lock, and progress is named stage
  by stage (`1 · Looking up address`, `2 · Solar resource`, `3 · PVWatts`).
  Repeat submissions are ignored while it runs.
- **Rejected (validation)** — nothing is written and no lookup runs; every
  problem is listed at once in a stable order; unsupported fields (e.g.
  `latitude`) are named as ignored.
- **Conflict** — "That name and address pair already exists": explains that
  punctuation and capitalisation are ignored when comparing, that records are
  never merged automatically, and links to the conflicting site
  (`Open site #N →`).

**Focused retries.** Each retryable stage has its own control on its stage
card: **Retry solar resource**, **Retry PVWatts**, **Refresh geocoding…**. A
retry in flight turns its own button into the progress indicator (`Retrying…`),
disables it, and leaves surrounding data on screen until it is replaced. A
blocked stage's control is disabled and says why. **Refresh geocoding…** is
destructive and confirmed first ("Clear and refresh", in the failed color),
because it clears coordinates and both solar results with no earlier version to
fall back to.

## 8. Responsive, keyboard, focus, motion (AC 6)

- **Responsive.** ≥1100px split view; below that it stacks; ≤640px is the phone
  treatment. On phones the map collapses to a fixed 200px band with a "N of M
  mapped" count, the catalog scrolls beneath it, rows are 76px (well past the
  44px touch minimum), the processing stages fold to a single tappable row, and
  the PVWatts chart *and* monthly table are both kept (the table scrolls
  sideways). Density is preserved by dropping the least load-bearing column,
  never by shrinking type below 12px or hiding a status.
- **Keyboard / tab order.** Skip link → app bar → catalog rows in list order →
  the map as a single tab stop; arrow keys then move between markers. The whole
  catalog row is one link.
- **Focus.** A 2px `#101010` outline with 2px offset on every interactive
  element, including map markers. Never removed, never color-only.
- **Color independence.** Status is shape + word + color; selection is a left
  rule + tint, not color alone.
- **Announcements.** Stage-outcome changes are written to a polite live region
  ("Solar resource retried — succeeded").
- **Reduced motion.** Under `prefers-reduced-motion`, spinners become static
  labels, map pans jump, and nothing else animates. No motion is load-bearing.

## 9. Resolved decisions and deferrals (AC 8)

Resolved (previously open questions, from the canvas):

1. **Import order is fixed** — the catalog is never sorted or filtered.
2. **Processing → outcome** — a site being imported greys out and reads
   "processing"; on an outcome it joins the results list or the folded "Not on
   the map" group.
3. **Phone keeps the chart *and* the monthly table** — the site list and the
   stage cards collapse instead.
4. **No revision history is stored** — nothing in the UI implies one, and a
   conflict never surfaces a deactivated record.

Deferred / out of scope for this brief, consistent with the design decisions
record: a user-facing inactive-site or lifecycle-management interface (handled
in Django Admin), semantic duplicate detection, and any automatic/background
retries. All retries here are explicit and user-initiated.

## 10. Acceptance-criteria traceability

| # | Acceptance criterion | Where |
| --- | --- | --- |
| 1 | Landing: map, markers, active-site list, status, navigation | §3; `Main`, `LandingCollapsed`, `Mobile` |
| 2 | Detail hierarchy: identity → addresses → coordinates → stages → errors → timestamps → annual/monthly → assumptions → attribution | §4; `Detail`, `DetailPartial`, `DetailUnresolved` |
| 3 | Monthly visualization: form, labels, units, legend, small-screen | §5; `System`, `Detail`, `Mobile` |
| 4 | Loading, empty, unresolved, failed, pending, partial, stale-cleared, API-error states | §6; `States`, `DetailPartial`, `DetailUnresolved` |
| 5 | Editing and focused retry: placement, confirmation, in-progress, success, error | §7; `Edit`, `DetailPartial`, `States` |
| 6 | Responsive, keyboard, focus, contrast, non-color status, reduced motion | §2, §8; `System`, `Mobile` |
| 7 | Typography, color, spacing, component, and map direction | §1, §2; `System` |
| 8 | Open questions resolved or explicitly deferred | §9; `canvas.json` |
| 9 | Brief/prototype linked from the issue; human records approval | This file + issue #7 comment; approval below |

## Approval

Per acceptance criterion 9, this brief must be approved by a human before issue
#7 is closed. Record approval here (or in the issue) and then close #7:

- Approved by: _pending_
- Date: _pending_
