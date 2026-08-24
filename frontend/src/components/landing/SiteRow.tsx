import Link from "next/link";

import { StatusIndicator } from "@/components/StatusIndicator";
import type { SiteListItem } from "@/lib/api/types";
import { hasCoordinates } from "@/lib/sites";

function formatCoords(lat: number, lon: number): string {
  const fmt = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(4)}`;
  return `${fmt(lat)}, ${fmt(lon)}`;
}

/**
 * One catalogue entry. The whole row is a single link to the detail route
 * (UI brief §8), showing name, display address, coordinates when present, and
 * the geocoding status indicator.
 */
export function SiteRow({ site }: { site: SiteListItem }) {
  const hasCoords = hasCoordinates(site);
  return (
    <Link
      href={`/sites/${site.id}`}
      style={{
        display: "block",
        padding: "15px 18px",
        borderBottom: "1px solid var(--rule)",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.005em" }}>
            {site.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginTop: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {site.address}
          </div>
          {hasCoords ? (
            <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 5 }}>
              {formatCoords(site.latitude as number, site.longitude as number)}
            </div>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <StatusIndicator status={site.geocode_status} />
        </div>
      </div>
    </Link>
  );
}
