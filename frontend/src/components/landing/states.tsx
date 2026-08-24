import { type ApiErrorKind, ERROR_KIND_PHRASE } from "@/lib/api/client";

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: 24,
  textAlign: "center",
};

/** Loading: names what the map area is waiting for; static under reduced motion. */
export function LoadingState() {
  return (
    <div role="status" aria-live="polite" style={panelStyle}>
      <div className="lbl">Loading sites…</div>
      <p style={{ maxWidth: 320, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        Reading the active-site catalogue from the application API.
      </p>
    </div>
  );
}

/** Empty catalogue: sites arrive through the import command, not this page. */
export function EmptyState() {
  return (
    <div style={panelStyle}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>No sites yet</h2>
      <p style={{ maxWidth: 360, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        Sites are added by the import command, not from this page. From the
        repository root, run:
      </p>
      <code
        className="mono"
        style={{
          fontSize: 12,
          background: "var(--panel-2)",
          border: "1px solid var(--rule)",
          borderRadius: 3,
          padding: "6px 10px",
        }}
      >
        make import-upsert
      </code>
    </div>
  );
}

/**
 * Catalogue request failed: names the failing request without leaking keys,
 * query params, or raw exception text; states no data changed; offers a retry.
 */
export function ErrorState({
  kind,
  onRetry,
}: {
  kind: ApiErrorKind;
  onRetry: () => void;
}) {
  return (
    <div role="alert" style={panelStyle}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        Could not reach the application API
      </h2>
      <p className="mono" style={{ margin: 0, fontSize: 11.5, color: "var(--muted)" }}>
        GET /api/sites/ · {ERROR_KIND_PHRASE[kind]}
      </p>
      <p style={{ maxWidth: 360, margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
        No data changed. Make sure the backend is running, then try again.
      </p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
