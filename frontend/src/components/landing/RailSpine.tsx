/**
 * The rail's closed state. The catalogue itself is clipped fully off-canvas;
 * this is the only control that remains over the map.
 */
export function RailSpine({
  onExpand,
}: {
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      className="btn rail-toggle-control rail-expand-control"
      aria-label="Show the site list"
      onClick={onExpand}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.5 3v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
