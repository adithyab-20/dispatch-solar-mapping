"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import Link from "next/link";

import type { SiteListItem } from "@/lib/api/types";
import { fmt } from "@/lib/detail";
import { hasCoordinates } from "@/lib/sites";

// Continental-US default view, used until (or unless) markers set the bounds.
const US_CENTER: [number, number] = [39.5, -98.35];
const US_ZOOM = 4;

function FitToSites({ sites, fitSignal }: { sites: SiteListItem[]; fitSignal: number }) {
  const map = useMap();
  useEffect(() => {
    // The rail opening or closing changes the map's width, so re-measure before
    // fitting — otherwise the old width leaves markers behind the panel.
    map.invalidateSize();
    const points = sites
      .filter(hasCoordinates)
      .map((s) => [s.latitude as number, s.longitude as number] as [number, number]);
    if (points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 9);
      return;
    }
    map.fitBounds(latLngBounds(points), { padding: [48, 48] });
  }, [map, sites, fitSignal]);
  return null;
}

/** The floating callout: identity, annual AC, irradiance, and the detail link. */
function MarkerCallout({ site }: { site: SiteListItem }) {
  const irr: Array<[string, number | null]> = [
    ["GHI", site.annual_ghi_kwh_m2_day],
    ["DNI", site.annual_dni_kwh_m2_day],
    ["TILT", site.annual_latitude_tilt_kwh_m2_day],
  ];
  const hasIrr = irr.some(([, v]) => v !== null);
  return (
    <div style={{ width: 230 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{site.name}</div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
        {site.address}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 9,
          paddingTop: 9,
          borderTop: "1px solid var(--rule)",
        }}
      >
        {site.annual_ac_kwh !== null ? (
          <div>
            <div className="lbl">Annual AC</div>
            <div>
              <span className="num" style={{ fontSize: 15 }}>
                {fmt(site.annual_ac_kwh)}
              </span>{" "}
              <span className="unit">kWh</span>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>No production estimate yet</span>
        )}
        <Link href={`/sites/${site.id}`} style={{ fontSize: 12, color: "var(--solar)", fontWeight: 500 }}>
          Open detail →
        </Link>
      </div>
      {hasIrr ? (
        <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--rule)" }}>
          {irr.map(([label, value]) =>
            value === null ? null : (
              <span key={label} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span className="lbl">{label}</span>
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
      ) : null}
    </div>
  );
}

/**
 * The US map. One marker per resolved active site (these are pre-filtered by
 * the caller); unresolved/failed sites never reach here. Clicking a marker
 * selects it — the rail highlights and scrolls to the matching row — and opens
 * the callout. Nothing on the map triggers a provider lookup.
 */
export function SiteMap({
  sites,
  unmappedCount,
  selectedId = null,
  onSelect,
  fitSignal = 0,
}: {
  sites: SiteListItem[];
  unmappedCount: number;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  fitSignal?: number;
}) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <MapContainer
        center={US_CENTER}
        zoom={US_ZOOM}
        style={{ height: "100%", width: "100%" }}
        aria-label="Map of the United States with resolved solar sites"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site) => {
          const selected = site.id === selectedId;
          return (
            <CircleMarker
              key={site.id}
              center={[site.latitude as number, site.longitude as number]}
              radius={selected ? 9 : 7}
              pathOptions={{
                color: "#ffffff",
                weight: selected ? 2.5 : 2,
                fillColor: selected ? "#004d00" : "#006400",
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect?.(site.id) }}
            >
              <Popup>
                <MarkerCallout site={site} />
              </Popup>
            </CircleMarker>
          );
        })}
        <FitToSites sites={sites} fitSignal={fitSignal} />
      </MapContainer>

      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 500,
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          padding: "9px 11px",
        }}
      >
        <div className="lbl" style={{ marginBottom: 5 }}>
          Map shows
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 }}>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4" fill="#006400" stroke="#ffffff" strokeWidth="1.5" />
          </svg>
          {sites.length} {sites.length === 1 ? "site" : "sites"} with coordinates
        </div>
        {unmappedCount > 0 ? (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {unmappedCount} more {unmappedCount === 1 ? "is" : "are"} listed but unmapped
          </div>
        ) : null}
      </div>

      <div
        className="mono"
        style={{
          position: "absolute",
          right: 12,
          bottom: 10,
          zIndex: 500,
          fontSize: 10,
          color: "var(--muted)",
          background: "rgba(255,255,255,0.9)",
          padding: "2px 6px",
          borderRadius: 2,
        }}
      >
        Geocoding © OpenStreetMap / Nominatim
      </div>
    </div>
  );
}
