"use client";

import { useState } from "react";

import type { SiteDetail } from "@/lib/api/types";
import {
  formatTimestamp,
  geocodeChip,
  processingChip,
  shouldAutoOpenStages,
  type ChipMeta,
} from "@/lib/detail";
import { StatusChip } from "@/components/detail/StatusChip";

interface StageModel {
  name: string;
  chip: ChipMeta;
  attemptedAt: string | null;
  line: string;
  error: string | null;
}

function stageModels(site: SiteDetail): StageModel[] {
  const geocodeLine: Record<SiteDetail["geocode_status"], string> = {
    resolved: "The address resolved to a United States location; the coordinates are shown above.",
    pending: "The lookup has started; no outcome is stored yet.",
    unresolved: "The address was accepted but matched no United States location. This is an outcome, not an error.",
    failed: "The lookup could not be completed. No coordinates were stored.",
  };
  const processingLine = (
    status: SiteDetail["solar_resource_status"],
    succeeded: string,
  ): string =>
    ({
      succeeded,
      pending: "The request has started; no outcome is stored yet.",
      blocked: "Needs resolved coordinates before it can run.",
      failed: "The request could not be completed. No values were stored.",
    })[status];

  return [
    {
      name: "Geocoding",
      chip: geocodeChip(site.geocode_status),
      attemptedAt: site.geocode_attempted_at,
      line: geocodeLine[site.geocode_status],
      error: site.geocode_error,
    },
    {
      name: "Solar resource",
      chip: processingChip(site.solar_resource_status),
      attemptedAt: site.solar_resource_attempted_at,
      line: processingLine(
        site.solar_resource_status,
        "Annual and monthly irradiance values are stored below.",
      ),
      error: site.solar_resource_error,
    },
    {
      name: "PVWatts",
      chip: processingChip(site.pvwatts_status),
      attemptedAt: site.pvwatts_attempted_at,
      line: processingLine(
        site.pvwatts_status,
        "Annual and monthly production values are stored below.",
      ),
      error: site.pvwatts_error,
    },
  ];
}

function StageError({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "var(--fail-wash)",
        borderLeft: "2px solid var(--fail)",
        padding: "8px 10px",
        borderRadius: 2,
      }}
    >
      <div className="lbl" style={{ color: "var(--fail)" }}>
        Stage error
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fail-ink)", marginTop: 3 }}>{text}</div>
    </div>
  );
}

function StageCard({ stage }: { stage: StageModel }) {
  const ts = formatTimestamp(stage.attemptedAt);
  return (
    <div
      className="panel"
      style={{ flex: 1, minWidth: 220, padding: "13px 15px", borderRadius: 2, display: "flex", flexDirection: "column", gap: 9 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{stage.name}</span>
        <StatusChip meta={stage.chip} />
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
        {ts ? `Last attempted ${ts}` : "Never attempted"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{stage.line}</div>
      {stage.error && <StageError text={stage.error} />}
    </div>
  );
}

const chevron = (open: boolean) => (
  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d={open ? "M2.5 4.5L7 9l4.5-4.5" : "M4 2.5l4.5 4.5L4 11.5"}
      stroke="#58595B"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The processing-stages panel (UI brief §4.3). It is machinery: collapsed while
 * all three stages succeeded, and opened by default the moment one is anything
 * else. Either way the reader can toggle it.
 */
export function ProcessingStages({ site }: { site: SiteDetail }) {
  const autoOpen = shouldAutoOpenStages(site);
  const [open, setOpen] = useState(autoOpen);
  const stages = stageModels(site);

  const lastRun = formatTimestamp(
    [site.geocode_attempted_at, site.solar_resource_attempted_at, site.pvwatts_attempted_at]
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1) ?? null,
  );

  const summary = autoOpen
    ? "opened automatically — a stage needs attention"
    : "all three stages succeeded";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          padding: "11px 15px",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--sans)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {chevron(false)}
          <span className="sec" style={{ color: "var(--ink)" }}>
            Processing stages
          </span>
          <StatusChip meta={{ kind: "ok", word: "all three succeeded" }} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {lastRun && (
            <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
              Last run {lastRun}
            </span>
          )}
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Show details</span>
        </span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "var(--panel-2)",
          border: "1px solid var(--rule-strong)",
          borderBottom: 0,
          borderRadius: "2px 2px 0 0",
          padding: "11px 15px",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--sans)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {chevron(true)}
          <span className="sec" style={{ color: "var(--ink)" }}>
            Processing stages
          </span>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{summary}</span>
        </span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Hide</span>
      </button>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "stretch",
          border: "1px solid var(--rule-strong)",
          borderTop: 0,
          borderRadius: "0 0 2px 2px",
          padding: 12,
          background: "var(--sunk)",
        }}
      >
        {stages.map((stage) => (
          <StageCard key={stage.name} stage={stage} />
        ))}
      </div>
    </div>
  );
}
