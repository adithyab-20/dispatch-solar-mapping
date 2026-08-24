import { writeFileSync } from 'node:fs';
import { monthlyChart, miniChart, monthTable, fmt } from './chartlib.mjs';

// ── Sample site data (realistic values; not provider output) ───────────────
const AC = [11240, 12510, 15880, 17420, 18260, 17690, 16940, 16780, 15830, 14510, 11860, 10350];
const RAD = [4.02, 4.86, 6.13, 7.28, 7.94, 8.02, 7.21, 6.87, 6.55, 5.63, 4.42, 3.72];
const GHI = [3.42, 4.34, 5.62, 6.85, 7.62, 7.94, 7.12, 6.68, 6.12, 5.02, 3.86, 3.18];
const DNI = [5.21, 5.86, 6.42, 7.35, 7.96, 8.42, 7.05, 6.72, 6.98, 6.44, 5.62, 4.98];
const TIL = [5.02, 5.62, 6.24, 6.68, 6.82, 6.75, 6.32, 6.44, 6.72, 6.40, 5.44, 4.78];
const ANNUAL_AC = AC.reduce((a, b) => a + b, 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ── Shared fragments ──────────────────────────────────────────────────────
const appbar = `
  <header style="display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 20px;background:var(--panel);border-bottom:1px solid var(--rule-strong);flex-shrink:0">
    <div style="display:flex;align-items:center;gap:10px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" stroke="#006400" stroke-width="1.6"></circle>
        <g stroke="#006400" stroke-width="1.6" stroke-linecap="round"><path d="M12 2.4v3"></path><path d="M12 18.6v3"></path><path d="M2.4 12h3"></path><path d="M18.6 12h3"></path><path d="M5.2 5.2l2.1 2.1"></path><path d="M16.7 16.7l2.1 2.1"></path><path d="M18.8 5.2l-2.1 2.1"></path><path d="M7.3 16.7l-2.1 2.1"></path></g>
      </svg>
      <span class="wordmark" style="font-size:12.5px">Dispatch</span>
      <span class="wordmark-2" style="font-size:12.5px">Solar Mapping</span>
    </div>
    <span class="mono" style="font-size:11px;color:var(--muted)">API 127.0.0.1:8000</span>
  </header>`;

const ICON = {
  ok: `<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.4" fill="#006400"></circle></svg>`,
  fail: `<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M2 2l5 5M7 2l-5 5" stroke="#B3261E" stroke-width="1.5" stroke-linecap="round"></path></svg>`,
  none: `<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="3.4" stroke="#58595B" stroke-width="1.4" stroke-dasharray="2 1.6" fill="none"></circle></svg>`,
  run: `<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="3.4" stroke="#006400" stroke-width="1.4" fill="none"></circle><path d="M4.5 1.1a3.4 3.4 0 0 1 3.4 3.4" stroke="#006400" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>`,
  block: `<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><rect x="1.4" y="1.4" width="6.2" height="6.2" rx="1" stroke="#58595B" stroke-width="1.3" fill="none"></rect></svg>`,
};
const chip = (kind, text) => {
  const cls = { ok: 'c-ok', fail: 'c-fail', none: 'c-mute', run: 'c-run', block: 'c-mute' }[kind];
  return `<span class="chip ${cls}">${ICON[kind]}${text}</span>`;
};

const pageHead = (title, sub, actions) => `
  <div style="padding:18px 24px 16px;background:var(--panel);border-bottom:1px solid var(--rule)">
    <a href="#" style="font-size:12px;border:0;color:var(--muted)">← All sites</a>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:8px">
      <div>
        <h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:-.01em">${title}</h1>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
          <span class="mono" style="font-size:11px;color:var(--muted)">${sub}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px">${actions}</div>
    </div>
  </div>`;

const sectionTitle = (t, note = '') => `
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 0 10px">
    <h2 class="sec" style="margin:0">${t}</h2>
    ${note ? `<span class="mono" style="font-size:10.5px;color:var(--faint)">${note}</span>` : ''}
  </div>`;

const stat = (label, value, unit, tone = 'ink') => `
  <div style="flex:1;padding:0 18px;border-left:1px solid var(--rule)">
    <div class="lbl">${label}</div>
    <div style="margin-top:5px"><span class="num" style="font-size:26px;letter-spacing:-.01em;color:${tone === 'solar' ? 'var(--solar-deep)' : 'var(--ink)'}">${value}</span> <span class="unit" style="font-size:11px">${unit}</span></div>
  </div>`;

const stageCard = (name, kind, status, ts, body, action) => `
  <div class="panel" style="flex:1;padding:13px 15px;border-radius:2px;display:flex;flex-direction:column;gap:9px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600">${name}</span>
      ${chip(kind, status)}
    </div>
    <div class="mono" style="font-size:10.5px;color:var(--faint)">${ts}</div>
    ${body}
    <div style="margin-top:auto">${action}</div>
  </div>`;


// Collapsed by default: the pipeline is diagnostics, not the point of the page.
const stageStrip = (state) => {
  const map = {
    ok: ['ok', 'All three stages succeeded', 'Last run 23 Aug 2026, 19:04', ''],
  };
  const [kind, text, ts] = map[state];
  return `
  <button style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:11px 15px;cursor:pointer;text-align:left;font-family:var(--sans)">
    <span style="display:flex;align-items:center;gap:11px">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l4.5 4.5L4 11.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <span class="sec" style="color:var(--ink)">Processing stages</span>
      ${chip(kind, text)}
    </span>
    <span style="display:flex;align-items:center;gap:14px">
      <span class="mono" style="font-size:10.5px;color:var(--faint)">${ts}</span>
      <span style="font-size:11.5px;color:var(--muted)">Show details, errors and retries</span>
    </span>
  </button>`;
};


const stageOpen = (summary) => `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--panel-2);border:1px solid var(--rule-strong);border-bottom:0;border-radius:2px 3px 0 0;padding:11px 15px">
    <span style="display:flex;align-items:center;gap:11px">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 4.5L7 9l4.5-4.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <span class="sec" style="color:var(--ink)">Processing stages</span>
      <span style="font-size:11.5px;color:var(--muted)">${summary}</span>
    </span>
    <span style="font-size:11.5px;color:var(--muted)">Hide</span>
  </div>`;

const safeError = (text) => `
  <div style="background:var(--fail-wash);border-left:2px solid var(--fail);padding:8px 10px;border-radius:2px">
    <div class="lbl" style="color:var(--fail)">Stage error</div>
    <div style="font-size:11.5px;color:#8C2019;margin-top:3px">${text}</div>
  </div>`;

const ASSUMPTIONS = [
  ['Endpoint', 'developer.nrel.gov/api/pvwatts'], ['Version', 'v8'],
  ['System capacity', '100 kW'], ['Module type', 'Standard'],
  ['Array type', 'Fixed, open rack'], ['Azimuth', '180°'],
  ['Tilt', '33.4° (site latitude, 1 dp)'], ['System losses', '14%'],
  ['Dataset', 'NSRDB, monthly'], ['DC/AC ratio', '1.2'],
  ['Ground coverage ratio', '0.4'], ['Inverter efficiency', '96%'],
  ['Search radius', '100 miles'],
];
const assumptionsPanel = `
  <div class="panel" style="border-radius:2px;padding:14px 16px">
    ${sectionTitle('Reproducibility — persisted PVWatts assumptions', 'stored with the result · non-secret only')}
    <div style="display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:1px;background:var(--rule)">
      ${ASSUMPTIONS.map(([k, v]) => `<div style="background:var(--panel);padding:8px 10px"><div class="lbl">${k}</div><div class="mono" style="font-size:11.5px;margin-top:2px">${v}</div></div>`).join('')}
      <div style="background:var(--panel-2);padding:8px 10px"><div class="lbl">Note</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Solar Resource is not an input to PVWatts.</div></div>
      <div style="background:var(--panel-2);padding:8px 10px"><div class="lbl">Note</div><div style="font-size:11px;color:var(--muted);margin-top:2px">API key, URLs and query parameters are never stored or shown.</div></div>
      <div style="background:var(--panel-2);padding:8px 10px"><div class="lbl">Note</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Values are model estimates, not metered production.</div></div>
    </div>
  </div>`;

const footer = `
  <footer style="display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-top:1px solid var(--rule);margin-top:2px">
    <span class="mono" style="font-size:10.5px;color:var(--muted)">Geocoding © OpenStreetMap contributors / <a href="#">Nominatim</a> · Map tiles © OpenStreetMap contributors</span>
    <span class="mono" style="font-size:10.5px;color:var(--faint)">Solar data: NREL Solar Resource v1 &amp; PVWatts v8 · viewing this page makes no provider requests</span>
  </footer>`;

const page = (inner, h) =>
  `<div style="width:1440px;min-height:${h}px;display:flex;flex-direction:column;background:var(--ground)">${appbar}${inner}${footer}</div>`;

const locationPanel = (resolved, coords, kind, status, ts) => `
  <div class="panel" style="border-radius:2px;display:grid;grid-template-columns:1fr 1.4fr 1fr">
    <div style="padding:14px 16px">
      <div class="lbl">Input address (as imported)</div>
      <div style="font-size:13px;margin-top:5px">3737 W Buckeye Rd, Phoenix, AZ 85009</div>
      <div class="mono" style="font-size:10.5px;color:var(--faint);margin-top:6px">stored verbatim · used as the geocoding query</div>
    </div>
    <div style="padding:14px 16px;border-left:1px solid var(--rule)">
      <div class="lbl">Resolved address</div>
      <div style="font-size:13px;margin-top:5px;color:${resolved ? 'var(--ink)' : 'var(--faint)'}">${resolved || '— not resolved —'}</div>
      <div class="mono" style="font-size:10.5px;color:var(--faint);margin-top:6px">Geocoding © OpenStreetMap / Nominatim · first result, US only</div>
    </div>
    <div style="padding:14px 16px;border-left:1px solid var(--rule)">
      <div class="lbl">Coordinates</div>
      <div class="num" style="font-size:14px;margin-top:5px;color:${coords ? 'var(--ink)' : 'var(--faint)'}">${coords || '— · —'}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">${chip(kind, status)}<span class="mono" style="font-size:10px;color:var(--faint)">${ts}</span></div>
    </div>
  </div>`;

const pvwattsSection = (hoverIdx = 5) => `
  <div class="panel" style="border-radius:2px;padding:16px 18px">
    ${sectionTitle('PVWatts v8 estimate', 'standardised 100 kW scenario · as of 23 Aug 2026, 19:04')}
    <div style="display:flex;margin:2px 0 18px;padding:2px 0">
      <div style="flex:1;padding-right:18px">
        <div class="lbl">Annual AC production</div>
        <div style="margin-top:5px"><span class="num" style="font-size:34px;letter-spacing:-.02em;color:var(--solar-deep)">${fmt(ANNUAL_AC)}</span> <span class="unit" style="font-size:12px">kWh / year</span></div>
      </div>
      ${stat('Capacity factor', (ANNUAL_AC / (100 * 8760) * 100).toFixed(1), '%')}
      ${stat('Annual solar radiation', mean(RAD).toFixed(2), 'kWh / m² / day')}
      ${stat('Best month', 'May', `${fmt(Math.max(...AC))} kWh`)}
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px">
      <div style="font-size:12.5px;font-weight:600">Monthly AC production <span class="unit" style="font-size:11px">kWh</span></div>
      <span class="mono" style="font-size:10px;color:var(--faint)">hover a column for the exact value · Nov–Feb shortfall is seasonal, not a fault</span>
    </div>
    ${monthlyChart(AC, { unit: 'kWh', hover: hoverIdx })}
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--rule)">
      ${monthTable([
        { label: 'AC production', unit: 'kWh', values: AC, annual: ANNUAL_AC, decimals: 0 },
        { label: 'Solar radiation', unit: 'kWh/m²/day', values: RAD, annual: mean(RAD), decimals: 2 },
      ])}
    </div>
  </div>`;

const solarSection = `
  <div class="panel" style="border-radius:2px;padding:16px 18px">
    ${sectionTitle('Solar resource', 'NREL Solar Resource v1 · as of 23 Aug 2026, 19:04')}
    <div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:18px">
      ${[['Global horizontal irradiance', 'GHI', GHI, '#3E8E4F'],
         ['Direct normal irradiance', 'DNI', DNI, '#3E8E4F'],
         ['Latitude-tilt irradiance', 'TILT', TIL, '#3E8E4F']]
        .map(([label, , vals]) => `
        <div>
          <div class="lbl">${label}</div>
          <div style="margin-top:4px;margin-bottom:8px"><span class="num" style="font-size:22px;color:#2C6B3A">${mean(vals).toFixed(2)}</span> <span class="unit">kWh / m² / day, annual avg</span></div>
          ${miniChart(vals, { max: 8.6 })}
        </div>`).join('')}
    </div>
    <div class="mono" style="font-size:10px;color:var(--faint);margin-top:8px">Three small multiples share one 0–8.6 scale, so their heights are directly comparable.</div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--rule)">
      ${monthTable([
        { label: 'GHI', unit: 'kWh/m²/day', values: GHI, annual: mean(GHI), decimals: 2 },
        { label: 'DNI', unit: 'kWh/m²/day', values: DNI, annual: mean(DNI), decimals: 2 },
        { label: 'Latitude tilt', unit: 'kWh/m²/day', values: TIL, annual: mean(TIL), decimals: 2 },
      ])}
    </div>
  </div>`;

const blockedPanel = (title, why) => `
  <div style="border:1px dashed var(--rule-strong);border-radius:2px;padding:20px 18px;background:var(--sunk)">
    ${sectionTitle(title)}
    <div style="display:flex;align-items:flex-start;gap:10px;max-width:640px">
      ${ICON.block}
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--muted)">Blocked — no data was requested</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${why}</div>
      </div>
    </div>
  </div>`;

const actionsFull = `
  <button class="btn">Edit name or address</button>
  <button class="btn btn-d">Refresh geocoding…</button>`;

// ── 1. Detail — everything succeeded ──────────────────────────────────────
writeFileSync('parts/Detail.body.html', page(`
  ${pageHead('Desert Bloom Solar', 'Site #1 · active', actionsFull)}
  <div style="display:flex;flex-direction:column;gap:14px;padding:16px 24px 8px">
    ${locationPanel('3737 West Buckeye Road, Phoenix, Maricopa County, Arizona, 85009, United States', '33.43620, −112.12790', 'ok', 'resolved', 'attempted 19:04')}
    ${stageStrip('ok')}
    ${pvwattsSection(5)}
    ${solarSection}
    ${assumptionsPanel}
  </div>`, 1900), 'utf8');

// ── 2. Detail — partial success (Solar Resource failed, PVWatts fine) ─────
writeFileSync('parts/DetailPartial.body.html', page(`
  ${pageHead('Hill Country Solar Farm', 'Site #4 · active', actionsFull)}
  <div style="display:flex;flex-direction:column;gap:14px;padding:16px 24px 8px">
    <div style="display:flex;align-items:flex-start;gap:10px;background:var(--warn-wash);border:1px solid #EAD9B4;border-left:3px solid var(--warn);border-radius:2px;padding:11px 14px">
      <svg width="15" height="15" viewBox="0 0 16 16" style="margin-top:1px" aria-hidden="true"><path d="M8 1.6l6.2 11.2H1.8z" fill="none" stroke="#8A6100" stroke-width="1.4" stroke-linejoin="round"></path><path d="M8 6v3.4" stroke="#8A6100" stroke-width="1.5" stroke-linecap="round"></path><circle cx="8" cy="11.6" r=".85" fill="#8A6100"></circle></svg>
      <div>
        <div style="font-size:12.5px;font-weight:600;color:#6E4E00">Partial result — one of three stages failed</div>
        <div style="font-size:12px;color:#6E4E00;margin-top:2px">The PVWatts estimate below is complete and valid. Solar Resource failed independently and can be retried on its own; nothing else is affected.</div>
      </div>
    </div>
    ${locationPanel('4500 East Ben White Boulevard, Austin, Travis County, Texas, 78741, United States', '30.22190, −97.71800', 'ok', 'resolved', 'attempted 19:07')}
    <div>
      ${stageOpen('opened automatically — one stage failed')}
      <div style="display:flex;gap:12px;align-items:stretch;border:1px solid var(--rule-strong);border-top:0;border-radius:0 0 2px 2px;padding:12px;background:var(--sunk)">
        ${stageCard('Geocoding', 'ok', 'resolved', 'Last attempted 23 Aug 2026, 19:07',
          `<div style="font-size:11.5px;color:var(--muted)">Coordinates are present, so both downstream stages are retryable.</div>`,
          `<button class="btn btn-d" style="font-size:11.5px;padding:5px 10px">Refresh geocoding…</button>`)}
        ${stageCard('Solar resource', 'fail', 'failed', 'Last attempted 23 Aug 2026, 19:07',
          safeError('The solar resource service did not respond in time. No values were stored.'),
          `<button class="btn" style="font-size:11.5px;padding:5px 10px"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6a4 4 0 1 1-1.3-3" fill="none" stroke="#101010" stroke-width="1.4" stroke-linecap="round"></path><path d="M10.4 1.6v3h-3" fill="none" stroke="#101010" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>Retry solar resource</button>`)}
        ${stageCard('PVWatts', 'ok', 'succeeded', 'Last attempted 23 Aug 2026, 19:07',
          `<div style="font-size:11.5px;color:var(--muted)">Unaffected — PVWatts consumes coordinates directly, not the solar resource result.</div>`,
          `<button class="btn is-busy" style="font-size:11.5px;padding:5px 10px"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" stroke="#767676" stroke-width="1.4" fill="none"></circle><path d="M6 1.6A4.4 4.4 0 0 1 10.4 6" stroke="#767676" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>Retrying…</button>`)}
      </div>
    </div>
    ${pvwattsSection(4)}
    <div class="panel" style="border-radius:2px;padding:16px 18px;border-left:3px solid var(--fail)">
      ${sectionTitle('Solar resource', 'last attempted 23 Aug 2026, 19:07')}
      <div style="display:flex;gap:14px;align-items:flex-start;max-width:760px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px">${chip('fail', 'failed')}<span style="font-size:13px;font-weight:600">No values are stored for this stage</span></div>
          <p style="margin:8px 0 0;font-size:12.5px;color:var(--muted)">The solar resource service did not respond in time. Earlier values, if any, were cleared before the attempt — nothing stale is shown here, and no placeholder zeros are substituted.</p>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn">Retry solar resource</button>
            <button class="btn" style="border-color:var(--rule)">View raw response fields</button>
          </div>
        </div>
        <div style="width:300px;border-left:1px solid var(--rule);padding-left:14px">
          <div class="lbl">What is unaffected</div>
          <div style="font-size:12px;color:var(--muted);margin-top:5px">Geocoding, coordinates and the full PVWatts estimate remain exactly as they were. Retrying this stage touches nothing else.</div>
        </div>
      </div>
    </div>
    ${assumptionsPanel}
  </div>`, 1900), 'utf8');

// ── 3. Detail — unresolved geocoding, downstream blocked ──────────────────
writeFileSync('parts/DetailUnresolved.body.html', page(`
  ${pageHead('Mesa Ridge Solar', 'Site #6 · active', actionsFull)}
  <div style="display:flex;flex-direction:column;gap:14px;padding:16px 24px 8px">
    <div style="display:flex;align-items:flex-start;gap:10px;background:var(--panel-2);border:1px solid var(--rule-strong);border-left:3px solid var(--muted);border-radius:2px;padding:11px 14px">
      ${ICON.none}
      <div>
        <div style="font-size:12.5px;font-weight:600">No location match — this site is not on the map</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">Nominatim returned no United States result for this address. Both solar stages are blocked because they need coordinates. Correct the address, or retry the lookup as it stands.</div>
      </div>
    </div>
    <div class="panel" style="border-radius:2px;display:grid;grid-template-columns:1fr 1.4fr 1fr">
      <div style="padding:14px 16px">
        <div class="lbl">Input address (as imported)</div>
        <div style="font-size:13px;margin-top:5px">14 Unnamed Rd, Mesa County, CO</div>
        <div class="mono" style="font-size:10.5px;color:var(--faint);margin-top:6px">stored verbatim · used as the geocoding query</div>
      </div>
      <div style="padding:14px 16px;border-left:1px solid var(--rule)">
        <div class="lbl">Resolved address</div>
        <div style="font-size:13px;margin-top:5px;color:var(--faint)">— no match —</div>
        <div class="mono" style="font-size:10.5px;color:var(--faint);margin-top:6px">Geocoding © OpenStreetMap / Nominatim</div>
      </div>
      <div style="padding:14px 16px;border-left:1px solid var(--rule)">
        <div class="lbl">Coordinates</div>
        <div class="num" style="font-size:14px;margin-top:5px;color:var(--faint)">— · —</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">${chip('none', 'unresolved')}<span class="mono" style="font-size:10px;color:var(--faint)">attempted 19:02</span></div>
      </div>
    </div>
    <div>
      ${stageOpen('opened automatically — the address did not resolve')}
      <div style="display:flex;gap:12px;align-items:stretch;border:1px solid var(--rule-strong);border-top:0;border-radius:0 0 2px 2px;padding:12px;background:var(--sunk)">
        ${stageCard('Geocoding', 'none', 'unresolved', 'Last attempted 23 Aug 2026, 19:02',
          `<div style="font-size:11.5px;color:var(--muted)">The address was accepted but matched no United States location. This is an outcome, not an error.</div>`,
          `<button class="btn btn-d" style="font-size:11.5px;padding:5px 10px">Refresh geocoding…</button>`)}
        ${stageCard('Solar resource', 'block', 'blocked', 'Never attempted',
          `<div style="font-size:11.5px;color:var(--muted)">Needs resolved coordinates. Retry is unavailable until geocoding resolves.</div>`,
          `<button class="btn" disabled style="font-size:11.5px;padding:5px 10px">Retry unavailable</button>`)}
        ${stageCard('PVWatts', 'block', 'blocked', 'Never attempted',
          `<div style="font-size:11.5px;color:var(--muted)">Needs resolved coordinates. Retry is unavailable until geocoding resolves.</div>`,
          `<button class="btn" disabled style="font-size:11.5px;padding:5px 10px">Retry unavailable</button>`)}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${blockedPanel('PVWatts v8 estimate', 'PVWatts needs latitude and longitude. No request was made, so there is nothing to show — not a zero, not an estimate.')}
      ${blockedPanel('Solar resource', 'The solar resource service needs latitude and longitude. No request was made.')}
    </div>
    <div class="panel" style="border-radius:2px;padding:16px 18px">
      ${sectionTitle('What usually fixes this')}
      <ol style="margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);max-width:760px;line-height:1.7">
        <li>Add a city, state or postal code — the query is sent exactly as stored, with no autocorrection.</li>
        <li>Spell out an abbreviation, or drop a unit or lot designator that has no street presence.</li>
        <li>If the address is right and the service was simply unavailable, refresh geocoding without editing.</li>
      </ol>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-p">Edit address</button><button class="btn">Refresh geocoding…</button></div>
    </div>
  </div>`, 1200), 'utf8');

console.log('detail bodies written');
