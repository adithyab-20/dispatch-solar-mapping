import { StatusIndicator } from "@/components/StatusIndicator";
import { TransitionLink } from "@/components/TransitionLink";
import type { SiteListItem } from "@/lib/api/types";
import { fmt } from "@/lib/format";
import { hasCoordinates, isMappable, missingResultNote, monthlyAcSeries } from "@/lib/sites";

function formatCoords(lat: number, lon: number): string {
  const f = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(4)}`;
  return `${f(lat)}, ${f(lon)}`;
}

/** The small orange production sparkline: 12 bars scaled to the row's own peak. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <svg width="88" height="22" viewBox="0 0 88 22" aria-hidden="true">
      {values.map((v, i) => {
        const h = max > 0 ? (v / max) * 20 : 0;
        return (
          <rect key={i} x={i * 7.4} y={22 - h} width="5" height={h} rx="1.6" fill="var(--pv)" />
        );
      })}
    </svg>
  );
}

// The three-bar glyph beside each irradiance figure is a fixed decorative mark
// (from the artboards); the number beside it is the real stored value.
function IrrGlyph() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      {[0.62, 0.86, 1].map((f, i) => (
        <rect key={i} x={i * 5} y={12 - 12 * f} width="3.4" height={12 * f} rx="1" fill="var(--teal)" />
      ))}
    </svg>
  );
}

function IrradianceLine({ site }: { site: SiteListItem }) {
  const entries: Array<[string, number | null]> = [
    ["GHI", site.annual_ghi_kwh_m2_day],
    ["DNI", site.annual_dni_kwh_m2_day],
    ["TILT", site.annual_latitude_tilt_kwh_m2_day],
  ];
  if (entries.every(([, v]) => v === null)) return null;
  return (
    <div className="row-irr-reveal">
      <div className="row-irr-clip">
        <div className="row-irr">
          {entries.map(([label, value]) =>
            value === null ? null : (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IrrGlyph />
                <span className="lbl" style={{ color: "var(--muted)" }}>
                  {label}
                </span>
                <span className="num" style={{ fontSize: 11.5, color: "var(--teal-deep)" }}>
                  {fmt(value, 2)}
                </span>
              </span>
            ),
          )}
          <span className="unit" style={{ fontSize: 9.5 }}>
            kWh/m²/day
          </span>
        </div>
      </div>
    </div>
  );
}

function CautionGlyph({ note }: { note: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <title>{note}</title>
      <path d="M8 1.8l6 10.8H2z" fill="none" stroke="var(--warn)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.2v3.2" stroke="var(--warn)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r=".8" fill="var(--warn)" />
    </svg>
  );
}

/**
 * One catalogue entry — a single link to the detail route (UI brief §8). A
 * mapped row shows name, address, coordinates, annual AC production with its
 * sparkline, and — on hover, focus, or map highlight — the irradiance line. A
 * mapped row missing a result carries a caution glyph and names what is
 * missing; an unmapped row shows only identity plus its status word.
 */
export function SiteRow({
  site,
  highlighted = false,
  onHighlight,
}: {
  site: SiteListItem;
  highlighted?: boolean;
  onHighlight?: (id: number | null) => void;
}) {
  const hasCoords = hasCoordinates(site);
  const note = isMappable(site) ? missingResultNote(site) : null;
  const acSeries = monthlyAcSeries(site);
  return (
    <TransitionLink
      href={`/sites/${site.id}`}
      direction="forward"
      className={`site-row${highlighted ? " is-highlighted" : ""}`}
      data-site-row={site.id}
      onMouseEnter={() => onHighlight?.(site.id)}
      onMouseLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(site.id)}
      onBlur={() => onHighlight?.(null)}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.005em" }}>
              {site.name}
            </span>
            {note ? <CautionGlyph note={note} /> : null}
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
          <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 5 }}>
            {hasCoords
              ? formatCoords(site.latitude as number, site.longitude as number)
              : null}
            {hasCoords && note ? " · " : null}
            {note}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {site.annual_ac_kwh !== null ? (
            <>
              <div>
                <span className="num" style={{ fontSize: 17, letterSpacing: "-.01em" }}>
                  {fmt(site.annual_ac_kwh)}
                </span>{" "}
                <span className="unit" style={{ fontSize: 10 }}>
                  kWh/yr
                </span>
              </div>
              {acSeries ? <div style={{ marginTop: 4 }}>{acSeries && <Spark values={acSeries} />}</div> : null}
            </>
          ) : (
            <StatusIndicator status={site.geocode_status} />
          )}
        </div>
      </div>
      <IrradianceLine site={site} />
    </TransitionLink>
  );
}
