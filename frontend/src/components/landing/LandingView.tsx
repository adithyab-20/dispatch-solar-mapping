"use client";

import { useCallback, useEffect, useState } from "react";

import { AppBar } from "@/components/AppBar";
import { CatalogRail } from "@/components/landing/CatalogRail";
import { MapPanel } from "@/components/landing/MapPanel";
import { RailSpine } from "@/components/landing/RailSpine";
import { EmptyState, ErrorState, LoadingState } from "@/components/landing/states";
import { ApiError, type ApiErrorKind, apiClient, apiOrigin } from "@/lib/api/client";
import type { SiteListItem } from "@/lib/api/types";
import { partitionSites } from "@/lib/sites";

type View =
  | { phase: "loading" }
  | { phase: "error"; kind: ApiErrorKind }
  | { phase: "ready"; sites: SiteListItem[] };

/**
 * The landing page: fetches the active-site catalogue through the shared API
 * client and renders loading, error, empty, or the split rail-and-map view.
 * Rendering never triggers a provider request — only this one read call runs.
 */
export function LandingView() {
  const [view, setView] = useState<View>({ phase: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Bumped whenever the rail opens or closes so the map re-measures itself and
  // re-fits its bounds — a west-coast marker is never left behind the panel.
  const [fitSignal, setFitSignal] = useState(0);

  const load = useCallback(async () => {
    setView({ phase: "loading" });
    try {
      const sites = await apiClient.fetchSites();
      setView({ phase: "ready", sites });
    } catch (error) {
      const kind: ApiErrorKind = error instanceof ApiError ? error.kind : "network";
      setView({ phase: "error", kind });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRail = useCallback(() => {
    setCollapsed((value) => !value);
    setFitSignal((n) => n + 1);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar apiOrigin={apiOrigin()} />
      {renderBody(view, load, { selectedId, onSelect: setSelectedId, collapsed, toggleRail, fitSignal })}
    </div>
  );
}

interface RailState {
  selectedId: number | null;
  onSelect: (id: number) => void;
  collapsed: boolean;
  toggleRail: () => void;
  fitSignal: number;
}

function renderBody(view: View, retry: () => void, rail: RailState) {
  if (view.phase === "loading") {
    return (
      <div className="landing-split">
        <LoadingState />
      </div>
    );
  }
  if (view.phase === "error") {
    return (
      <div className="landing-split">
        <ErrorState kind={view.kind} onRetry={retry} />
      </div>
    );
  }
  if (view.sites.length === 0) {
    return (
      <div className="landing-split">
        <EmptyState />
      </div>
    );
  }

  const { mapped, unmapped } = partitionSites(view.sites);
  return (
    <div className="landing-split">
      {rail.collapsed ? (
        <RailSpine sites={view.sites} selectedId={rail.selectedId} onExpand={rail.toggleRail} />
      ) : (
        <CatalogRail sites={view.sites} selectedId={rail.selectedId} onCollapse={rail.toggleRail} />
      )}
      <div className="map-panel">
        <MapPanel
          sites={mapped}
          unmappedCount={unmapped.length}
          selectedId={rail.selectedId}
          onSelect={rail.onSelect}
          fitSignal={rail.fitSignal}
        />
      </div>
    </div>
  );
}
