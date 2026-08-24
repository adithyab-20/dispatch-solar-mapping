import { barPath } from "@/components/detail/bar";

const WIDTH = 340;
const HEIGHT = 92;
const PAD_T = 8;
const PAD_B = 16;
const PLOT_H = HEIGHT - PAD_T - PAD_B;
const SLOT = WIDTH / 12;
const GAP = 1.5;
const BAR_W = SLOT - GAP * 2;

const INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * A small-multiple irradiance chart in the lighter green. Every mini chart in a
 * set is passed the same `max`, so the three share one scale and their heights
 * compare honestly (UI brief §5).
 */
export function MiniChart({
  values,
  max,
  ariaLabel,
}: {
  values: number[];
  max: number;
  ariaLabel: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block" }}
    >
      <line x1="0" x2={WIDTH} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} stroke="#C2C2C2" strokeWidth="1" />
      {values.map((v, i) => {
        const h = (v / max) * PLOT_H;
        const x = SLOT * i + GAP;
        return <path key={`b-${i}`} d={barPath(x, PAD_T + PLOT_H - h, BAR_W, h, 3)} fill="var(--teal)" />;
      })}
      {INITIALS.map((m, i) => (
        <text
          key={`m-${i}`}
          x={SLOT * i + SLOT / 2}
          y={HEIGHT - 3}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="8.5"
          fill="#767676"
        >
          {m}
        </text>
      ))}
    </svg>
  );
}
