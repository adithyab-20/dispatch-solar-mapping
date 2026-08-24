export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const fmt = (n, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Top-rounded bar anchored to the baseline (dataviz mark spec).
function bar(x, y, w, h, fill, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `<path d="M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z" fill="${fill}"></path>`;
}

/**
 * 12-month column chart. Selective direct labels (max + min only), recessive
 * grid, no legend (single series — the title names it).
 */
export function monthlyChart(values, {
  width = 1240, height = 208, fill = '#C96A1C', decimals = 0,
  unit = '', max = null, gridSteps = 3, labelExtremes = true, hover = null,
} = {}) {
  const padL = 54, padR = 12, padT = 18, padB = 26;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const top = max ?? Math.max(...values) * 1.12;
  const slot = plotW / 12, gap = 2, bw = slot - gap * 2;
  const y = (v) => padT + plotH - (v / top) * plotH;

  let out = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" style="display:block">`;
  for (let i = 0; i <= gridSteps; i++) {
    const v = (top / gridSteps) * i, gy = y(v);
    out += `<line x1="${padL}" x2="${width - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${i === 0 ? '#C2C2C2' : '#ECECEC'}" stroke-width="1"></line>`;
    out += `<text x="${padL - 8}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="#767676">${esc(fmt(v, decimals))}</text>`;
  }
  const hi = values.indexOf(Math.max(...values)), lo = values.indexOf(Math.min(...values));
  values.forEach((v, i) => {
    const x = padL + slot * i + gap, by = y(v);
    const isHover = hover === i;
    out += bar(x, by, bw, padT + plotH - by, isHover ? '#B9601B' : fill);
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="${i === hi || i === lo || isHover ? '#262223' : '#767676'}">${MONTHS[i]}</text>`;
    if (labelExtremes && (i === hi || i === lo)) {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(by - 7).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10.5" font-weight="500" fill="#262223">${esc(fmt(v, decimals))}</text>`;
    }
  });
  if (hover != null) {
    const x = padL + slot * hover + gap + bw / 2, by = y(values[hover]);
    const bx = Math.min(x - 62, width - padR - 128);
    out += `<g><rect x="${bx.toFixed(1)}" y="${(by - 60).toFixed(1)}" width="124" height="44" rx="3" fill="#101010"></rect>`;
    out += `<text x="${(bx + 10).toFixed(1)}" y="${(by - 43).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="0.08em" fill="#B8BCB8">${MONTHS[hover].toUpperCase()}</text>`;
    out += `<text x="${(bx + 10).toFixed(1)}" y="${(by - 27).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="12.5" font-weight="500" fill="#FAFAFA">${esc(fmt(values[hover], decimals))} ${esc(unit)}</text></g>`;
  }
  return out + '</svg>';
}

/** Small-multiple mini chart: shared y-scale across the set. */
export function miniChart(values, { max, fill = '#3E8E4F', width = 340, height = 92 } = {}) {
  const padT = 8, padB = 16, plotH = height - padT - padB;
  const slot = width / 12, gap = 1.5, bw = slot - gap * 2;
  let out = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" style="display:block">`;
  out += `<line x1="0" x2="${width}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="#C2C2C2" stroke-width="1"></line>`;
  values.forEach((v, i) => {
    const h = (v / max) * plotH, x = slot * i + gap;
    out += bar(x, padT + plotH - h, bw, h, fill, 3);
  });
  ['J','F','M','A','M','J','J','A','S','O','N','D'].forEach((m, i) => {
    out += `<text x="${(slot * i + slot / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="#767676">${m}</text>`;
  });
  return out + '</svg>';
}

/** Dense months-as-columns table: one row per metric. */
export function monthTable(rows, { decimals = 1 } = {}) {
  let out = `<table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-variant-numeric:tabular-nums">`;
  out += `<thead><tr><th style="text-align:left;padding:5px 8px 5px 0;font-weight:500;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#767676;border-bottom:1px solid #C2C2C2">Metric</th>`;
  MONTHS.forEach((m) => { out += `<th style="text-align:right;padding:5px 6px;font-weight:500;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#767676;border-bottom:1px solid #C2C2C2">${m}</th>`; });
  out += `<th style="text-align:right;padding:5px 0 5px 10px;font-weight:600;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#262223;border-bottom:1px solid #C2C2C2">Annual</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    out += `<tr><td style="padding:5px 8px 5px 0;color:#262223;border-bottom:1px solid #ECECEC;white-space:nowrap">${esc(r.label)} <span style="color:#767676">${esc(r.unit)}</span></td>`;
    r.values.forEach((v) => { out += `<td style="text-align:right;padding:5px 6px;color:#101010;border-bottom:1px solid #ECECEC">${esc(fmt(v, r.decimals ?? decimals))}</td>`; });
    out += `<td style="text-align:right;padding:5px 0 5px 10px;color:#101010;font-weight:600;border-bottom:1px solid #ECECEC">${esc(fmt(r.annual, r.annualDecimals ?? r.decimals ?? decimals))}</td></tr>`;
  });
  return out + '</tbody></table>';
}
