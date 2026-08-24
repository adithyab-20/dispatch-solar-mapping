"use client";

import { useCallback, useEffect, useState } from "react";

import { AppBar } from "@/components/AppBar";
import { CatalogRail } from "@/components/landing/CatalogRail";
import { MapPanel } from "@/components/landing/MapPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/landing/states";
import { ApiError, type ApiErrorKind, apiBaseUrl, apiClient } from "@/lib/api/client";
import type { SiteListItem } from "@/lib/api/types";
import { partitionSites } from "@/lib/sites";

type View =
  | { phase: "loading" }
  | { phase: "error"; kind: ApiErrorKind }
  | { phase: "ready"; sites: SiteListItem[] };

function apiOrigin(): string {
  const base = apiBaseUrl();
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/**
 * The landing page: fetches the active-site catalogue through the shared API
 * client and renders loading, error, empty, or the split rail-and-map view.
 * Rendering never triggers a provider request — only this one read call runs.
 */
export function LandingView() {
  const [view, setView] = useState<View>({ phase: "loading" });

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar apiOrigin={apiOrigin()} />
      {renderBody(view, load)}
    </div>
  );
}

function renderBody(view: View, retry: () => void) {
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
      <CatalogRail sites={view.sites} />
      <div className="map-panel">
        <MapPanel sites={mapped} unmappedCount={unmapped.length} />
      </div>
    </div>
  );
}
