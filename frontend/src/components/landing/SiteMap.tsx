"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import { TransitionLink } from "@/components/TransitionLink";
import type { SiteListItem } from "@/lib/api/types";
import { fmt } from "@/lib/detail";
import { hasCoordinates } from "@/lib/sites";

// Continental-US default view, used until (or unless) markers set the bounds.
const US_CENTER: [number, number] = [39.5, -98.35];
const US_ZOOM = 4;

function FitToSites({ coordinateKey }: { coordinateKey: string }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize({ animate: false, pan: false });
    const points = coordinateKey === ""
      ? []
      : coordinateKey.split(";").map((pair) => pair.split(",").map(Number) as [number, number]);
    if (points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 9, { animate: false });
      return;
    }
    map.fitBounds(latLngBounds(points), { animate: false, padding: [48, 48] });
  }, [coordinateKey, map]);
  return null;
}

function ResizeForRail({ layoutSignal }: { layoutSignal: number }) {
  const map = useMap();
  useEffect(() => {
    if (layoutSignal === 0) return;
    // The rail has already committed its new width by the time this effect
    // runs. Re-measure the canvas, but preserve the current view exactly.
    map.invalidateSize({ animate: false, pan: false });
  }, [layoutSignal, map]);
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
        <TransitionLink
          href={`/sites/${site.id}`}
          direction="forward"
          style={{ fontSize: 12, color: "var(--solar)", fontWeight: 500 }}
        >
          Open detail →
        </TransitionLink>
      </div>
      {hasIrr ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, max-content)",
            columnGap: 12,
            rowGap: 5,
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--rule)",
          }}
        >
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
          <span
            className="unit"
            style={{ fontSize: 9.5, gridColumn: "1 / -1", justifySelf: "end", whiteSpace: "nowrap" }}
          >
            kWh/m²/day
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The US map. One marker per resolved active site (these are pre-filtered by
 * the caller); unresolved/failed sites never reach here. Hovering a marker
 * opens its callout and highlights the matching rail row; clicking navigates
 * to its detail page. Nothing on the map triggers a provider lookup.
 */
export function SiteMap({
  sites,
  unmappedCount,
  highlightedId = null,
  onHighlight,
  onOpenDetail,
  layoutSignal = 0,
}: {
  sites: SiteListItem[];
  unmappedCount: number;
  highlightedId?: number | null;
  onHighlight?: (id: number | null) => void;
  onOpenDetail?: (id: number) => void;
  layoutSignal?: number;
}) {
  const coordinateKey = sites
    .filter(hasCoordinates)
    .map((site) => `${site.latitude},${site.longitude}`)
    .join(";");

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <MapContainer
        center={US_CENTER}
        zoom={US_ZOOM}
        style={{ height: "100%", width: "100%" }}
        aria-label="Map of the United States with resolved solar sites"
      >
        <TileLayer
          attribution='Map tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &nbsp;|&nbsp; Geocoding &copy; OpenStreetMap / Nominatim'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site) => {
          const highlighted = site.id === highlightedId;
          return (
            <CircleMarker
              key={site.id}
              center={[site.latitude as number, site.longitude as number]}
              radius={highlighted ? 10 : 7}
              pathOptions={{
                color: "#ffffff",
                weight: highlighted ? 3 : 2,
                fillColor: highlighted ? "#004d00" : "#006400",
                fillOpacity: 1,
              }}
              eventHandlers={{
                click: () => onOpenDetail?.(site.id),
                mouseover: (event) => {
                  event.target.openPopup();
                  onHighlight?.(site.id);
                },
                mouseout: (event) => {
                  event.target.closePopup();
                  onHighlight?.(null);
                },
              }}
            >
              <Popup autoPan={false} closeButton={false}>
                <MarkerCallout site={site} />
              </Popup>
            </CircleMarker>
          );
        })}
        <FitToSites coordinateKey={coordinateKey} />
        <ResizeForRail layoutSignal={layoutSignal} />
      </MapContainer>

      <div
        style={{
          position: "absolute",
          right: 12,
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

    </div>
  );
}
