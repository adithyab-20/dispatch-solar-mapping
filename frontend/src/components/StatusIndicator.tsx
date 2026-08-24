import type { GeocodeStatus } from "@/lib/api/types";
import { geocodeStatusMeta, type MarkerShape, type StatusTone } from "@/lib/sites";

const TONE_COLOR: Record<StatusTone, string> = {
  ok: "var(--ok)",
  muted: "var(--muted)",
  neutral: "var(--muted)",
  fail: "var(--fail)",
};

function ShapeGlyph({ shape, color }: { shape: MarkerShape; color: string }) {
  switch (shape) {
    case "disc":
      return <circle cx="7" cy="7" r="4.4" fill={color} />;
    case "arc":
      return (
        <>
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--rule-strong)" strokeWidth="1.5" />
          <path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        </>
      );
    case "dashed-ring":
      return (
        <circle
          cx="7"
          cy="7"
          r="4.4"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2.2 1.8"
        />
      );
    case "cross":
      return (
        <path
          d="M4 4l6 6M10 4l-6 6"
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      );
  }
}

/**
 * A geocoding status shown as shape + word + colour — never colour alone
 * (UI brief §2). The word is the reader-facing phrasing ("no match found").
 */
export function StatusIndicator({ status }: { status: GeocodeStatus }) {
  const meta = geocodeStatusMeta(status);
  const color = TONE_COLOR[meta.tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <ShapeGlyph shape={meta.shape} color={color} />
      </svg>
      {meta.word}
    </span>
  );
}
