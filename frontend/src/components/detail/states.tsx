import { TransitionLink } from "@/components/TransitionLink";
import { type ApiErrorKind, ERROR_KIND_PHRASE } from "@/lib/api/client";

const centre: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: 24,
  textAlign: "center",
};

/** The always-available way back to the catalogue — kept in every state. */
export function BackLink() {
  return (
    <TransitionLink href="/" direction="back" style={{ fontSize: 12, color: "var(--muted)" }}>
      ← All sites
    </TransitionLink>
  );
}

/** Loading: names what the page is waiting for; static under reduced motion. */
export function DetailLoading() {
  return (
    <div role="status" aria-live="polite" style={centre}>
      <div className="lbl">Loading site…</div>
      <p style={{ maxWidth: 340, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        Reading the stored site record from the application API.
      </p>
      <BackLink />
    </div>
  );
}

/**
 * API failure: names the failing request without leaking keys, query params, or
 * raw exception text; states no data changed; keeps a retry and a way back.
 */
export function DetailError({
  siteId,
  kind,
  onRetry,
}: {
  siteId: number;
  kind: ApiErrorKind;
  onRetry: () => void;
}) {
  return (
    <div role="alert" style={centre}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        Could not reach the application API
      </h2>
      <p className="mono" style={{ margin: 0, fontSize: 11.5, color: "var(--muted)" }}>
        GET /api/sites/{siteId}/ · {ERROR_KIND_PHRASE[kind]}
      </p>
      <p style={{ maxWidth: 360, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        No data changed. Make sure the backend is running, then try again.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
        <TransitionLink href="/" direction="back" className="btn">
          Back to all sites
        </TransitionLink>
      </div>
    </div>
  );
}

/**
 * One response for unknown and deactivated IDs alike — it never reveals that an
 * inactive record exists (UI brief §6).
 */
export function DetailNotFound() {
  return (
    <div role="alert" style={centre}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Site not found</h2>
      <p style={{ maxWidth: 360, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        No active site has this ID. It may never have existed, or it may no longer
        be active.
      </p>
      <TransitionLink href="/" direction="back" className="btn">
        Back to all sites
      </TransitionLink>
    </div>
  );
}
