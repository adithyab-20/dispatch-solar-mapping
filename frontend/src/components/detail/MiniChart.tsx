"use client";

import { useState } from "react";

import { barPath } from "@/components/detail/bar";
import { monthLabel, MONTH_ORDER } from "@/lib/detail";
import { fmt } from "@/lib/format";

const WIDTH = 340;
const HEIGHT = 92;
const PAD_T = 8;
const PAD_B = 16;
const PLOT_H = HEIGHT - PAD_T - PAD_B;
const SLOT = WIDTH / 12;
const GAP = 1.5;
const BAR_W = SLOT - GAP * 2;

const INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTHS = MONTH_ORDER.map(monthLabel);

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
  const [active, setActive] = useState<number | null>(null);
  const baseline = PAD_T + PLOT_H;

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) =>
        current === null ? 0 : Math.min(values.length - 1, Math.max(0, current + step)),
      );
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const announcement =
    active === null ? "" : `${MONTHS[active]}: ${fmt(values[active], 2)} kWh/m²/day`;

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
        <line x1="0" x2={WIDTH} y1={baseline} y2={baseline} stroke="#C2C2C2" strokeWidth="1" />
        {values.map((value, index) => {
          const height = (value / max) * PLOT_H;
          const x = SLOT * index + GAP;
          const top = baseline - height;
          return (
            <g key={`bar-${index}`}>
              <path
                data-bar-index={index}
                d={barPath(x, top, BAR_W, height, 3)}
                fill={active === index ? "var(--teal-deep)" : "var(--teal)"}
              />
              <rect
                data-month-index={index}
                x={SLOT * index}
                y={PAD_T}
                width={SLOT}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => setActive(index)}
              />
            </g>
          );
        })}
        {INITIALS.map((month, index) => (
          <text
            key={`month-${index}`}
            x={SLOT * index + SLOT / 2}
            y={HEIGHT - 3}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize="8.5"
            fill={active === index ? "#262223" : "#767676"}
          >
            {month}
          </text>
        ))}
        {active !== null && (() => {
          const height = (values[active] / max) * PLOT_H;
          const center = SLOT * active + SLOT / 2;
          const boxX = Math.min(Math.max(center - 57, 2), WIDTH - 116);
          const boxY = Math.max(2, baseline - height - 46);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={boxX} y={boxY} width="114" height="40" rx="3" fill="#101010" />
              <text x={boxX + 9} y={boxY + 15} fontFamily="var(--mono)" fontSize="9" letterSpacing="0.08em" fill="#B8BCB8">
                {MONTHS[active].toUpperCase()}
              </text>
              <text x={boxX + 9} y={boxY + 30} fontFamily="var(--mono)" fontSize="11" fontWeight="500" fill="#FAFAFA">
                {fmt(values[active], 2)} kWh/m²/day
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
