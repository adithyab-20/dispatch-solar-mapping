import { writeFileSync } from 'node:fs';

const spark = (heights, color = '#C96A1C') =>
  `<svg width="88" height="22" viewBox="0 0 88 22" aria-hidden="true">${
    heights.map((y, i) => `<rect x="${i * 7.4}" y="${y}" width="5" height="${22 - y}" rx="1.6" fill="${color}"></rect>`).join('')
  }</svg>`;

const S1 = [11, 9, 5, 3, 2, 3, 4, 4, 6, 8, 12, 13];
const S2 = [13, 10, 6, 3, 2, 2, 3, 5, 7, 10, 14, 15];
const S3 = [14, 11, 7, 4, 3, 3, 4, 6, 8, 11, 15, 16];
const S4 = [12, 10, 6, 4, 3, 3, 5, 6, 8, 10, 13, 14];

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

// One catalog row. Name and annual production carry the weight; everything else recedes.
const irradiance = (g, d, t) => `
  <div style="display:flex;align-items:center;gap:14px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(19,58,42,.10)">
    ${[['GHI', g], ['DNI', d], ['TILT', t]].map(([k, v]) => `
      <span style="display:flex;align-items:center;gap:5px">
        <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">${
          [0.62, 0.86, 1].map((f, i) => `<rect x="${i * 5}" y="${(12 - 12 * f).toFixed(1)}" width="3.4" height="${(12 * f).toFixed(1)}" rx="1" fill="#3E8E4F"></rect>`).join('')
        }</svg>
        <span class="lbl" style="color:var(--muted)">${k}</span>
        <span class="num" style="font-size:11.5px;color:#2C6B3A">${v}</span>
      </span>`).join('')}
    <span class="unit" style="font-size:9.5px">kWh/m²/day</span>
  </div>`;

const row = ({ name, addr, kwh, bars, selected = false, caution = false, coords, hover = false, irr = null }) => `
  <a href="#" style="display:block;padding:15px 18px 15px ${selected || hover ? '14px' : '18px'};border-bottom:1px solid var(--rule);text-decoration:none;color:inherit;border-left:${selected ? '4px solid var(--solar)' : hover ? '4px solid var(--rule-strong)' : '0'};background:${selected ? 'var(--solar-wash)' : hover ? 'var(--panel-2)' : 'transparent'}">
   <div style="display:flex;gap:14px;align-items:center">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:15.5px;font-weight:600;letter-spacing:-.005em">${name}</span>
        ${caution ? `<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><title>One result is missing</title><path d="M8 1.8l6 10.8H2z" fill="none" stroke="#8A6100" stroke-width="1.4" stroke-linejoin="round"></path><path d="M8 6.2v3.2" stroke="#8A6100" stroke-width="1.4" stroke-linecap="round"></path><circle cx="8" cy="11.4" r=".8" fill="#8A6100"></circle></svg>` : ''}
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${addr}</div>
      <div class="mono" style="font-size:10px;color:var(--faint);margin-top:5px">${coords}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div><span class="num" style="font-size:17px;letter-spacing:-.01em">${kwh}</span> <span class="unit" style="font-size:10px">kWh/yr</span></div>
      <div style="margin-top:4px">${spark(bars)}</div>
    </div>
   </div>
   ${irr ? irradiance(...irr) : ''}
  </a>`;

const railHeader = `
  <div style="padding:15px 18px 13px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:baseline;gap:9px">
        <h1 style="margin:0;font-size:16px;font-weight:600">Sites with results</h1>
        <span class="num" style="font-size:14px;color:var(--muted)">4</span>
      </div>
      <button class="btn" style="padding:5px 8px;border-color:var(--rule)" aria-label="Collapse the site list">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3L4.5 7l4 4" stroke="#101010" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M11.5 3v8" stroke="#101010" stroke-width="1.5" stroke-linecap="round"></path></svg>
      </button>
    </div>
    <p style="margin:8px 0 0;font-size:11.5px;color:var(--muted)">Ordered as imported. These four have coordinates; opening or closing this list re-fits the map so none of them ends up behind it.</p>
  </div>`;

// The sites without results: one quiet, collapsed group — still in the list, out of the way.
const attention = `
  <div style="border-top:1px solid var(--rule-strong);background:var(--panel-2)">
    <button style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 18px;background:none;border:0;cursor:pointer;text-align:left;font-family:var(--sans)">
      <span style="display:flex;align-items:center;gap:9px">
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l4.5 4.5L4 11.5" stroke="#58595B" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <span style="font-size:13px;font-weight:600;color:var(--ink)">Not on the map</span>
        <span class="num" style="font-size:12px;color:var(--muted)">3</span>
      </span>
      <span class="mono" style="font-size:10px;color:var(--faint)">1 pending · 1 no match · 1 failed</span>
    </button>
  </div>`;

const processingRow = `
  <div style="display:flex;gap:14px;align-items:center;padding:15px 18px;border-bottom:1px solid var(--rule);opacity:.62">
    <div style="flex:1;min-width:0">
      <div style="font-size:15.5px;font-weight:600;color:var(--muted)">Piedmont Solar Center</div>
      <div style="font-size:12px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">3300 Rock Quarry Rd, Raleigh, NC 27610</div>
      <div style="display:flex;align-items:center;gap:7px;margin-top:7px">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" stroke="#E2E2E2" stroke-width="1.5" fill="none"></circle><path d="M6 1.6A4.4 4.4 0 0 1 10.4 6" stroke="#006400" stroke-width="1.7" stroke-linecap="round" fill="none"></path></svg>
        <span class="mono" style="font-size:10.5px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase">Processing</span>
      </div>
    </div>
    <div style="width:88px;flex-shrink:0">
      <div style="height:3px;background:var(--rule);border-radius:2px;overflow:hidden"><div style="width:45%;height:100%;background:var(--solar-lite)"></div></div>
    </div>
  </div>`;

const mapSvg = `
  <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Map of the United States with four resolved solar sites">
    <defs><clipPath id="us"><path d="M70,70 L520,55 L560,70 L600,96 L640,80 L690,120 L760,130 L830,150 L862,108 L845,176 L810,210 L790,242 L800,300 L770,350 L762,400 L792,432 L800,500 L768,470 L748,410 L700,420 L650,430 L600,442 L560,470 L520,500 L470,470 L420,455 L380,430 L300,430 L250,455 L180,470 L150,420 L120,360 L100,300 L80,230 L60,150 Z"></path></clipPath></defs>
    <rect width="1000" height="620" fill="#F1F1F1"></rect>
    <g stroke="#E2E2E2" stroke-width="1"><path d="M0 100H1000M0 200H1000M0 300H1000M0 400H1000M0 500H1000M100 0V620M250 0V620M400 0V620M550 0V620M700 0V620M850 0V620"></path></g>
    <g clip-path="url(#us)">
      <rect width="1000" height="620" fill="#FAFAFA"></rect>
      <g stroke="#E2E2E2" stroke-width="1.1"><path d="M170 60V470M250 55V455M330 55V430M410 55V450M490 55V500M570 60V470M650 78V430M730 125V420M810 145V300M0 150H900M0 230H900M0 300H900M0 370H900M0 440H900"></path></g>
    </g>
    <path d="M70,70 L520,55 L560,70 L600,96 L640,80 L690,120 L760,130 L830,150 L862,108 L845,176 L810,210 L790,242 L800,300 L770,350 L762,400 L792,432 L800,500 L768,470 L748,410 L700,420 L650,430 L600,442 L560,470 L520,500 L470,470 L420,455 L380,430 L300,430 L250,455 L180,470 L150,420 L120,360 L100,300 L80,230 L60,150 Z" fill="none" stroke="#C2C2C2" stroke-width="1.6" stroke-linejoin="round"></path>
    <g>
      <circle cx="145" cy="330" r="13" fill="#006400" opacity=".14"></circle><circle cx="145" cy="330" r="5.5" fill="#006400" stroke="#FFFFFF" stroke-width="2"></circle>
      <circle cx="360" cy="268" r="13" fill="#006400" opacity=".14"></circle><circle cx="360" cy="268" r="5.5" fill="#006400" stroke="#FFFFFF" stroke-width="2"></circle>
      <circle cx="520" cy="452" r="13" fill="#006400" opacity=".14"></circle><circle cx="520" cy="452" r="5.5" fill="#006400" stroke="#FFFFFF" stroke-width="2"></circle>
      <circle cx="278" cy="382" r="20" fill="#006400" opacity=".16"></circle><circle cx="278" cy="382" r="8" fill="#004D00" stroke="#FFFFFF" stroke-width="2.5"></circle>
    </g>
  </svg>`;


const mapControls = `
  <div style="position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
    <div style="display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--rule-strong);border-radius:2px;overflow:hidden">
      <button class="btn" style="border:0;border-radius:0;padding:7px 9px;background:var(--panel)" aria-label="Zoom in">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="#101010" stroke-width="1.5" stroke-linecap="round"></path></svg>
      </button>
      <div style="height:1px;background:var(--rule)"></div>
      <button class="btn" style="border:0;border-radius:0;padding:7px 9px;background:var(--panel)" aria-label="Zoom out">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7h9" stroke="#101010" stroke-width="1.5" stroke-linecap="round"></path></svg>
      </button>
    </div>
    <button class="btn" style="padding:6px 10px;font-size:11.5px;background:var(--panel)">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5V2.6h2.4M12 5V2.6H9.6M2 9v2.4h2.4M12 9v2.4H9.6" stroke="#101010" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="7" cy="7" r="1.6" fill="#006400"></circle></svg>
      Fit to sites
    </button>
  </div>`;

const panHint = `
  <div class="mono" style="position:absolute;left:16px;bottom:12px;font-size:10px;color:var(--muted);background:rgba(255,253,248,.92);border:1px solid var(--rule);border-radius:2px;padding:4px 8px">Drag to pan · scroll to zoom · the list never covers the map</div>`;

const attribution = `
  <div style="position:absolute;right:12px;bottom:10px;text-align:right;line-height:1.5">
    <div class="mono" style="font-size:10px;color:var(--muted);background:rgba(255,253,248,.9);padding:2px 6px;border-radius:2px;display:inline-block">Map data © OpenStreetMap contributors</div>
    <div class="mono" style="font-size:10px;color:var(--muted);background:rgba(255,253,248,.9);padding:2px 6px;border-radius:2px;display:inline-block;margin-top:3px">Geocoding © OpenStreetMap / Nominatim</div>
  </div>`;

const callout = `
  <div style="position:absolute;left:calc(27.8% - 10px);top:calc(61.6% + 14px);width:250px;background:var(--panel);border:1px solid var(--rule-strong);border-radius:2px;box-shadow:0 6px 18px rgba(28,58,52,.10);padding:11px 12px">
    <div style="font-size:13px;font-weight:600">Desert Bloom Solar</div>
    <div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:3px">3737 West Buckeye Road, Phoenix, Maricopa County, Arizona, 85009</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:9px;padding-top:9px;border-top:1px solid var(--rule)">
      <div><div class="lbl">Annual AC</div><div><span class="num" style="font-size:15px">179,270</span> <span class="unit">kWh</span></div></div>
      <span style="font-size:12px;color:var(--navy);font-weight:500">Open detail →</span>
    </div>
    <div style="display:flex;gap:12px;margin-top:8px;padding-top:8px;border-top:1px solid var(--rule)">
      ${[['GHI', '5.65'], ['DNI', '6.58'], ['TILT', '6.10']].map(([k, v]) => `<span style="display:flex;align-items:baseline;gap:4px"><span class="lbl">${k}</span><span class="num" style="font-size:11.5px;color:#2C6B3A">${v}</span></span>`).join('')}
      <span class="unit" style="font-size:9.5px">kWh/m²/day</span>
    </div>
  </div>`;

// ── Landing, rail open ────────────────────────────────────────────────────
writeFileSync('parts/Main.body.html', `
<div style="width:1440px;height:900px;display:flex;flex-direction:column;background:var(--ground);overflow:hidden">
  ${appbar}
  <div style="display:flex;flex:1;min-height:0">
    <aside style="width:400px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--rule-strong);display:flex;flex-direction:column;min-height:0">
      ${railHeader}
      <div style="flex:1;overflow:hidden">
        ${row({ name: 'Desert Bloom Solar', addr: '3737 W Buckeye Rd, Phoenix, AZ 85009', kwh: '179,270', bars: S1, selected: true, coords: '33.4362, −112.1279', irr: ['5.65', '6.58', '6.10'] })}
        ${row({ name: 'Central Valley Array', addr: '2200 Weedpatch Hwy, Bakersfield, CA 93307', kwh: '176,940', bars: S2, coords: '35.3011, −118.9294 · hovered', hover: true, irr: ['5.82', '6.94', '6.21'] })}
        ${row({ name: 'Front Range PV Yard', addr: '5050 Pearl Pkwy, Boulder, CO 80301', kwh: '161,880', bars: S3, coords: '40.0210, −105.2510' })}
        ${row({ name: 'Hill Country Solar Farm', addr: '4500 E Ben White Blvd, Austin, TX 78741', kwh: '168,410', bars: S4, caution: true, coords: '30.2219, −97.7180 · solar resource missing' })}
        ${processingRow}
      </div>
      ${attention}
    </aside>
    <section style="flex:1;position:relative;background:#F1F1F1;min-width:0">
      ${mapSvg}${callout}${mapControls}${panHint}${attribution}
    </section>
  </div>
</div>`, 'utf8');

// ── Landing, rail collapsed ───────────────────────────────────────────────
const stripDot = (fill, stroke) => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="1.3"` : ''}></circle></svg>`;

writeFileSync('parts/LandingCollapsed.body.html', `
<div style="width:1440px;height:900px;display:flex;flex-direction:column;background:var(--ground);overflow:hidden">
  ${appbar}
  <div style="display:flex;flex:1;min-height:0">
    <aside style="width:56px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--rule-strong);display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:16px">
      <button class="btn" style="padding:5px 7px;border-color:var(--rule)" aria-label="Show the site list">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3l4 4-4 4" stroke="#101010" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.5 3v8" stroke="#101010" stroke-width="1.5" stroke-linecap="round"></path></svg>
      </button>
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)">Sites&nbsp;&nbsp;7</div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:center;margin-top:2px">
        ${stripDot('#004D00')}${stripDot('#006400')}${stripDot('#006400')}${stripDot('#006400')}
        <div style="width:16px;height:1px;background:var(--rule-strong)"></div>
        ${stripDot('none', '#58595B')}${stripDot('none', '#58595B')}${stripDot('none', '#B3261E')}
      </div>
    </aside>
    <section style="flex:1;position:relative;background:#F1F1F1;min-width:0">
      ${mapSvg}
      <div style="position:absolute;left:16px;top:16px;background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:9px 11px">
        <div class="lbl" style="margin-bottom:5px">Map shows</div>
        <div style="display:flex;align-items:center;gap:7px;font-size:11.5px"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="#006400" stroke="#FFFFFF" stroke-width="1.5"></circle></svg>4 sites with coordinates</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">3 more are listed but unmapped</div>
      </div>
      ${callout}${mapControls}${panHint}${attribution}
    </section>
  </div>
</div>`, 'utf8');

console.log('landing bodies written');
