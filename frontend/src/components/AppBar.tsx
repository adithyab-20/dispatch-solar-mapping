/** The app bar: wordmark plus the configured API origin (UI brief §3). */
export function AppBar({ apiOrigin }: { apiOrigin: string }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 52,
        padding: "0 20px",
        background: "var(--panel)",
        borderBottom: "1px solid var(--rule-strong)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="#006400" strokeWidth="1.6" />
          <g stroke="#006400" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2.4v3" />
            <path d="M12 18.6v3" />
            <path d="M2.4 12h3" />
            <path d="M18.6 12h3" />
            <path d="M5.2 5.2l2.1 2.1" />
            <path d="M16.7 16.7l2.1 2.1" />
            <path d="M18.8 5.2l-2.1 2.1" />
            <path d="M7.3 16.7l-2.1 2.1" />
          </g>
        </svg>
        <span className="wordmark" style={{ fontSize: 12.5 }}>
          Dispatch Energy
        </span>
        <span className="wordmark-2" style={{ fontSize: 12.5 }}>
          Solar
        </span>
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
        API {apiOrigin}
      </span>
    </header>
  );
}
