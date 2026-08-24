import type { ChipKind, ChipMeta } from "@/lib/detail";

// Each chip carries its own glyph so status is never conveyed by colour alone
// (UI brief §2). The glyphs mirror the landing map's marker shapes.
function ChipGlyph({ kind }: { kind: ChipKind }) {
  switch (kind) {
    case "ok":
      return (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <circle cx="4" cy="4" r="3.4" fill="currentColor" />
        </svg>
      );
    case "fail":
      return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "run":
      return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <circle cx="4.5" cy="4.5" r="3.4" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.4" />
          <path d="M4.5 1.1a3.4 3.4 0 0 1 3.4 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "none":
      return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <circle cx="4.5" cy="4.5" r="3.4" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" fill="none" />
        </svg>
      );
    case "block":
      return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <rect x="1.4" y="1.4" width="6.2" height="6.2" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </svg>
      );
  }
}

const CHIP_CLASS: Record<ChipKind, string> = {
  ok: "c-ok",
  fail: "c-fail",
  run: "c-run",
  none: "c-mute",
  block: "c-mute",
};

/** A status chip: glyph + reader-facing word + tone. */
export function StatusChip({ meta }: { meta: ChipMeta }) {
  return (
    <span className={`chip ${CHIP_CLASS[meta.kind]}`}>
      <ChipGlyph kind={meta.kind} />
      {meta.word}
    </span>
  );
}
