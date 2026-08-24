"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import Link from "next/link";

import type { SiteListItem } from "@/lib/api/types";
import { hasCoordinates } from "@/lib/sites";

// Continental-US default view, used until (or unless) markers set the bounds.
const US_CENTER: [number, number] = [39.5, -98.35];
const US_ZOOM = 4;

function FitToSites({ sites }: { sites: SiteListItem[] }) {
  const map = useMap();
  useEffect(() => {
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
  }, [map, sites]);
  return null;
}

/**
 * The US map. One marker per resolved active site (these are pre-filtered by
 * the caller); unresolved/failed sites never reach here. Nothing on the map
 * triggers a provider lookup — there is no search box or geocode-on-pan.
 */
export function SiteMap({
  sites,
  unmappedCount,
}: {
  sites: SiteListItem[];
  unmappedCount: number;
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
        {sites.map((site) => (
          <CircleMarker
            key={site.id}
            center={[site.latitude as number, site.longitude as number]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#006400",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{site.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                {site.address}
              </div>
              <Link href={`/sites/${site.id}`} style={{ display: "inline-block", marginTop: 6, color: "var(--solar)" }}>
                Open detail →
              </Link>
            </Popup>
          </CircleMarker>
        ))}
        <FitToSites sites={sites} />
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
