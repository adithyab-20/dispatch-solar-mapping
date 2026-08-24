"use client";

import { useCallback, useEffect, useState } from "react";

import { AppBar } from "@/components/AppBar";
import { DetailError, DetailLoading, DetailNotFound } from "@/components/detail/states";
import {
  AssumptionsSection,
  DetailBanner,
  DetailFooter,
  DetailHeader,
  LocationStrip,
  PvwattsSection,
  SolarSection,
} from "@/components/detail/sections";
import { ProcessingStages } from "@/components/detail/ProcessingStages";
import { ApiError, type ApiErrorKind, apiClient, apiOrigin } from "@/lib/api/client";
import type { SiteDetail } from "@/lib/api/types";

type View =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "error"; kind: ApiErrorKind }
  | { phase: "ready"; site: SiteDetail };

/**
 * The site detail page: fetches one stored record through the shared API client
 * and renders loading, not-found, error, or the full read-only result. A 404 is
 * the one response for unknown and deactivated IDs alike. Rendering this page
 * triggers no provider work — only this single read call runs.
 */
export function DetailView({ siteId }: { siteId: number | null }) {
  const [view, setView] = useState<View>(siteId === null ? { phase: "not-found" } : { phase: "loading" });

  const load = useCallback(async () => {
    if (siteId === null) {
      setView({ phase: "not-found" });
      return;
    }
    setView({ phase: "loading" });
    try {
      const site = await apiClient.fetchSite(siteId);
      // An inactive record must never be revealed as existing (UI brief §6). The
      // backend 404s inactive sites, but if a 200 ever carried one we still show
      // the same not-found response rather than rendering it.
      setView(site.is_active ? { phase: "ready", site } : { phase: "not-found" });
    } catch (error) {
      if (error instanceof ApiError && error.kind === "http" && error.status === 404) {
        setView({ phase: "not-found" });
        return;
      }
      const kind: ApiErrorKind = error instanceof ApiError ? error.kind : "network";
      setView({ phase: "error", kind });
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar apiOrigin={apiOrigin()} />
      {renderBody(view, siteId, load)}
    </div>
  );
}

function renderBody(view: View, siteId: number | null, retry: () => void) {
  if (view.phase === "loading") {
    return <div className="detail-main" style={{ display: "flex" }}><DetailLoading /></div>;
  }
  if (view.phase === "not-found") {
    return <div className="detail-main" style={{ display: "flex" }}><DetailNotFound /></div>;
  }
  if (view.phase === "error") {
    // The error phase is only ever set after a real fetch, so siteId is present.
    return (
      <div className="detail-main" style={{ display: "flex" }}>
        <DetailError siteId={siteId!} kind={view.kind} onRetry={retry} />
      </div>
    );
  }

  const { site } = view;
  return (
    <>
      <DetailHeader site={site} />
      <div className="detail-main">
        <div className="detail-stack">
          <DetailBanner site={site} />
          <LocationStrip site={site} />
          <ProcessingStages site={site} />
          <PvwattsSection site={site} />
          <SolarSection site={site} />
          <AssumptionsSection site={site} />
          <DetailFooter />
        </div>
      </div>
    </>
  );
}
