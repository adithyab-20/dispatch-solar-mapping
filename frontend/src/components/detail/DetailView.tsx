"use client";

import { useCallback, useEffect, useState } from "react";

import { AppBar } from "@/components/AppBar";
import { EditSitePanel } from "@/components/detail/EditSitePanel";
import { GeocodeRefreshDialog } from "@/components/detail/GeocodeRefreshDialog";
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
import {
  ApiError,
  type ApiErrorKind,
  type RefreshConflictPayload,
  type SitePatchInput,
  apiClient,
  apiOrigin,
} from "@/lib/api/client";
import type { SiteDetail } from "@/lib/api/types";

type View =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "error"; kind: ApiErrorKind }
  | { phase: "ready"; site: SiteDetail };

type BusyAction = "edit" | "geocode" | "solar" | "pvwatts" | null;
type Feedback = { tone: "ok" | "fail" | "warn"; message: string } | null;

function isRefreshConflict(value: unknown): value is RefreshConflictPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).detail === "string" &&
    typeof (value as Record<string, unknown>).geocode_status === "string"
  );
}

/**
 * The site detail page: fetches one stored record through the shared API client
 * and renders loading, not-found, error, or the full read-only result. A 404 is
 * the one response for unknown and deactivated IDs alike. Rendering this page
 * triggers no provider work — only this single read call runs.
 */
export function DetailView({ siteId }: { siteId: number | null }) {
  const [view, setView] = useState<View>(siteId === null ? { phase: "not-found" } : { phase: "loading" });
  const [busy, setBusy] = useState<BusyAction>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [geocodeConfirmOpen, setGeocodeConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

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

  async function saveSite(input: SitePatchInput): Promise<void> {
    if (siteId === null || busy !== null) return;
    setBusy("edit");
    setFeedback(null);
    try {
      const site = await apiClient.updateSite(siteId, input);
      setView({ phase: "ready", site });
      const message = "Site changes saved — the returned processing state is shown below.";
      setFeedback({ tone: "ok", message });
    } finally {
      setBusy(null);
    }
  }

  async function runRefresh(
    kind: Exclude<BusyAction, "edit" | null>,
    request: () => Promise<SiteDetail>,
  ) {
    if (busy !== null) return;
    setBusy(kind);
    setFeedback(null);
    try {
      const site = await request();
      setView({ phase: "ready", site });
      const statusWord = kind === "geocode" ? site.geocode_status : kind === "solar" ? site.solar_resource_status : site.pvwatts_status;
      const stageName = kind === "geocode" ? "Geocoding" : kind === "solar" ? "Solar resource" : "PVWatts";
      const succeeded = statusWord === "resolved" || statusWord === "succeeded";
      const readerStatus = statusWord === "unresolved" ? "no match found" : statusWord;
      const message = `${stageName} retried — ${readerStatus}. Previous values were cleared before this attempt.`;
      setFeedback({ tone: succeeded ? "ok" : statusWord === "unresolved" ? "warn" : "fail", message });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && isRefreshConflict(error.payload)) {
        const message = `${error.payload.detail} Current geocoding status: ${error.payload.geocode_status}.`;
        setFeedback({ tone: "warn", message });
      } else {
        const message = "The retry request could not be completed through the application API.";
        setFeedback({ tone: "fail", message });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar apiOrigin={apiOrigin()} />
      {renderBody(view, siteId, load, {
        busy,
        feedback,
        onEdit: () => setEditOpen(true),
        onRefreshGeocoding: () => setGeocodeConfirmOpen(true),
        onRetrySolarResource: () => siteId !== null && void runRefresh("solar", () => apiClient.refreshSolarResource(siteId)),
        onRetryPvwatts: () => siteId !== null && void runRefresh("pvwatts", () => apiClient.refreshPvwatts(siteId)),
      })}
      {view.phase === "ready" && (
        <>
          <EditSitePanel site={view.site} open={editOpen} onClose={() => setEditOpen(false)} onSave={saveSite} />
          <GeocodeRefreshDialog
            site={view.site}
            open={geocodeConfirmOpen}
            onClose={() => setGeocodeConfirmOpen(false)}
            onConfirm={() => {
              setGeocodeConfirmOpen(false);
              if (siteId !== null) void runRefresh("geocode", () => apiClient.refreshGeocoding(siteId));
            }}
          />
        </>
      )}
    </div>
  );
}

interface ReadyActions {
  busy: BusyAction;
  feedback: Feedback;
  onEdit: () => void;
  onRefreshGeocoding: () => void;
  onRetrySolarResource: () => void;
  onRetryPvwatts: () => void;
}

function renderBody(view: View, siteId: number | null, retry: () => void, actions: ReadyActions) {
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
  const canRetryDownstream = site.geocode_status === "resolved" && site.latitude !== null && site.longitude !== null;
  return (
    <>
      <DetailHeader
        site={site}
        onEdit={actions.onEdit}
        disabled={actions.busy !== null}
      />
      <div className="detail-main">
        <div className="detail-stack">
          {actions.feedback && (
            <div className={`inline-feedback feedback-${actions.feedback.tone}`} role="status" aria-live="polite">
              {actions.feedback.message}
            </div>
          )}
          <DetailBanner site={site} />
          <LocationStrip site={site} />
          <ProcessingStages
            site={site}
            actions={{
              busy: actions.busy,
              canRetryDownstream,
              onRefreshGeocoding: actions.onRefreshGeocoding,
              onRetrySolarResource: actions.onRetrySolarResource,
              onRetryPvwatts: actions.onRetryPvwatts,
            }}
          />
          <PvwattsSection site={site} />
          <SolarSection site={site} />
          <AssumptionsSection site={site} />
          <DetailFooter />
        </div>
      </div>
    </>
  );
}
