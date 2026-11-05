// Rapport "Duiding NzSurf": zet de cijfers van de voorspellingsaudit om in een
// leesbaar oordeel over NzSurf (ons algoritme) en de kandidaat-opvolger NzSurf v2
// (open modellen, afgesteld op metingen; zie utils/forecastV2.ts). Puur: geeft een zelfstandig HTML-bestand terug dat in de
// browser opent, te printen is als PDF en te delen via het deelmenu.

import {
  AuditForecastDoc, AuditObsDoc, AuditParam, PARAMS, MIN_N, MIN_REPORTS,
  SpotReportLike, WIND_10M_FACTOR, buildPairs, reportRows, summarizeReports, energyScores,
} from './forecastAudit';
import { FAIR_MIN_DAYS, FAIR_MIN_MOMENTS, LEAD_DAYS, Raster, FairTable, fairDailyTable, fairSurfTable, fairVariableTable } from './fairCompare';
import { V2_SOURCE, V2_RULES } from './forecastV2';
import type { WebcamMeasurement } from '../services/webcamMeasure';
import { webcamRow, summarizeWebcam, nearbyEstimates, buoyAt, siteHeightAt, spotHeightAt, maeVsWebcam } from './webcamVerify';
import { barChart, lineChart, timeChart, C, BarRow } from './reportCharts';
import { DAY_MIN_SLOTS, DEFAULT_RULE, combinedTruth, obsTruth, reportTruth } from './surfVerdict';

/** Eén spot in het rapport. */
export interface ReportSpot { id: string; name: string; forecasts: AuditForecastDoc[]; buoyNote: string }

export interface FullReportInput {
  spots: ReportSpot[];
  observations: AuditObsDoc[];
  reports?: SpotReportLike[];
  periodLabel: string;
  webcam?: WebcamMeasurement[];
  webcamSites?: AuditForecastDoc[];
  now?: Date;
}

export interface AuditReportInput {
  forecasts: AuditForecastDoc[];
  observations: AuditObsDoc[];
  reports?: SpotReportLike[];
  periodLabel: string;
  spotName?: string;
  auditSpotId?: string;
  webcam?: WebcamMeasurement[];
  webcamSites?: AuditForecastDoc[]; // Surfline/surfnerd Maasvlakte
  now?: Date;
}

const NZ = 'nzsurf';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nl = (x: number, d = 2) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (x: number, d = 2) => (x > 0 ? '+' : '') + nl(x, d);
const decimals = (p: AuditParam) => (p === 'dir' || p === 'windDir' ? 0 : p === 'windKn' || p === 'tp' || p === 'tpPeak' || p === 'power' ? 1 : 2);
const LIVE = 'nzsurf-v2-live';
const REFS = [LIVE, V2_SOURCE, NZ];
const isOurs = (s: string) => s === NZ || s === V2_SOURCE || s === LIVE;
const REPORT_RASTER: Raster = 3;
const REPORT_DAYS = [1, 2, 3];
type Topic = 'surf' | AuditParam;
const TOPICS: { key: Topic; label: string; unit: string; note?: string }[] = [
  { key: 'surf', label: 'Te surfen?', unit: '%' },
  ...PARAMS.map(p => ({ key: p.key as Topic, label: p.key === 'tpPeak' ? 'Piekperiode (indicatief)' : p.label, unit: p.unit, note: p.note })),
];

/** Eén eerlijke tabel als HTML. */
function fairTableHtml(t: FairTable, topic: Topic, unit: string): string {
  if (!t.rows.length) return `<p class="meta">Dag ${t.leadDay}: nog geen ${FAIR_MIN_MOMENTS} gezamenlijke momenten over ${FAIR_MIN_DAYS} dagen.</p>`;
  const d = topic === 'surf' ? 0 : decimals(topic);
  const v = (x: number) => (topic === 'surf' ? `${x}%` : nl(x, d));
  const dl = (x: number) => (topic === 'surf' ? `${x > 0 ? '+' : ''}${x}` : signed(x, d));
  const rows = t.rows.map((r, i) => `<tr class="${isOurs(r.source) ? 'ours' : ''}"><td>${i + 1}</td><td>${esc(r.label)} <small>${r.step === 1 ? 'uur' : `${r.step} u`}${t.raster > 1 && r.offset ? ` · +${nl(r.offset, 1)} u` : ''}</small></td><td>${v(r.value)}</td>${topic === 'surf'
    ? `<td>${r.caught ?? '–'}%</td><td>${r.rightNo ?? '–'}%</td>`
    : `<td>${r.bias !== undefined ? signed(r.bias, d) : '–'}</td>`}<td>${r.source === t.ref ? '<small>referentie</small>' : r.delta !== undefined ? `<b>${dl(r.delta)}</b>${r.lo !== undefined && r.hi !== undefined ? ` <small>(${dl(r.lo)} – ${dl(r.hi)})</small>` : ''}` : '–'}</td></tr>`).join('');
  const head = topic === 'surf' ? '<th>Score</th><th>Gevangen</th><th>Terecht nee</th>' : `<th>Afwijking (${esc(unit)})</th><th>Bias</th>`;
  const out = t.dropped.length ? `<p class="meta">Niet in deze tabel: ${t.dropped.map(x => `${esc(x.label)} (${esc(x.reason)})`).join(' · ')}.</p>` : '';
  return `<p class="meta"><b>Dag ${t.leadDay}</b> · ${t.moments} gezamenlijke momenten over ${t.days} dagen · raster elke ${t.raster} uur</p>
<table class="rank"><thead><tr><th>#</th><th>Bron</th>${head}<th>Δ v2 (90%)</th></tr></thead><tbody>${rows}</tbody></table>${out}`;
}

const roleOf = (source: string, bestOther?: string): BarRow['role'] =>
  source === NZ ? 'nz' : source === V2_SOURCE || source === LIVE ? 'hybrid' : source === bestOther ? 'best' : 'other';

interface SpotResult { html: string; days: number; name: string; appendix: string; glance: Map<Topic, FairTable> }

/** Hoofdstuk voor één spot: alles eerlijk vergeleken (zelfde dag vooruit, raster en momenten). */
function spotSection(spot: ReportSpot, observations: AuditObsDoc[], reports: SpotReportLike[] | undefined, withReports: boolean): SpotResult {
  const forecasts = spot.forecasts;
  const pairs = buildPairs(forecasts, observations);
  const days = new Set(forecasts.map(f => f.runDate)).size;
  const labelOf = (s: string) => (s === LIVE ? 'NzSurf v2 (live, in de app)' : s === V2_SOURCE ? 'NzSurf v2 (nagerekend)' : s === NZ ? 'NzSurf v1 (basis)' : forecasts.find(f => f.source === s)?.label || s);
  const latestV2 = forecasts.filter(f => f.source === V2_SOURCE).sort((a, b) => b.runAt.localeCompare(a.runAt))[0];
  if (!pairs.length) {
    return { appendix: '', glance: new Map(), days, name: spot.name, html: `<section class="spot"><h2 class="spot-h">${esc(spot.name)}</h2><p class="warn">Nog geen verwachtingen met een meting op hetzelfde uur.</p></section>` };
  }
  const truth = combinedTruth(reportTruth(reports || [], spot.id), obsTruth(observations, DEFAULT_RULE));
  const table = (topic: Topic, leadDay: number, raster: Raster = REPORT_RASTER) => topic === 'surf'
    ? fairSurfTable(forecasts, DEFAULT_RULE, truth, { leadDay, raster, refs: REFS, labelOf })
    : fairVariableTable(pairs, forecasts, { param: topic, leadDay, raster, refs: REFS, labelOf });
  const d1 = new Map(TOPICS.map(t => [t.key, table(t.key, 1)] as const));

  // Kernoordeel uit dag 1 (raster 3 uur): waar staan onze versies, op dezelfde momenten.
  const summary: string[] = [];
  for (const t of TOPICS) {
    const ft = d1.get(t.key)!;
    if (!ft.rows.length) continue;
    const pos = (s: string) => { const i = ft.rows.findIndex(r => r.source === s); return i < 0 ? null : i + 1; };
    const ours = [LIVE, V2_SOURCE, NZ].map(s => (pos(s) ? `${labelOf(s).replace('NzSurf ', '')} #${pos(s)}` : null)).filter(Boolean);
    const best = ft.rows[0];
    summary.push(`${t.label}: ${ours.join(', ') || 'NzSurf niet in de tabel'} van ${ft.rows.length}${!isOurs(best.source) ? `; beste: ${best.label}` : ''} (${ft.moments} momenten).`);
  }
  const maturity = days < 28
    ? `<p class="warn"><b>Voorlopig oordeel.</b> ${days} ophaaldagen; pas na ongeveer 4–6 weken met verschillende weertypes is de ranglijst stabiel.</p>`
    : `<p class="ok">${days} ophaaldagen: genoeg voor een stabiel oordeel, mits er verschillende weertypes in zaten.</p>`;

  // Grafieken: dag 1, op dezelfde momenten.
  const bars = (topic: AuditParam) => {
    const ft = d1.get(topic)!; const t = TOPICS.find(x => x.key === topic)!;
    if (!ft.rows.length) return '';
    const bestOther = ft.rows.find(r => !isOurs(r.source))?.source;
    return barChart(`${t.label}: afwijking per bron (dag 1, ${ft.moments} gezamenlijke momenten)`, t.unit, ft.rows.map(r => ({ label: r.label, value: r.value, role: roleOf(r.source, bestOther) })), decimals(topic));
  };
  // Per vooruitkijkdag: elke dag een eigen eerlijke tabel; de lijn toont onze versies en de beste andere per dag.
  const leadLine = (topic: AuditParam) => {
    const t = TOPICS.find(x => x.key === topic)!;
    const per = LEAD_DAYS.map(dd => table(topic, dd));
    if (!per.some(x => x.rows.length)) return '';
    const val = (pick: (ft: FairTable) => number | undefined) => per.map(pick);
    return lineChart(`${t.label} per vooruitkijkdag`, `gem. afwijking, ${t.unit} (per dag op eigen gezamenlijke momenten)`, LEAD_DAYS.map(dd => `d${dd}`), [
      { name: 'NzSurf v1', color: C.nz, values: val(ft => ft.rows.find(r => r.source === NZ)?.value) },
      { name: 'NzSurf v2', color: C.hybrid, values: val(ft => (ft.rows.find(r => r.source === LIVE) ?? ft.rows.find(r => r.source === V2_SOURCE))?.value) },
      { name: 'Beste andere', color: C.best, values: val(ft => ft.rows.find(r => !isOurs(r.source))?.value), dashed: true },
    ], decimals(topic));
  };

  // Tijdreeks golfhoogte: meting tegen de verwachting van de dag ervoor (dag 1).
  const series = (src: string) => {
    const byT = new Map<number, { v: number; lead: number }>();
    for (const p of pairs) {
      if (p.param !== 'hs' || p.source !== src || p.bucket !== 'd1') continue;
      const t = Date.parse(p.t), cur = byT.get(t);
      if (!cur || p.lead < cur.lead) byT.set(t, { v: p.fc, lead: p.lead });
    }
    return [...byT.entries()].map(([t, x]) => ({ t, v: x.v }));
  };
  const obsSeries = (() => { const byT = new Map<number, number>(); for (const p of pairs) if (p.param === 'hs') byT.set(Date.parse(p.t), p.obs); return [...byT.entries()].map(([t, v]) => ({ t, v })); })();
  const hasLive = forecasts.some(f => f.source === LIVE);
  const time = timeChart('Golfhoogte: gemeten en voorspeld (dag 1)', 'm', [
    { name: 'Gemeten (boei)', color: C.obs, points: obsSeries, width: 2.5 },
    { name: 'NzSurf v1', color: C.nz, points: series(NZ) },
    { name: hasLive ? 'NzSurf v2 (live)' : 'NzSurf v2', color: C.hybrid, points: series(hasLive ? LIVE : V2_SOURCE) },
  ]);

  // Hoofdtekst: te surfen en golfhoogte/wind voor dag 1–3.
  const block = (topic: Topic) => {
    const t = TOPICS.find(x => x.key === topic)!;
    return `<h3>${esc(t.label)}</h3>${t.note ? `<p class="meta">${esc(t.note)}</p>` : ''}${REPORT_DAYS.map(dd => fairTableHtml(dd === 1 ? d1.get(topic)! : table(topic, dd), topic, t.unit)).join('')}`;
  };
  const daily = REPORT_DAYS.map(dd => fairDailyTable(forecasts, DEFAULT_RULE, truth, { leadDay: dd, labelOf })).filter(t => t.rows.length || t.dropped.length);
  const dailyHtml = daily.length ? `<h3>Dagoordelen (apart)</h3>
<p class="meta">Wompy en de dagkaarten van Secret Swell geven één oordeel per dag. Die staan nooit in de uurtabellen; hier alleen onderling, op dezelfde dagen. Een dag telt als te surfen bij minstens ${DAY_MIN_SLOTS} surfbare daglichtmomenten.</p>
${daily.map(t => t.rows.length ? `<p class="meta"><b>Dag ${t.leadDay}</b> · ${t.days} gezamenlijke dagen</p><table class="rank"><thead><tr><th>Bron</th><th>Score</th><th>Gevangen</th><th>Terecht nee</th></tr></thead><tbody>${t.rows.map(r => `<tr><td>${esc(r.label)}</td><td><b>${r.value}%</b></td><td>${r.caught}%</td><td>${r.rightNo}%</td></tr>`).join('')}</tbody></table>` : `<p class="meta">Dag ${t.leadDay}: ${t.dropped.map(x => `${esc(x.label)}: ${esc(x.reason)}`).join(' · ')}.</p>`).join('')}` : '';

  let reportSection = '';
  if (withReports && reports?.length) {
    const rs = summarizeReports(reportRows(reports, forecasts, spot.id));
    const lines: string[] = [];
    if (rs.chance && rs.chance.n >= MIN_REPORTS) lines.push(`<li>NzSurf-kans klopt met je eigen oordeel in <b>${rs.chance.agree}%</b> van ${rs.chance.n} rapporten${rs.breakfinder && rs.breakfinder.n >= MIN_REPORTS ? `; breakfinder ${rs.breakfinder.agree}%` : ''}.</li>`);
    if (rs.wave && rs.wave.n >= MIN_REPORTS) lines.push(`<li>Hoogte op de spot wijkt ${nl(rs.wave.maeSpot)} m af van de foto, de hoogte op zee ${nl(rs.wave.maeSea)} m.</li>`);
    reportSection = `<h3>Spotrapporten</h3>${lines.length ? `<ul>${lines.join('')}</ul>` : `<p class="meta">Minder dan ${MIN_REPORTS} bruikbare rapporten.</p>`}`;
  }
  const energy = energyHtml(forecasts, observations);

  const html = `<section class="spot">
<h2 class="spot-h">${esc(spot.name)}</h2>
<p class="meta">${days} ophaaldagen · meting: ${esc(spot.buoyNote)}</p>
<div class="sum"><p class="meta" style="margin:4px 0">Dag 1, raster elke ${REPORT_RASTER} uur, alle bronnen per regel op dezelfde momenten:</p><ul>${summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
${maturity}
<p class="meta"><b>Zo is vergeleken:</b> per tabel één vooruitkijkdag, één raster (hier blokken van ${REPORT_RASTER} uur op NL-tijd, per bron één waarde per blok, zo dicht mogelijk bij het begin) en alleen de blokken waarin álle bronnen in die tabel een verwachting hadden en de werkelijkheid bekend is. Elke verwachting wordt getoetst aan de meting op zijn eigen uur; "+1 u" achter een naam = gemiddeld zoveel uur na het begin van het blok (oudere modeldata op UTC-tijd; sinds 5 november elk uur opgeslagen). In de bijlage dag 1 ook op het uurraster: daar exact hetzelfde uur voor iedereen. Te weinig overlap (&lt; ${FAIR_MIN_MOMENTS} momenten of &lt; ${FAIR_MIN_DAYS} dagen): de bron met de minste overlap valt af en staat onder de tabel. Dagoordelen staan apart. Δ = verschil met NzSurf v2 (live; anders nagerekend) op dezelfde momenten, met 90%-interval.</p>

<div class="legend"><span><i style="background:${C.nz}"></i>NzSurf v1</span><span><i style="background:${C.hybrid}"></i>NzSurf v2</span><span><i style="background:${C.best}"></i>Beste andere bron</span><span><i style="background:${C.other}"></i>Overige</span></div>
${bars('hs')}
${bars('windKn')}
<h3>Hoe ver vooruit is het betrouwbaar?</h3>
<div class="pair">${leadLine('hs')}${leadLine('windKn')}</div>
${time}

<h2>Te surfen?</h2>
<p class="meta">Score = gemiddelde van "surfbare momenten gevangen" en "terecht nee" (altijd nee = 50%). Werkelijkheid: spotrapporten, anders de regel op de boei (golf ≥ 0,6 m, periode ≥ 5 s, wind ≤ 16 kn aanlandig / 20 kn anders). Alleen daglicht.</p>
${block('surf')}
${dailyHtml}

<h2>Op zee: golfhoogte en wind</h2>
${block('hs')}
${block('windKn')}

${latestV2 ? `<h3>NzSurf v2: de regels</h3><p>${esc(V2_RULES)}.</p><p class="meta">"Live" = wat de app liet zien (eigen kans, vastgelegd sinds 28 oktober). "Nagerekend" = achteraf met dezelfde regels; "te surfen?" daarvan volgt de boeiregel op zijn eigen cijfers.</p>` : ''}
${energy.replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>')}
${reportSection}
</section>`;

  // Bijlage: alle onderdelen, dag 1–7 (raster 3 uur), en dag 1 op het uurraster.
  const appendix = `<section class="spot"><h2 class="spot-h">Bijlage — ${esc(spot.name)}: alle eerlijke tabellen</h2>
<p class="meta">Per onderdeel elke vooruitkijkdag apart, raster elke ${REPORT_RASTER} uur. Daarna dag 1 op het uurraster (alleen bronnen met een waarde per uur). Per tabel alle bronnen op dezelfde momenten.</p>
${TOPICS.map(t => `<h3>${esc(t.label)}</h3>${t.note ? `<p class="meta">${esc(t.note)}</p>` : ''}${LEAD_DAYS.map(dd => { const ft = dd === 1 ? d1.get(t.key)! : table(t.key, dd); return ft.rows.length ? fairTableHtml(ft, t.key, t.unit) : ''; }).join('')}`).join('')}
<h3>Uurraster (dag 1)</h3>
${TOPICS.map(t => { const ft = table(t.key, 1, 1); return ft.rows.length ? `<p class="meta"><b>${esc(t.label)}</b></p>${fairTableHtml(ft, t.key, t.unit)}` : ''; }).join('')}
</section>`;
  return { html, days, name: spot.name, appendix, glance: d1 };
}

const STYLE = `
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#fff;max-width:860px;margin:0 auto;padding:20px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #0891b2;padding-bottom:3px}h3{font-size:14px;margin:18px 0 6px}
.spot-h{font-size:20px;background:#0f172a;color:#fff;border:0;border-radius:8px;padding:6px 12px}
.meta{color:#64748b;font-size:12px}table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0}
th,td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9}
tr.note td{color:#475569;font-size:11.5px;border-bottom:2px solid #cbd5e1}small{color:#64748b}
.sum{background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:8px 14px}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;font-size:13px}
.ok{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:8px 12px;font-size:13px}ul{padding-left:18px}li{margin:3px 0}
figure.chart{margin:10px 0}figure.chart figcaption{font-size:12.5px;font-weight:700;margin-bottom:2px}figure.chart figcaption span{font-weight:400;color:#64748b}
.pair{display:flex;flex-wrap:wrap;gap:8px}.pair figure.small{flex:1 1 300px;margin:4px 0}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#52514e;margin:8px 0 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.glance td,.glance th{text-align:center}
table.rank td:nth-child(n+3),table.rank th:nth-child(n+3){text-align:right}table.rank tr.ours td{font-weight:700;background:#f0f9ff}table.rank tr.few td{color:#94a3b8}.glance td:first-child,.glance th:first-child{text-align:left}
@media print{body{padding:0}h2,h3{break-after:avoid}table,figure{break-inside:avoid}section.spot{break-before:page}}
`;

/** Volledig rapport over alle auditspots, met grafieken. */
export function buildFullReport(input: FullReportInput): { title: string; html: string } {
  const now = input.now ?? new Date();
  const results = input.spots.map((sp, i) => spotSection(sp, input.observations, input.reports, i === 0));

  // In één oogopslag (dag 1, raster 3 uur, zelfde momenten): rang van onze versies per spot.
  const pos = (ft: FairTable | undefined, src: string) => { const i = ft ? ft.rows.findIndex(r => r.source === src) : -1; return i < 0 ? '–' : `#${i + 1}/${ft!.rows.length}`; };
  const glanceRows = TOPICS.map(t => `<tr><td><b>${esc(t.label)}</b></td>${results.map(r => { const ft = r.glance.get(t.key); return `<td>${pos(ft, 'nzsurf-v2-live')}</td><td>${pos(ft, V2_SOURCE)}</td><td>${pos(ft, NZ)}</td><td><small>${ft?.rows[0] ? esc(ft.rows[0].label.split(' (')[0]) : '–'}</small></td>`; }).join('')}</tr>`).join('');
  const glance = `<table class="glance"><thead><tr><th rowspan="2">Onderdeel</th>${results.map(r => `<th colspan="4">${esc(r.name)}</th>`).join('')}</tr>
<tr>${results.map(() => '<th>v2 live</th><th>v2 nagerekend</th><th>v1</th><th>Beste</th>').join('')}</tr></thead><tbody>${glanceRows}</tbody></table>
<p class="meta">Dag 1 vooruit, raster elke 3 uur; per onderdeel alle bronnen op dezelfde momenten (dus elk onderdeel een eigen aantal bronnen). – = niet in de tabel (te weinig overlap of geen verwachting).</p>`;

  const webcam = webcamHtml(input.webcam || [], input.observations, input.webcamSites || []);
  const title = `Duiding NzSurf — ${now.toISOString().slice(0, 10)}`;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head><body>
<h1>Duiding NzSurf — ${esc(results.map(r => r.name).join(' & '))}</h1>
<p class="meta">Gemaakt ${esc(now.toLocaleString('nl-NL'))} · ${esc(input.periodLabel)} · ${input.observations.length} meetdagen · elke tabel: één vooruitkijkdag, één raster, alle bronnen op dezelfde momenten (≥ ${FAIR_MIN_MOMENTS} momenten, ≥ ${FAIR_MIN_DAYS} dagen)</p>

<h2>In één oogopslag</h2>
${glance}

${results.map(r => r.html).join('\n')}

${webcam ? `<section class="spot">${webcam}</section>` : ''}

<h2>Wat dit rapport niet zegt</h2>
<ul>
<li><b>Boei ≠ strand.</b> De meting is op zee (Maasgeul 2, oudere dagen Schouwenbank): voor de Maasvlakte ±5 km, voor Ouddorp 20 km. Hoogtes op de spot en de surfkans zijn alleen met spotrapporten en de webcam te toetsen.</li>
<li><b>Wind:</b> gemeten op ±30 m hoogte op zee (Lichteiland Goeree / Europlatform) en omgerekend naar 10 m, de hoogte van de modellen (× ${String(WIND_10M_FACTOR).replace('.', ',')}). Aan het strand kan het nog anders zijn.</li>
<li><b>Golfrichting Maasvlakte</b> telt niet mee: het rekenpunt ligt dicht onder de kust, waar de modellen de golven naar het strand laten draaien, terwijl de boei op open zee meet.</li>
<li><b>Periode:</b> de boei meet de gemiddelde periode (Tm02). Modellen en NzSurf (ook gemiddelde periode) worden daartegen getoetst; sites met een piek- of swellperiode (Surfline e.d.) apart en alleen indicatief tegen Tm02 × 1,25. Golfkracht alleen voor bronnen met een gemiddelde periode.</li>
<li><b>Eerlijk vergelijken:</b> elke tabel gaat over één vooruitkijkdag en één raster, met alle bronnen op exact dezelfde momenten. Dagoordelen (Wompy, dagkaarten Secret Swell) alleen onderling. Een verschil waarvan het 90%-interval door 0 loopt, is niet aangetoond.</li>
<li><b>Golfkracht</b> is berekend (0,49 × Hs² × 1,2 × T), niet gemeten.</li>
<li><b>Dubbelingen:</b> Open-Meteo best match is golf van Météo-France en wind van KNMI; telt niet als aparte stem.</li>
</ul>

${results.map(r => r.appendix).join('\n')}
</body></html>`;
  return { title, html };
}

/** Oude ingang (één spot); gebruikt het nieuwe rapport. */
export function buildAuditReport(input: AuditReportInput): { title: string; html: string } {
  return buildFullReport({
    spots: [{ id: input.auditSpotId || 'ouddorp-p-noordweg', name: input.spotName || 'Ouddorp', forecasts: input.forecasts, buoyNote: 'boei Maasgeul 2 / Schouwenbank, wind Europlatform' }],
    observations: input.observations, reports: input.reports, periodLabel: input.periodLabel,
    webcam: input.webcam, webcamSites: input.webcamSites, now: input.now,
  });
}

/** Sectie webcam Maasvlakte: NzSurf getoetst aan wat er aan het strand aankomt (AI-schatting). */
function webcamHtml(items: WebcamMeasurement[], observations: AuditObsDoc[], sites: AuditForecastDoc[]): string {
  if (!items.length) return '';
  const rows = items.map(m => webcamRow(m, buoyAt(m.runAt, observations)));
  const sum = summarizeWebcam(rows);
  const usable = rows.filter(r => typeof r.beach === 'number').length;
  const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.abs(Math.round((f - 1) * 100))}%`;
  const spot = items.find(m => m.forecast)?.forecast?.name || 'de cameraspot';
  const lines: string[] = [`<li>${items.length} metingen, ${usable} met bruikbaar beeld, ${sum.n} met NzSurf-verwachting, ${sum.nSea} met boeiwaarde (Maasgeul 2).</li>`];
  if (sum.n && typeof sum.mae === 'number' && typeof sum.bias === 'number') {
    lines.push(`<li>NzSurf voor ${esc(spot)} wijkt gemiddeld <b>${nl(sum.mae)} m</b> af van de webcam; bias ${signed(sum.bias)} m (${sum.bias > 0.05 ? 'NzSurf te hoog' : sum.bias < -0.05 ? 'NzSurf te laag' : 'geen duidelijke scheefheid'})${typeof sum.total === 'number' ? `, webcam ÷ NzSurf ${nl(sum.total)} (${pct(sum.total)})` : ''}.</li>`);
  }
  if (sum.nSea && typeof sum.sea === 'number') {
    lines.push(`<li>Opgesplitst: golfmodel op zee ${pct(sum.sea)} t.o.v. de boei${typeof sum.beachFactor === 'number' ? `; NzSurf-vertaling zee → strand bij deze spot ${pct(sum.beachFactor)}` : ''}${typeof sum.beachOverBuoy === 'number' ? `; aan het strand komt ~${Math.round(sum.beachOverBuoy * 100)}% van de boeihoogte` : ''}.</li>`);
  }
  // Strandhoogte tegen de webcam: alle bronnen op dezelfde webcammetingen (zelfde momenten).
  const cands = [
    { name: 'NzSurf v1', fc: rows.map(r => r.nzSpot) },
    { name: 'NzSurf v2 (live)', fc: rows.map(r => spotHeightAt(sites, 'nzsurf-v2-live', Date.parse(r.m.runAt))) },
    { name: 'NzSurf v2 (nagerekend)', fc: rows.map(r => spotHeightAt(sites, V2_SOURCE, Date.parse(r.m.runAt))) },
    { name: 'Surfline', fc: rows.map(r => siteHeightAt(sites, 'surfline', Date.parse(r.m.runAt))) },
    { name: 'surfnerd', fc: rows.map(r => siteHeightAt(sites, 'surfnerd', Date.parse(r.m.runAt))) },
  ].filter(c => c.fc.some(v => typeof v === 'number'));
  const ok = (set: typeof cands) => rows.map((r, i) => typeof r.beach === 'number' && set.every(c => typeof c.fc[i] === 'number'));
  let inc = [...cands];
  while (inc.length > 1 && ok(inc).filter(Boolean).length < 5) {
    const drop = inc.slice(1).reduce((a, c) => (c.fc.filter(v => typeof v === 'number').length < a.fc.filter(v => typeof v === 'number').length ? c : a), inc[inc.length - 1]);
    inc = inc.filter(c => c !== drop);
  }
  const mask = ok(inc);
  const nCommon = mask.filter(Boolean).length;
  const beach = nCommon >= 5 ? inc.map(c => ({ name: c.name, ...maeVsWebcam(rows.map((r, i) => (mask[i] ? { fc: c.fc[i] as number, cam: r.beach } : { fc: undefined, cam: undefined }))) }))
    .filter(x => x.n > 0).sort((a, b) => (a.mae ?? 9) - (b.mae ?? 9)) : [];
  const left = cands.filter(c => !inc.includes(c)).map(c => c.name);
  if (beach.length > 1) lines.push(`<li>Strandhoogte tegen de webcam, alle bronnen op dezelfde ${nCommon} metingen (gem. afwijking): ${beach.map(b => `${b.name} ${nl(b.mae!)} m (bias ${signed(b.bias!)})`).join(' · ')}.${left.length ? ` Niet meegenomen (te weinig gezamenlijke metingen): ${left.join(', ')}.` : ''} Surfline = brekerhoogte, surfnerd = golf op de spot (P5 en "Slufter", bij de reddingspost). Let op: de webcam schat de brekende golfwand, meestal hoger dan de significante golfhoogte.</li>`);
  const latest = rows.find(r => r.m.nearby?.length);
  const est = nearbyEstimates(latest?.m.nearby, sum.nSea >= 3 ? sum.sea : latest?.sea, sum.n >= 3 ? sum.total : latest?.total);
  const table = est.length ? `<h3>Spots binnen 20 km — laatste meting, doorgerekend</h3>
<table><thead><tr><th>Spot</th><th>Afstand</th><th>NzSurf</th><th>Gecorrigeerd</th></tr></thead><tbody>${est.map(e =>
    `<tr><td>${esc(e.snap.name)}</td><td>${nl(e.snap.distKm, 1)} km</td><td>${typeof e.nz === 'number' ? `${nl(e.nz)} m` : '–'}</td><td>${e.basis === 'geen' ? '–' : `${nl(e.corrected!)} m${e.basis === 'totaal' ? ' ~' : ''}`}</td></tr>`).join('')}</tbody></table>
<p class="meta">Alleen de afwijking van het golfmodel op zee is doorgetrokken; de strandvertaling blijft per spot die van NzSurf. ~ = nog zonder boeiwaarde, hele afwijking doorgetrokken (indicatie).</p>` : '';
  const warn = sum.n < 15 ? `<p class="warn">Nog ${sum.n} vergelijkingen: na ±15 metingen op verschillende dagen zijn deze factoren pas betrouwbaar.</p>` : '';
  return `<h2>Webcam Maasvlakte (aan het strand)</h2>
<p class="meta">Een AI schat uit 12 webcambeelden (60 s) de hoogte van de brekende golfwand. Dit is een schatting op de Maasvlakte, geen meting en niet in Ouddorp: het telt niet mee in de ranglijst hierboven (die gaat tegen de boei), maar toetst NzSurf's vertaling van zee naar strand.</p>
<ul>${lines.join('')}</ul>${warn}${table}`;
}

/** Eigen energiewaarde (kJ) van Surfline/surfnerd tegen de berekende gemeten golfkracht. */
function energyHtml(forecasts: AuditForecastDoc[], observations: AuditObsDoc[]): string {
  const sc = energyScores(forecasts, observations);
  const has = forecasts.some(f => f.points?.some(p => typeof p.energyKj === 'number'));
  if (!has) return '';
  if (!sc.length) return `<h2>Energiewaarde van Surfline en surfnerd</h2><p class="meta">Er worden energiewaarden (kJ) verzameld, maar nog minder dan ${MIN_N} met een boeimeting op hetzelfde uur.</p>`;
  const r = (x?: number) => (typeof x === 'number' && Number.isFinite(x) ? nl(x, 2) : '–');
  return `<h2>Energiewaarde van Surfline en surfnerd</h2>
<p class="meta">Hun "energy" (kJ) is een andere grootheid dan kW/m en hun formule is niet openbaar. Daarom: volgt hun getal de gemeten golfkracht (correlatie r, 1 = perfect)? En hoe groot is de fout na één vaste omrekenfactor? Ter vergelijking r van de kracht uit hun eigen hoogte en periode.</p>
<table><thead><tr><th>Bron</th><th>n</th><th>r (hun kJ)</th><th>r (uit Hs/T)</th><th>kW/m per kJ</th><th>Fout na omrekening</th></tr></thead><tbody>${sc.map(e =>
    `<tr><td>${esc(e.label)}</td><td>${e.n}</td><td><b>${r(e.rKj)}</b></td><td>${r(e.rCalc)}</td><td>${nl(e.kwPerKj, 3)}</td><td>${nl(e.mae, 1)} kW/m</td></tr>`).join('')}</tbody></table>
<p class="meta">Is r van hun kJ hoger dan r uit Hs/T, dan bevat hun energiegetal informatie die hoogte en periode alleen niet geven (bijv. meerdere swellsystemen); dan is het de moeite waard om het in NzSurf mee te wegen.</p>`;
}
