"use client";

import { useEffect, useRef, useState } from "react";

import { SiteRow } from "@/components/landing/SiteRow";
import type { SiteListItem } from "@/lib/api/types";
import { partitionSites, unmappedSummary } from "@/lib/sites";

/**
 * The catalogue: every active site, grouped into "On the map" (resolved, has a
 * marker) and a collapsible "Not on the map" (pending, no-match, failed). Both
 * groups keep the server's import order; nothing here is sorted or filtered.
 * Highlighting a map marker scrolls its row into view here.
 */
export function CatalogRail({
  sites,
  highlightedId,
  onHighlight,
  onCollapse,
}: {
  sites: SiteListItem[];
  highlightedId: number | null;
  onHighlight: (id: number | null) => void;
  onCollapse: () => void;
}) {
  const { mapped, unmapped } = partitionSites(sites);
  // The folded group opens itself when every remaining site is in it (UI brief §3),
  // and when a highlighted marker's row would otherwise be hidden inside it.
  const [unmappedOpen, setUnmappedOpen] = useState(mapped.length === 0);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedId === null) return;
    railRef.current
      ?.querySelector(`[data-site-row="${highlightedId}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedId]);

  return (
    <div
      ref={railRef}
      className="catalog-rail-content"
    >
      <section aria-label="On the map">
        <div style={{ padding: "15px 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>On the map</h2>
              <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>
                {mapped.length}
              </span>
            </div>
            <button
              type="button"
              className="btn rail-toggle-control"
              aria-label="Collapse the site list"
              onClick={onCollapse}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11.5 3v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
            Active sites with resolved coordinates. Ordered as imported.
          </p>
        </div>
        {mapped.map((site) => (
          <SiteRow
            key={site.id}
            site={site}
            highlighted={site.id === highlightedId}
            onHighlight={onHighlight}
          />
        ))}
      </section>

      <section
        aria-label="Not on the map"
        style={{
          borderTop: "1px solid var(--rule-strong)",
          background: "var(--panel-2)",
          marginTop: "auto",
        }}
      >
        <button
          type="button"
          aria-expanded={unmappedOpen}
          disabled={unmapped.length === 0}
          onClick={() => setUnmappedOpen((open) => !open)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "13px 18px",
            background: "none",
            border: 0,
            cursor: unmapped.length === 0 ? "default" : "pointer",
            textAlign: "left",
            fontFamily: "var(--sans)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d={unmappedOpen ? "M2.5 4l4.5 4.5L11.5 4" : "M4 2.5l4.5 4.5L4 11.5"}
                stroke="#58595b"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Not on the map</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {unmapped.length}
            </span>
          </span>
          <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
            {unmapped.length === 0 ? "every active site has coordinates" : unmappedSummary(unmapped)}
          </span>
        </button>
        {unmappedOpen && unmapped.length > 0 ? (
          <div style={{ background: "var(--panel)" }}>
            {unmapped.map((site) => (
              <SiteRow
                key={site.id}
                site={site}
                highlighted={site.id === highlightedId}
                onHighlight={onHighlight}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
