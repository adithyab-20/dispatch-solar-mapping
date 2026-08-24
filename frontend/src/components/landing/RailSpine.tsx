import type { SiteListItem } from "@/lib/api/types";
import { partitionSites } from "@/lib/sites";

function Dot({ site, highlighted }: { site: SiteListItem; highlighted: boolean }) {
  const mapped = site.geocode_status === "resolved";
  const failed = site.geocode_status === "failed";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {mapped ? (
        <circle cx="6" cy="6" r="4.2" fill={highlighted ? "var(--solar-deep)" : "var(--solar)"} />
      ) : (
        <circle cx="6" cy="6" r="4.2" fill="none" stroke={failed ? "var(--fail)" : "var(--muted)"} strokeWidth="1.3" />
      )}
    </svg>
  );
}

/**
 * The collapsed rail: a 56px spine with the expand control, the site count,
 * and one status dot per site — mapped sites as filled discs (deep green when
 * highlighted), unmapped as outlines, failed outlined in the failure colour
 * (each dot also carries its name and status for assistive tech).
 */
export function RailSpine({
  sites,
  highlightedId,
  onExpand,
  onHighlight,
  onOpenDetail,
}: {
  sites: SiteListItem[];
  highlightedId: number | null;
  onExpand: () => void;
  onHighlight: (id: number | null) => void;
  onOpenDetail: (id: number) => void;
}) {
  const { mapped, unmapped } = partitionSites(sites);
  return (
    <aside
      aria-label="Site catalogue, collapsed"
      className="catalog-rail is-collapsed"
      style={{
        background: "var(--panel)",
        borderRight: "1px solid var(--rule-strong)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 0",
        gap: 16,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        className="btn"
        style={{ padding: "5px 7px", borderColor: "var(--rule)" }}
        aria-label="Show the site list"
        onClick={onExpand}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 3v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".15em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Sites&nbsp;&nbsp;{sites.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: 2 }}>
        {mapped.map((site) => (
          <button
            key={site.id}
            type="button"
            className="spine-site"
            aria-label={`${site.name} — ${site.geocode_status}`}
            title={site.name}
            onMouseEnter={() => onHighlight(site.id)}
            onMouseLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(site.id)}
            onBlur={() => onHighlight(null)}
            onClick={() => onOpenDetail(site.id)}
          >
            <Dot site={site} highlighted={site.id === highlightedId} />
          </button>
        ))}
        {mapped.length > 0 && unmapped.length > 0 ? (
          <div style={{ width: 16, height: 1, background: "var(--rule-strong)" }} />
        ) : null}
        {unmapped.map((site) => (
          <button
            key={site.id}
            type="button"
            className="spine-site"
            aria-label={`${site.name} — ${site.geocode_status}; not on the map`}
            title={`${site.name} — not on the map`}
            onClick={() => onOpenDetail(site.id)}
          >
            <Dot site={site} highlighted={false} />
          </button>
        ))}
      </div>
    </aside>
  );
}
