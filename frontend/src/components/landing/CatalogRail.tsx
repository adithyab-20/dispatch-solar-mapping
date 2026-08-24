"use client";

import { useState } from "react";

import { SiteRow } from "@/components/landing/SiteRow";
import type { SiteListItem } from "@/lib/api/types";
import { partitionSites, unmappedSummary } from "@/lib/sites";

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: "15px 18px 12px", display: "flex", alignItems: "baseline", gap: 9 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
      <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>
        {count}
      </span>
    </div>
  );
}

/**
 * The catalogue: every active site, grouped into "On the map" (resolved, has a
 * marker) and a collapsible "Not on the map" (pending, no-match, failed). Both
 * groups keep the server's import order; nothing here is sorted or filtered.
 */
export function CatalogRail({ sites }: { sites: SiteListItem[] }) {
  const { mapped, unmapped } = partitionSites(sites);
  // The folded group opens itself when every remaining site is in it (UI brief §3).
  const [unmappedOpen, setUnmappedOpen] = useState(mapped.length === 0);

  return (
    <aside
      aria-label="Site catalogue"
      className="catalog-rail"
      style={{
        background: "var(--panel)",
        borderRight: "1px solid var(--rule-strong)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <section aria-label="On the map">
        <GroupHeading title="On the map" count={mapped.length} />
        <p style={{ margin: "0 18px 6px", fontSize: 11.5, color: "var(--muted)" }}>
          Active sites with resolved coordinates. Ordered as imported.
        </p>
        {mapped.map((site) => (
          <SiteRow key={site.id} site={site} />
        ))}
      </section>

      {unmapped.length > 0 ? (
        <section
          aria-label="Not on the map"
          style={{ borderTop: "1px solid var(--rule-strong)", background: "var(--panel-2)" }}
        >
          <button
            type="button"
            aria-expanded={unmappedOpen}
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
              cursor: "pointer",
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
              {unmappedSummary(unmapped)}
            </span>
          </button>
          {unmappedOpen ? (
            <div style={{ background: "var(--panel)" }}>
              {unmapped.map((site) => (
                <SiteRow key={site.id} site={site} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
