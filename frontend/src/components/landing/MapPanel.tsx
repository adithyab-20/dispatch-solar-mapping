"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map is loaded client-side only. Isolating the
// dynamic import here keeps the rest of the landing tree server-renderable and
// lets tests replace this panel without pulling Leaflet into jsdom.
export const MapPanel = dynamic(
  () => import("@/components/landing/SiteMap").then((m) => m.SiteMap),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span className="lbl">Loading map…</span>
      </div>
    ),
  },
);
