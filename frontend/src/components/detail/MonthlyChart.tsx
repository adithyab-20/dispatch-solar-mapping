"use client";

import { useState } from "react";

import { barPath } from "@/components/detail/bar";
import { fmt } from "@/lib/format";

const WIDTH = 1240;
const HEIGHT = 208;
const PAD_L = 54;
const PAD_R = 12;
const PAD_T = 18;
const PAD_B = 26;
const PLOT_W = WIDTH - PAD_L - PAD_R;
const PLOT_H = HEIGHT - PAD_T - PAD_B;
const GRID_STEPS = 3;
const SLOT = PLOT_W / 12;
const GAP = 2;
const BAR_W = SLOT - GAP * 2;

interface MonthlyChartProps {
  /** Twelve ordered values; height carries magnitude, colour never varies. */
  values: number[];
  /** Twelve display month labels, aligned to `values`. */
  months: string[];
  /** Shown in the tooltip and announced; the heading names it too. */
  unit: string;
  decimals?: number;
  /** Accessible summary of the whole series for the SVG `img` role. */
  ariaLabel: string;
}

/**
 * The monthly AC production column chart (UI brief §5). One measure, one series
 * in solar orange; a recessive grid, no legend, no truncated axis. Hover or
 * arrow-key focus moves a single tooltip and darkens the active column, and the
 * value is announced to a polite live region. The backing table on the same
 * page means the chart is never the only way to read a value.
 */
export function MonthlyChart({
  values,
  months,
  unit,
  decimals = 0,
  ariaLabel,
}: MonthlyChartProps) {
  const [active, setActive] = useState<number | null>(null);

  const top = Math.max(...values) * 1.12;
  const y = (v: number) => PAD_T + PLOT_H - (v / top) * PLOT_H;
  const hi = values.indexOf(Math.max(...values));
  const lo = values.indexOf(Math.min(...values));

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = active === null ? 0 : Math.min(11, Math.max(0, active + step));
      setActive(next);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const announcement =
    active === null ? "" : `${months[active]}: ${fmt(values[active], decimals)} ${unit}`;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
        style={{ display: "block", outlineOffset: 2 }}
      >
        {Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
          const v = (top / GRID_STEPS) * i;
          const gy = y(v);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={PAD_L}
                x2={WIDTH - PAD_R}
                y1={gy}
                y2={gy}
                stroke={i === 0 ? "var(--rule-strong)" : "var(--grid)"}
                strokeWidth="1"
              />
              <text
                x={PAD_L - 8}
                y={gy + 3.5}
                textAnchor="end"
                fontFamily="var(--mono)"
                fontSize="10"
                fill="#767676"
              >
                {fmt(v, decimals)}
              </text>
            </g>
          );
        })}

        {values.map((v, i) => {
          const x = PAD_L + SLOT * i + GAP;
          const by = y(v);
          const isActive = active === i;
          const labelled = i === hi || i === lo || isActive;
          return (
            <g key={`bar-${i}`}>
              <path d={barPath(x, by, BAR_W, PAD_T + PLOT_H - by)} fill={isActive ? "var(--pv-deep)" : "var(--pv)"} />
              <text
                x={x + BAR_W / 2}
                y={HEIGHT - 9}
                textAnchor="middle"
                fontFamily="var(--mono)"
                fontSize="10"
                fill={labelled ? "#262223" : "#767676"}
              >
                {months[i]}
              </text>
              {(i === hi || i === lo) && (
                <text
                  x={x + BAR_W / 2}
                  y={by - 7}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="10.5"
                  fontWeight="500"
                  fill="#262223"
                >
                  {fmt(v, decimals)}
                </text>
              )}
              {/* Full-height hit target so hovering anywhere in the column works. */}
              <rect
                x={PAD_L + SLOT * i}
                y={PAD_T}
                width={SLOT}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
            </g>
          );
        })}

        {active !== null &&
          (() => {
            const by = y(values[active]);
            const cx = PAD_L + SLOT * active + GAP + BAR_W / 2;
            const bx = Math.min(cx - 62, WIDTH - PAD_R - 128);
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={bx} y={by - 60} width="124" height="44" rx="3" fill="#101010" />
                <text
                  x={bx + 10}
                  y={by - 43}
                  fontFamily="var(--mono)"
                  fontSize="9.5"
                  letterSpacing="0.08em"
                  fill="#B8BCB8"
                >
                  {months[active].toUpperCase()}
                </text>
                <text
                  x={bx + 10}
                  y={by - 27}
                  fontFamily="var(--mono)"
                  fontSize="12.5"
                  fontWeight="500"
                  fill="#FAFAFA"
                >
                  {fmt(values[active], decimals)} {unit}
                </text>
              </g>
            );
          })()}
      </svg>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </figure>
  );
}
