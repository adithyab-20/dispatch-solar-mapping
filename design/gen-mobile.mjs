import { writeFileSync } from 'node:fs';
import { monthlyChart, monthTable, fmt } from './chartlib.mjs';

const AC = [11240,12510,15880,17420,18260,17690,16940,16780,15830,14510,11860,10350];
const ANNUAL = AC.reduce((a,b)=>a+b,0);

const phone = (label, note, inner) => `
  <div style="display:flex;flex-direction:column;gap:8px">
    <div class="lbl">${label}</div>
    <div style="width:390px;height:844px;background:var(--panel);border:1px solid var(--rule-strong);border-radius:14px;overflow:hidden;display:flex;flex-direction:column">${inner}</div>
    <div class="mono" style="width:390px;font-size:10.5px;color:var(--faint);line-height:1.5">${note}</div>
  </div>`;

const bar = `
  <header style="display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 16px;border-bottom:1px solid var(--rule-strong);flex-shrink:0">
    <span class="wordmark" style="font-size:11.5px">Dispatch</span>
    <span class="mono" style="font-size:10.5px;color:var(--muted)">7 sites</span>
  </header>`;

const row = (name, addr, chipHtml, right) => `
  <a href="#" style="display:flex;gap:10px;align-items:center;min-height:76px;padding:12px 16px;border-bottom:1px solid var(--rule);border-bottom-color:var(--rule);text-decoration:none;color:inherit;border-left:0">
    <div style="flex:1;min-width:0">
      <div style="font-size:14.5px;font-weight:600">${name}</div>
      <div class="mono" style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${addr}</div>
      <div style="margin-top:6px">${chipHtml}</div>
    </div>
    ${right}
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5L6 6.5l-4.5 5" stroke="#767676" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </a>`;

const OK = `<span class="chip c-ok"><svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.4" fill="#006400"></circle></svg>resolved</span>`;
const NONE = `<span class="chip c-mute"><svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="3.4" stroke="#58595B" stroke-width="1.4" stroke-dasharray="2 1.6" fill="none"></circle></svg>no match found</span>`;
const FAIL = `<span class="chip c-fail"><svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M2 2l5 5M7 2l-5 5" stroke="#B3261E" stroke-width="1.5" stroke-linecap="round"></path></svg>geocoding failed</span>`;

const spark = `<svg width="54" height="18" viewBox="0 0 54 18" aria-hidden="true">${
  [9,8,6,4,3,3,4,4,6,8,11,12].map((y,i)=>`<rect x="${i*4.5}" y="${y}" width="3" height="${18-y}" rx="1.2" fill="#C96A1C"></rect>`).join('')}</svg>`;

const landing = phone('Landing · 390 × 844',
  'Map collapses to a fixed 200px band with a count of what it can and cannot show; the catalog scrolls beneath it. Rows are 76px — comfortably past the 44px minimum — and the whole row is the target.',
  `${bar}
  <div style="height:200px;position:relative;background:#F1F1F1;flex-shrink:0;border-bottom:1px solid var(--rule-strong)">
    <svg viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Map of the United States with four resolved sites">
      <rect width="390" height="200" fill="#F1F1F1"></rect>
      <g stroke="#E2E2E2" stroke-width="1"><path d="M0 50H390M0 100H390M0 150H390M65 0V200M130 0V200M195 0V200M260 0V200M325 0V200"></path></g>
      <path d="M30,36 L205,28 L220,36 L238,48 L258,42 L276,62 L304,66 L330,76 L344,54 L336,88 L320,106 L312,122 L316,150 L302,172 L292,196 L280,178 L272,152 L252,156 L228,160 L208,166 L188,178 L168,188 L148,178 L128,172 L112,160 L88,160 L72,172 L52,178 L44,158 L36,132 L30,104 L24,72 Z" fill="#FAFAFA" stroke="#C2C2C2" stroke-width="1.4" stroke-linejoin="round"></path>
      <g><circle cx="62" cy="122" r="9" fill="#006400" opacity=".15"></circle><circle cx="62" cy="122" r="4.5" fill="#006400" stroke="#FFFFFF" stroke-width="1.8"></circle>
      <circle cx="114" cy="140" r="9" fill="#006400" opacity=".15"></circle><circle cx="114" cy="140" r="4.5" fill="#006400" stroke="#FFFFFF" stroke-width="1.8"></circle>
      <circle cx="140" cy="98" r="9" fill="#006400" opacity=".15"></circle><circle cx="140" cy="98" r="4.5" fill="#006400" stroke="#FFFFFF" stroke-width="1.8"></circle>
      <circle cx="204" cy="166" r="9" fill="#006400" opacity=".15"></circle><circle cx="204" cy="166" r="4.5" fill="#006400" stroke="#FFFFFF" stroke-width="1.8"></circle></g>
    </svg>
    <div class="mono" style="position:absolute;left:10px;bottom:8px;font-size:9.5px;color:var(--muted);background:rgba(255,253,248,.9);padding:2px 6px;border-radius:2px">© OpenStreetMap contributors</div>
    <div class="mono" style="position:absolute;right:10px;top:10px;font-size:10px;color:var(--ink-2);background:rgba(255,253,248,.92);padding:3px 7px;border-radius:2px">4 of 7 mapped</div>
  </div>
  <button style="display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:12px 16px;background:var(--panel);border:0;border-bottom:1px solid var(--rule);font-family:var(--sans);cursor:pointer;text-align:left">
    <span style="display:flex;align-items:center;gap:8px">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 4.5L7 9l4.5-4.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <span style="font-size:15px;font-weight:600">Sites with results</span><span class="num" style="font-size:13px;color:var(--muted)">4</span>
    </span>
    <span class="mono" style="font-size:10.5px;color:var(--faint)">tap to collapse</span>
  </button>
  <div style="flex:1;overflow:hidden">
    ${row('Desert Bloom Solar','3737 W Buckeye Rd, Phoenix, AZ', OK, `<div style="text-align:right"><div>${spark}</div><div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:2px">179,270</div></div>`)}
    ${row('Central Valley Array','2200 Weedpatch Hwy, Bakersfield, CA', OK, `<div style="text-align:right"><div>${spark}</div><div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:2px">176,940</div></div>`)}
    ${row('Front Range PV Yard','5050 Pearl Pkwy, Boulder, CO', OK, `<div style="text-align:right"><div>${spark}</div><div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:2px">161,880</div></div>`)}
  </div>
  <button style="display:flex;align-items:center;justify-content:space-between;width:100%;min-height:52px;padding:14px 16px;background:var(--panel-2);border:0;border-top:1px solid var(--rule-strong);font-family:var(--sans);cursor:pointer;text-align:left">
    <span style="display:flex;align-items:center;gap:8px">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l4.5 4.5L4 11.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <span style="font-size:13.5px;font-weight:600">Not on the map</span><span class="num" style="font-size:12px;color:var(--muted)">3</span>
    </span>
    <span class="mono" style="font-size:10px;color:var(--faint)">1 pending · 1 no match · 1 failed</span>
  </button>`);

const detail = phone('Detail, top · 390 × 844',
  'Identity, then the numbers. Processing stages fold into a single row that opens on tap — and opens itself when a stage has failed.',
  `${bar}
  <div style="padding:14px 16px;border-bottom:1px solid var(--rule)">
    <a href="#" style="font-size:12px;border:0;color:var(--muted)">← All sites</a>
    <h1 style="margin:8px 0 0;font-size:20px;font-weight:600">Desert Bloom Solar</h1>
    <div class="mono" style="font-size:11px;color:var(--muted);margin-top:4px">Site #1 · active</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" style="flex:1;min-height:44px;justify-content:center">Edit</button><button class="btn btn-d" style="flex:1;min-height:44px;justify-content:center">Refresh geocoding…</button></div>
  </div>
  <div style="padding:14px 16px;border-bottom:1px solid var(--rule)">
    <div class="lbl">Input address</div>
    <div style="font-size:13px;margin-top:4px">3737 W Buckeye Rd, Phoenix, AZ 85009</div>
    <div class="lbl" style="margin-top:12px">Resolved address</div>
    <div style="font-size:13px;margin-top:4px">3737 West Buckeye Road, Phoenix, Maricopa County, Arizona, 85009</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <span class="num" style="font-size:13px">33.43620, −112.12790</span>${OK}
    </div>
    <div class="mono" style="font-size:10px;color:var(--faint);margin-top:8px">Geocoding © OpenStreetMap / Nominatim</div>
  </div>
  <button style="display:flex;align-items:center;justify-content:space-between;width:100%;min-height:52px;padding:14px 16px;background:var(--panel);border:0;border-bottom:1px solid var(--rule);font-family:var(--sans);cursor:pointer;text-align:left">
    <span style="display:flex;align-items:center;gap:9px">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l4.5 4.5L4 11.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <span class="sec" style="color:var(--ink)">Processing stages</span>
      <span class="chip c-ok"><svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.4" fill="#006400"></circle></svg>all succeeded</span>
    </span>
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5L6 6.5l-4.5 5" stroke="#767676" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </button>
  <div style="padding:14px 16px;border-bottom:1px solid var(--rule)">
    <div class="sec" style="color:var(--pv-deepest)">PVWatts v8 estimate</div>
    <div style="margin-top:10px"><span class="num" style="font-size:30px;color:var(--pv-deep);letter-spacing:-.02em">179,270</span> <span class="unit" style="font-size:11px">kWh / year</span></div>
    <div style="display:flex;gap:20px;margin-top:12px">
      <div><div class="lbl">Capacity factor</div><div style="margin-top:3px"><span class="num" style="font-size:16px">20.5</span> <span class="unit">%</span></div></div>
      <div><div class="lbl">Annual radiation</div><div style="margin-top:3px"><span class="num" style="font-size:16px">6.05</span> <span class="unit">kWh/m²/day</span></div></div>
    </div>
  </div>
  <div style="padding:14px 16px">
    <div class="sec" style="margin-bottom:8px">Solar resource <span class="unit" style="font-size:10px;letter-spacing:0">annual avg</span></div>
    <div style="display:flex;gap:14px">
      <div><div class="lbl">GHI</div><div style="margin-top:2px"><span class="num" style="font-size:15px;color:#2C6B3A">5.65</span></div></div>
      <div><div class="lbl">DNI</div><div style="margin-top:2px"><span class="num" style="font-size:15px;color:#2C6B3A">6.58</span></div></div>
      <div><div class="lbl">Tilt</div><div style="margin-top:2px"><span class="num" style="font-size:15px;color:#2C6B3A">6.10</span></div></div>
      <div><div class="lbl">Unit</div><div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:4px">kWh/m²/day</div></div>
    </div>
  </div>`);

const chart = phone('Detail, results · 390 × 844',
  'The chart stays a first-class element at phone width, and the monthly table stays with it — scrolling sideways rather than being dropped.',
  `${bar}
  <div style="padding:14px 16px;border-bottom:1px solid var(--rule)">
    <div class="sec" style="color:var(--pv-deepest)">PVWatts v8 estimate</div>
    <div style="margin-top:10px"><span class="num" style="font-size:30px;color:var(--pv-deep);letter-spacing:-.02em">${fmt(ANNUAL)}</span> <span class="unit" style="font-size:11px">kWh / year</span></div>
    <div style="display:flex;gap:20px;margin-top:12px">
      <div><div class="lbl">Capacity factor</div><div style="margin-top:3px"><span class="num" style="font-size:16px">${(ANNUAL/876000*100).toFixed(1)}</span> <span class="unit">%</span></div></div>
      <div><div class="lbl">Annual radiation</div><div style="margin-top:3px"><span class="num" style="font-size:16px">6.05</span> <span class="unit">kWh/m²/day</span></div></div>
    </div>
  </div>
  <div style="padding:14px 16px;border-bottom:1px solid var(--rule)">
    <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">Monthly AC production <span class="unit" style="font-size:10.5px">kWh</span></div>
    ${monthlyChart(AC, { width: 358, height: 190, unit: 'kWh', hover: null })}
    <div class="mono" style="font-size:10px;color:var(--faint);margin-top:6px">Tap a column for its exact value.</div>
  </div>
  <div style="padding:14px 16px">
    <div style="display:flex;align-items:center;justify-content:space-between"><div class="sec">Monthly values</div><span class="mono" style="font-size:10px;color:var(--faint)">scrolls sideways →</span></div>
    <div style="overflow-x:auto;margin-top:10px">
      <div style="width:640px">${monthTable([{ label:'AC', unit:'kWh', values: AC, annual: ANNUAL, decimals:0 }])}</div>
    </div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--rule)">
      <div class="sec" style="margin-bottom:8px">Assumptions</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--rule);border:1px solid var(--rule)">
        ${[['System capacity','100 kW'],['Array type','Fixed, open rack'],['Tilt','33.4°'],['Azimuth','180°'],['Losses','14%'],['Dataset','NSRDB monthly']]
          .map(([k,v]) => `<div style="background:var(--panel);padding:7px 9px"><div class="lbl">${k}</div><div class="mono" style="font-size:11px;margin-top:2px">${v}</div></div>`).join('')}
      </div>
    </div>
  </div>`);

writeFileSync('parts/Mobile.body.html', `
<div style="width:1320px;min-height:1010px;background:var(--ground);padding:24px">
  <h1 style="margin:0 0 4px;font-size:20px;font-weight:600">Small screens</h1>
  <p style="margin:0 0 18px;font-size:12.5px;color:var(--muted);max-width:820px">The split view stacks: map band, then catalog. Density survives by dropping the least load-bearing column, never by shrinking type below 12px or hiding a status. No fake status bar or keyboard is drawn — the real ones render over the page.</p>
  <div style="display:flex;gap:26px">${landing}${detail}${chart}</div>
</div>`, 'utf8');
console.log('mobile written');
