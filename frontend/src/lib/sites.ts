import type { GeocodeStatus, SiteListItem } from "@/lib/api/types";

/** The four ways a geocoding indicator can be drawn (shape, never colour alone). */
export type MarkerShape = "disc" | "arc" | "dashed-ring" | "cross";

/** Contrast tone for the indicator. `neutral` is deliberately not an error tone. */
export type StatusTone = "ok" | "muted" | "neutral" | "fail";

export interface GeocodeStatusMeta {
  /** Reader-facing word — "no match found", never the raw "unresolved". */
  word: string;
  shape: MarkerShape;
  tone: StatusTone;
}

/** Both coordinates present — they are only ever meaningful as a pair. */
export function hasCoordinates(site: SiteListItem): boolean {
  return site.latitude !== null && site.longitude !== null;
}

/**
 * A site earns a map marker only when geocoding resolved AND both coordinates
 * are present. The two conditions are checked independently so a resolved row
 * that is somehow missing a coordinate is never plotted at a phantom point.
 */
export function isMappable(site: SiteListItem): boolean {
  return site.geocode_status === "resolved" && hasCoordinates(site);
}

/** Split the catalogue into mapped and unmapped, preserving import order. */
export function partitionSites(sites: SiteListItem[]): {
  mapped: SiteListItem[];
  unmapped: SiteListItem[];
} {
  const mapped: SiteListItem[] = [];
  const unmapped: SiteListItem[] = [];
  for (const site of sites) {
    (isMappable(site) ? mapped : unmapped).push(site);
  }
  return { mapped, unmapped };
}

const STATUS_META: Record<GeocodeStatus, GeocodeStatusMeta> = {
  resolved: { word: "resolved", shape: "disc", tone: "ok" },
  pending: { word: "pending", shape: "arc", tone: "muted" },
  // "no match found" is an outcome, not a fault, so it is never coloured as an error.
  unresolved: { word: "no match found", shape: "dashed-ring", tone: "neutral" },
  failed: { word: "failed", shape: "cross", tone: "fail" },
};

export function geocodeStatusMeta(status: GeocodeStatus): GeocodeStatusMeta {
  return STATUS_META[status];
}

// Order and wording of the "Not on the map" breakdown line.
const SUMMARY_PARTS: ReadonlyArray<[GeocodeStatus, string]> = [
  ["pending", "pending"],
  ["unresolved", "no match"],
  ["failed", "failed"],
];

/** e.g. "1 pending · 2 no match · 1 failed"; empty categories are omitted. */
export function unmappedSummary(unmapped: SiteListItem[]): string {
  return SUMMARY_PARTS.map(([status, label]) => {
    const count = unmapped.filter((s) => s.geocode_status === status).length;
    return count > 0 ? `${count} ${label}` : null;
  })
    .filter((part): part is string => part !== null)
    .join(" · ");
}
