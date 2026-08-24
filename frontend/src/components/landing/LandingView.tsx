"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { CatalogRail } from "@/components/landing/CatalogRail";
import { MapPanel } from "@/components/landing/MapPanel";
import { useRailState } from "@/components/landing/RailState";
import { RailSpine } from "@/components/landing/RailSpine";
import { EmptyState, ErrorState, LoadingState } from "@/components/landing/states";
import { UploadSitesDialog } from "@/components/landing/UploadSitesDialog";
import { ApiError, type ApiErrorKind, apiClient, apiOrigin } from "@/lib/api/client";
import type { SiteListItem } from "@/lib/api/types";
import { partitionSites } from "@/lib/sites";
import { startPageTransition } from "@/lib/page-transition";

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
  const router = useRouter();
  const { collapsed, setCollapsed } = useRailState();
  const [view, setView] = useState<View>({ phase: "loading" });
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Bumped whenever the rail opens or closes so Leaflet re-measures its canvas
  // without changing the user's zoom or center.
  const [layoutSignal, setLayoutSignal] = useState(0);

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
    setHighlightedId(null);
    setLayoutSignal((n) => n + 1);
  }, [setCollapsed]);

  const openDetail = useCallback((id: number) => {
    startPageTransition("forward", () => router.push(`/sites/${id}`));
  }, [router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar apiOrigin={apiOrigin()} onUploadSites={() => setUploadOpen(true)} />
      {renderBody(view, load, {
        highlightedId,
        onHighlight: setHighlightedId,
        onOpenDetail: openDetail,
        collapsed,
        toggleRail,
        layoutSignal,
        onReload: load,
      })}
      <UploadSitesDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onComplete={load}
      />
    </div>
  );
}

interface RailState {
  highlightedId: number | null;
  onHighlight: (id: number | null) => void;
  onOpenDetail: (id: number) => void;
  collapsed: boolean;
  toggleRail: () => void;
  layoutSignal: number;
  onReload: () => void;
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
      <aside
        aria-label={rail.collapsed ? "Site catalogue, collapsed" : "Site catalogue"}
        className={`catalog-rail${rail.collapsed ? " is-collapsed" : ""}`}
      >
        <div
          className="catalog-rail-viewport"
          aria-hidden={rail.collapsed}
          inert={rail.collapsed ? true : undefined}
        >
          <CatalogRail
            sites={view.sites}
            highlightedId={rail.highlightedId}
            onHighlight={rail.onHighlight}
            onCollapse={rail.toggleRail}
            onReload={rail.onReload}
          />
        </div>
        {rail.collapsed ? <RailSpine onExpand={rail.toggleRail} /> : null}
      </aside>
      <div className="map-panel">
        <MapPanel
          sites={mapped}
          unmappedCount={unmapped.length}
          highlightedId={rail.highlightedId}
          onHighlight={rail.onHighlight}
          onOpenDetail={rail.onOpenDetail}
          layoutSignal={rail.layoutSignal}
        />
      </div>
    </div>
  );
}
