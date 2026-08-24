import type { GeocodeStatus, ProcessingStatus, SiteDetail } from "@/lib/api/types";

// The canonical twelve-month order the backend stores its monthly arrays in
// (`backend/sites/services/constants.py`). Chart and table order key off this,
// never off the array order the API happens to return.
export const MONTH_ORDER = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const MONTH_INDEX = new Map<string, number>(MONTH_ORDER.map((m, i) => [m, i]));

/** Reader-facing month, e.g. "jan" → "Jan"; unknown keys pass through verbatim. */
export function monthLabel(key: string): string {
  return MONTH_INDEX.has(key) ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

/** en-US grouped number with a fixed number of decimals, matching the artboards. */
export function fmt(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A monthly series ordered into the canonical calendar order. Entries for
 * unknown month keys are dropped rather than guessed at, and a missing series
 * yields an empty list — a stage that produced nothing shows nothing.
 */
export function orderMonthly<T extends { month: string }>(entries: T[] | null): T[] {
  if (!entries) return [];
  return entries
    .filter((entry) => MONTH_INDEX.has(entry.month))
    .sort((a, b) => MONTH_INDEX.get(a.month)! - MONTH_INDEX.get(b.month)!);
}

/** "33.43620, -112.12790", or null unless both coordinates are present. */
export function formatCoordinates(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if (latitude === null || longitude === null) return null;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A stored ISO instant as a readable, unambiguous UTC stamp
 * ("23 Aug 2026, 19:04 UTC"). UTC keeps it deterministic regardless of where it
 * is read. Returns null when there is no timestamp.
 */
export function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** How a status chip is drawn (never colour alone — each kind has its own glyph). */
export type ChipKind = "ok" | "fail" | "run" | "none" | "block";

export interface ChipMeta {
  kind: ChipKind;
  word: string;
}

const GEOCODE_CHIPS: Record<GeocodeStatus, ChipMeta> = {
  resolved: { kind: "ok", word: "resolved" },
  pending: { kind: "run", word: "pending" },
  // An outcome, not a fault — never coloured as an error (UI brief §2).
  unresolved: { kind: "none", word: "no match found" },
  failed: { kind: "fail", word: "failed" },
};

const PROCESSING_CHIPS: Record<ProcessingStatus, ChipMeta> = {
  succeeded: { kind: "ok", word: "succeeded" },
  pending: { kind: "run", word: "pending" },
  // Blocked is distinct from failed: nothing was requested, so it is neutral.
  blocked: { kind: "block", word: "blocked" },
  failed: { kind: "fail", word: "failed" },
};

export function geocodeChip(status: GeocodeStatus): ChipMeta {
  return GEOCODE_CHIPS[status];
}

export function processingChip(status: ProcessingStatus): ChipMeta {
  return PROCESSING_CHIPS[status];
}

/**
 * The processing-stages panel is machinery: it stays folded only while all
 * three stages succeeded, and opens itself the moment one is anything else
 * (UI brief §1, honesty rule).
 */
export function shouldAutoOpenStages(site: SiteDetail): boolean {
  return !(
    site.geocode_status === "resolved" &&
    site.solar_resource_status === "succeeded" &&
    site.pvwatts_status === "succeeded"
  );
}

export interface AssumptionRow {
  label: string;
  value: string;
}

type Formatter = (value: unknown) => string;

const withUnit =
  (unit: string): Formatter =>
  (value) =>
    `${value}${unit}`;

const MODULE_TYPES: Record<string, string> = {
  "0": "Standard",
  "1": "Premium",
  "2": "Thin film",
};

const ARRAY_TYPES: Record<string, string> = {
  "0": "Fixed, open rack",
  "1": "Fixed, roof mounted",
  "2": "1-axis tracking",
  "3": "1-axis backtracking",
  "4": "2-axis tracking",
};

// Known PVWatts assumption keys, in the order the reproducibility grid reads.
// Every persisted key is shown; unknown keys still appear via the fallback
// below, so nothing stored is silently dropped (ticket AC).
const KNOWN_ASSUMPTIONS: ReadonlyArray<[string, string, Formatter?]> = [
  ["endpoint", "Endpoint"],
  ["version", "Version"],
  ["system_capacity", "System capacity", withUnit(" kW")],
  ["module_type", "Module type", (v) => MODULE_TYPES[String(v)] ?? String(v)],
  ["array_type", "Array type", (v) => ARRAY_TYPES[String(v)] ?? String(v)],
  ["azimuth", "Azimuth", withUnit("°")],
  ["tilt", "Tilt", (v) => `${v}° (site latitude, 1 dp)`],
  ["losses", "System losses", withUnit("%")],
  ["dataset", "Dataset", (v) => String(v).toUpperCase()],
  ["timeframe", "Timeframe", (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)],
  ["dc_ac_ratio", "DC/AC ratio"],
  ["gcr", "Ground coverage ratio"],
  ["inv_eff", "Inverter efficiency", withUnit("%")],
  ["radius", "Search radius", withUnit(" miles")],
  ["lat", "Latitude"],
  ["lon", "Longitude"],
];

const KNOWN_ORDER = new Map(KNOWN_ASSUMPTIONS.map(([key], i) => [key, i]));

function humanise(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Every persisted, non-secret PVWatts assumption as a labelled, ordered grid.
 * Known keys get a human label, unit, and enumerated value; any unrecognised
 * key still appears (humanised label, raw value) so the reproducibility record
 * is complete. The API key, URLs, and query parameters are never persisted, so
 * they can never reach this list.
 */
export function formatAssumptions(
  record: Record<string, unknown> | null,
): AssumptionRow[] {
  if (!record) return [];
  const formatters = new Map(KNOWN_ASSUMPTIONS.map(([key, label, fmtFn]) => [key, { label, fmtFn }]));
  const orderOf = (key: string) => KNOWN_ORDER.get(key) ?? Number.MAX_SAFE_INTEGER;
  // Sort on the source key — known keys in grid order, unknowns together at the
  // end — then map to labels, so no reverse label→key lookup is needed.
  return Object.entries(record)
    .sort(([a], [b]) => orderOf(a) - orderOf(b))
    .map(([key, value]) => {
      const known = formatters.get(key);
      return known
        ? { label: known.label, value: known.fmtFn ? known.fmtFn(value) : String(value) }
        : { label: humanise(key), value: String(value) };
    });
}
