/**
 * A top-rounded bar path anchored to the baseline (the dataviz mark spec used
 * across every chart on the page). Shared so the column chart and the small
 * multiples draw identical bar geometry.
 */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z`;
}
