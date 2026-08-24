import Link from "next/link";

import type { ProcessingStatus, SiteDetail } from "@/lib/api/types";
import {
  fmt,
  formatAssumptions,
  formatCoordinates,
  formatTimestamp,
  geocodeChip,
  monthLabel,
  orderMonthly,
} from "@/lib/detail";
import { MiniChart } from "@/components/detail/MiniChart";
import { MonthlyChart } from "@/components/detail/MonthlyChart";
import { MonthTable, type MonthTableRow } from "@/components/detail/MonthTable";
import { StatusChip } from "@/components/detail/StatusChip";

function SectionTitle({ title, note, color }: { title: string; note?: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "0 0 10px" }}>
      <h2 className="sec" style={color ? { color } : undefined}>
        {title}
      </h2>
      {note && (
        <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)", textAlign: "right" }}>
          {note}
        </span>
      )}
    </div>
  );
}

/** Header: back link, display name, and a `Site #N · active` sublabel. */
export function DetailHeader({ site }: { site: SiteDetail }) {
  return (
    <div style={{ padding: "18px 24px 16px", background: "var(--panel)", borderBottom: "1px solid var(--rule)" }}>
      <Link href="/" style={{ fontSize: 12, color: "var(--muted)" }}>
        ← All sites
      </Link>
      <div style={{ marginTop: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-.01em" }}>{site.name}</h1>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          {/* Only active sites ever reach this view (DetailView 404s the rest). */}
          Site #{site.id} · active
        </div>
      </div>
    </div>
  );
}

/**
 * A single honest banner reflecting the site's overall state: an unresolved or
 * failed geocode, or a partial result when a downstream stage failed. Silent
 * when all is well.
 */
export function DetailBanner({ site }: { site: SiteDetail }) {
  if (site.geocode_status === "unresolved") {
    return (
      <Banner
        tone="neutral"
        title="No location match — this site is not on the map"
        body="The address matched no United States result, so both solar stages are blocked because they need coordinates."
      />
    );
  }
  if (site.geocode_status === "failed") {
    return (
      <Banner
        tone="fail"
        title="Geocoding failed — this site is not on the map"
        body={site.geocode_error ?? "The lookup could not be completed, so both solar stages are blocked."}
      />
    );
  }
  const downstreamFailed =
    site.solar_resource_status === "failed" || site.pvwatts_status === "failed";
  if (site.geocode_status === "resolved" && downstreamFailed) {
    return (
      <Banner
        tone="caution"
        title="Partial result — one or more stages failed"
        body="The stages that succeeded are shown in full below. A failed stage is isolated with its own message; nothing else is affected."
      />
    );
  }
  return null;
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "neutral" | "caution" | "fail";
  title: string;
  body: string;
}) {
  const styles = {
    neutral: { bg: "var(--panel-2)", border: "var(--rule-strong)", rule: "var(--muted)", text: "var(--ink)", sub: "var(--muted)" },
    caution: { bg: "var(--warn-wash)", border: "var(--warn-border)", rule: "var(--warn)", text: "var(--warn-ink)", sub: "var(--warn-ink)" },
    fail: { bg: "var(--fail-wash)", border: "var(--fail-border)", rule: "var(--fail)", text: "var(--fail-ink)", sub: "var(--fail-ink)" },
  }[tone];
  return (
    <div
      role={tone === "neutral" ? undefined : "alert"}
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderLeft: `3px solid ${styles.rule}`,
        borderRadius: 2,
        padding: "11px 14px",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: styles.text }}>{title}</div>
      <div style={{ fontSize: 12, color: styles.sub, marginTop: 2 }}>{body}</div>
    </div>
  );
}

function Cell({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", borderLeft: first ? undefined : "1px solid var(--rule)" }}>
      {children}
    </div>
  );
}

/** Location strip: input address, resolved address, and coordinates + status. */
export function LocationStrip({ site }: { site: SiteDetail }) {
  const coords = formatCoordinates(site.latitude, site.longitude);
  const attempted = formatTimestamp(site.geocode_attempted_at);
  return (
    <div className="panel location-strip" style={{ borderRadius: 2 }}>
      <Cell first>
        <div className="lbl">Input address (as imported)</div>
        <div style={{ fontSize: 13, marginTop: 5 }}>{site.address}</div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 6 }}>
          stored verbatim · used as the geocoding query
        </div>
      </Cell>
      <Cell>
        <div className="lbl">Resolved address</div>
        <div style={{ fontSize: 13, marginTop: 5, color: site.resolved_address ? "var(--ink)" : "var(--faint)" }}>
          {site.resolved_address ?? "— no match —"}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 6 }}>
          Geocoding © OpenStreetMap / Nominatim · first result, US only
        </div>
      </Cell>
      <Cell>
        <div className="lbl">Coordinates</div>
        <div className="num" style={{ fontSize: 14, marginTop: 5, color: coords ? "var(--ink)" : "var(--faint)" }}>
          {coords ?? "— · —"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <StatusChip meta={geocodeChip(site.geocode_status)} />
          {attempted && (
            <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
              attempted {attempted}
            </span>
          )}
        </div>
      </Cell>
    </div>
  );
}

type EmptyVariant = "blocked" | "pending" | "failed" | "missing";

// A stage that produced nothing never shows a stale value, a zero, or an
// interpolation (UI brief §1) — its result section falls back to this fallback
// prose, keyed only on which stored status is set.
const FAILED_FALLBACK =
  "The request could not be completed. Nothing stale is shown here, and no placeholder zeros are substituted.";

function stageEmptyState(
  status: ProcessingStatus,
  error: string | null,
  messages: { pending: string; blocked: string },
): { variant: EmptyVariant; message: string } {
  if (status === "failed") return { variant: "failed", message: error ?? FAILED_FALLBACK };
  if (status === "pending") return { variant: "pending", message: messages.pending };
  return { variant: "blocked", message: messages.blocked };
}

// Honest placeholder for a stage that produced no data — never a zero or an
// estimate (UI brief §6). Rendered in place of the values, with the same
// last-attempted / never-attempted timestamp the stage card carries.
function StatePanel({
  title,
  color,
  variant,
  message,
  timestamp,
}: {
  title: string;
  color?: string;
  variant: EmptyVariant;
  message: string;
  timestamp: string | null;
}) {
  const failed = variant === "failed";
  return (
    <div
      className="panel"
      style={{
        borderRadius: 2,
        padding: "16px 18px",
        ...(failed
          ? { borderLeft: "3px solid var(--fail)" }
          : { border: "1px dashed var(--rule-strong)", background: "var(--sunk)" }),
      }}
    >
      <SectionTitle title={title} color={color} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 680 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: failed ? "var(--fail)" : "var(--muted)" }}>
            {{
              blocked: "Blocked — no data was requested",
              pending: "Pending — the request has started, no outcome yet",
              failed: "Failed — no values are stored for this stage",
              missing: "No data is stored for this stage",
            }[variant]}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{message}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 8 }}>
            {timestamp ? `last attempted ${timestamp}` : "never attempted"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: "0 18px", borderLeft: "1px solid var(--rule)" }}>
      <div className="lbl">{label}</div>
      <div style={{ marginTop: 5 }}>
        <span className="num" style={{ fontSize: 26, letterSpacing: "-.01em", color: color ?? "var(--ink)" }}>
          {value}
        </span>{" "}
        <span className="unit" style={{ fontSize: 11 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/** PVWatts v8 estimate — the hero (UI brief §4.4), or an honest empty state. */
export function PvwattsSection({ site }: { site: SiteDetail }) {
  const eyebrow = "var(--pv-deepest)";
  const attempted = formatTimestamp(site.pvwatts_attempted_at);
  const asOf = attempted ? `standardised 100 kW scenario · as of ${attempted}` : "standardised 100 kW scenario";
  const monthly = orderMonthly(site.monthly_pvwatts_data);

  if (site.pvwatts_status !== "succeeded") {
    const empty = stageEmptyState(site.pvwatts_status, site.pvwatts_error, {
      pending: "The request has started; production values will appear once an outcome is stored.",
      blocked: "PVWatts needs latitude and longitude. No request was made, so there is nothing to show — not a zero, not an estimate.",
    });
    return <StatePanel title="PVWatts v8 estimate" color={eyebrow} variant={empty.variant} message={empty.message} timestamp={attempted} />;
  }

  if (monthly.length !== 12 || site.annual_ac_kwh === null) {
    return (
      <StatePanel
        title="PVWatts v8 estimate"
        color={eyebrow}
        variant="missing"
        message="The stage reported success but no complete monthly series is stored, so no figures are shown."
        timestamp={attempted}
      />
    );
  }

  const acValues = monthly.map((m) => m.ac_kwh);
  const radValues = monthly.map((m) => m.solar_radiation_kwh_m2_day);
  const bestIndex = acValues.indexOf(Math.max(...acValues));
  const months = monthly.map((m) => monthLabel(m.month));

  const tableRows: MonthTableRow[] = [
    { label: "AC production", unit: "kWh", values: acValues, annual: site.annual_ac_kwh, decimals: 0 },
    {
      label: "Solar radiation",
      unit: "kWh/m²/day",
      values: radValues,
      // The stored figure only — never a mean of the monthly series (honesty rule).
      annual: site.annual_solar_radiation_kwh_m2_day,
      decimals: 2,
    },
  ];

  return (
    <div className="panel" style={{ borderRadius: 2, padding: "16px 18px" }}>
      <SectionTitle title="PVWatts v8 estimate" note={asOf} color={eyebrow} />
      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 14, margin: "2px 0 18px" }}>
        <div style={{ flex: 1, minWidth: 200, paddingRight: 18 }}>
          <div className="lbl">Annual AC production</div>
          <div style={{ marginTop: 5 }}>
            <span className="num" style={{ fontSize: 34, letterSpacing: "-.02em", color: "var(--pv-deep)" }}>
              {fmt(site.annual_ac_kwh)}
            </span>{" "}
            <span className="unit" style={{ fontSize: 12 }}>
              kWh / year
            </span>
          </div>
        </div>
        {site.capacity_factor_percent !== null && (
          <Stat label="Capacity factor" value={fmt(site.capacity_factor_percent, 1)} unit="%" />
        )}
        {site.annual_solar_radiation_kwh_m2_day !== null && (
          <Stat
            label="Annual solar radiation"
            value={fmt(site.annual_solar_radiation_kwh_m2_day, 2)}
            unit="kWh / m² / day"
          />
        )}
        <Stat label="Best month" value={months[bestIndex]} unit={`${fmt(acValues[bestIndex])} kWh`} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          Monthly AC production{" "}
          <span className="unit" style={{ fontSize: 11 }}>
            kWh
          </span>
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
          hover or arrow-key a column for the exact value
        </span>
      </div>
      <MonthlyChart
        values={acValues}
        months={months}
        unit="kWh"
        ariaLabel="Monthly AC production in kilowatt-hours; the backing table below lists every value."
      />
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <MonthTable rows={tableRows} caption="Monthly AC production and solar radiation by month, with annual totals." />
      </div>
    </div>
  );
}

/** Solar resource — annual averages, small multiples, and the backing table. */
export function SolarSection({ site }: { site: SiteDetail }) {
  const attempted = formatTimestamp(site.solar_resource_attempted_at);
  const note = attempted ? `NREL Solar Resource v1 · as of ${attempted}` : "NREL Solar Resource v1";
  const monthly = orderMonthly(site.monthly_solar_data);

  if (site.solar_resource_status !== "succeeded") {
    const empty = stageEmptyState(site.solar_resource_status, site.solar_resource_error, {
      pending: "The request has started; irradiance values will appear once an outcome is stored.",
      blocked: "The solar resource service needs latitude and longitude. No request was made.",
    });
    return <StatePanel title="Solar resource" variant={empty.variant} message={empty.message} timestamp={attempted} />;
  }

  if (
    monthly.length !== 12 ||
    site.annual_ghi_kwh_m2_day === null ||
    site.annual_dni_kwh_m2_day === null ||
    site.annual_latitude_tilt_kwh_m2_day === null
  ) {
    return (
      <StatePanel
        title="Solar resource"
        variant="missing"
        message="The stage reported success but no complete monthly series is stored, so no figures are shown."
        timestamp={attempted}
      />
    );
  }

  const ghi = monthly.map((m) => m.ghi_kwh_m2_day);
  const dni = monthly.map((m) => m.dni_kwh_m2_day);
  const tilt = monthly.map((m) => m.latitude_tilt_kwh_m2_day);
  const sharedMax = Math.max(...ghi, ...dni, ...tilt) * 1.06;

  const multiples: Array<[string, number, number[]]> = [
    ["Global horizontal irradiance", site.annual_ghi_kwh_m2_day, ghi],
    ["Direct normal irradiance", site.annual_dni_kwh_m2_day, dni],
    ["Latitude-tilt irradiance", site.annual_latitude_tilt_kwh_m2_day, tilt],
  ];

  const tableRows: MonthTableRow[] = [
    { label: "GHI", unit: "kWh/m²/day", values: ghi, annual: site.annual_ghi_kwh_m2_day, decimals: 2 },
    { label: "DNI", unit: "kWh/m²/day", values: dni, annual: site.annual_dni_kwh_m2_day, decimals: 2 },
    { label: "Latitude tilt", unit: "kWh/m²/day", values: tilt, annual: site.annual_latitude_tilt_kwh_m2_day, decimals: 2 },
  ];

  return (
    <div className="panel" style={{ borderRadius: 2, padding: "16px 18px" }}>
      <SectionTitle title="Solar resource" note={note} />
      <div className="solar-multiples">
        {multiples.map(([label, annual, values]) => (
          <div key={label}>
            <div className="lbl">{label}</div>
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <span className="num" style={{ fontSize: 22, color: "var(--teal-deep)" }}>
                {fmt(annual, 2)}
              </span>{" "}
              <span className="unit">kWh / m² / day, annual avg</span>
            </div>
            <MiniChart values={values} max={sharedMax} ariaLabel={`${label}, twelve months; see the table below for values.`} />
          </div>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>
        The three small multiples share one 0–{sharedMax.toFixed(1)} scale, so their heights are directly comparable.
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
        <MonthTable rows={tableRows} caption="Monthly GHI, DNI, and latitude-tilt irradiance, with annual averages." />
      </div>
    </div>
  );
}

/** Reproducibility — every persisted, non-secret PVWatts assumption (§4.6). */
export function AssumptionsSection({ site }: { site: SiteDetail }) {
  const rows = formatAssumptions(site.pvwatts_assumptions);
  if (rows.length === 0) {
    return (
      <div className="panel" style={{ borderRadius: 2, padding: "14px 16px" }}>
        <SectionTitle title="Reproducibility — persisted PVWatts assumptions" />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          No assumptions are stored yet — they are persisted with a completed PVWatts estimate.
        </div>
      </div>
    );
  }
  const notes = [
    "Solar Resource is not an input to PVWatts.",
    "API key, URLs and query parameters are never stored or shown.",
    "Values are model estimates, not metered production.",
  ];
  return (
    <div className="panel" style={{ borderRadius: 2, padding: "14px 16px" }}>
      <SectionTitle title="Reproducibility — persisted PVWatts assumptions" note="stored with the result · non-secret only" />
      <div className="assumptions-grid">
        {rows.map((row) => (
          <div key={row.label} style={{ background: "var(--panel)", padding: "8px 10px" }}>
            <div className="lbl">{row.label}</div>
            <div className="mono" style={{ fontSize: 11.5, marginTop: 2 }}>
              {row.value}
            </div>
          </div>
        ))}
        {notes.map((note) => (
          <div key={note} style={{ background: "var(--panel-2)", padding: "8px 10px" }}>
            <div className="lbl">Note</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Footer: geocoding attribution kept separate from tile attribution (the detail
 * page has no map, so the Nominatim credit must appear here), the data sources,
 * and the reassurance that viewing makes no provider requests (UI brief §4.7).
 */
export function DetailFooter() {
  return (
    <footer
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 0 4px",
        borderTop: "1px solid var(--rule)",
        marginTop: 2,
      }}
    >
      <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
        {/* Two distinct credits: the geocoding attribution is required to be */}
        {/* visible separately from the map-tile attribution (ticket AC). */}
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          Geocoding © OpenStreetMap / Nominatim
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          Map tiles © OpenStreetMap contributors
        </span>
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
        Solar data: NREL Solar Resource v1 &amp; PVWatts v8 · viewing this page makes no provider requests
      </span>
    </footer>
  );
}
