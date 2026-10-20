// Rapport "Duiding NzSurf": zet de cijfers van de voorspellingsaudit om in een
// leesbaar oordeel over NzSurf (ons algoritme) en het NzSurf concept (blend van
// eigen modelbronnen). Puur: geeft een zelfstandig HTML-bestand terug dat in de
// browser opent, te printen is als PDF en te delen via het deelmenu.

import {
  AuditForecastDoc, AuditObsDoc, AuditParam, PARAMS, LEAD_BUCKETS, MIN_N, MIN_REPORTS,
  Pair, Score, SpotReportLike, buildPairs, scorePairs, reportRows, summarizeReports, energyScores,
} from './forecastAudit';
import { CONCEPT_SOURCE } from './forecastBlend';
import { HYBRID_SOURCE, HYBRID_RULES } from './forecastHybrid';
import type { WebcamMeasurement } from '../services/webcamMeasure';
import { webcamRow, summarizeWebcam, nearbyEstimates, buoyAt, siteHeightAt, maeVsWebcam } from './webcamVerify';
import { barChart, lineChart, timeChart, pctChart, C, BarRow } from './reportCharts';
import { DEFAULT_RULE, componentScores, componentRanking, combinedTruth, obsTruth, reportTruth } from './surfVerdict';

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
const OURS = [NZ, CONCEPT_SOURCE, HYBRID_SOURCE];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nl = (x: number, d = 2) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (x: number, d = 2) => (x > 0 ? '+' : '') + nl(x, d);
const decimals = (p: AuditParam) => (p === 'dir' || p === 'windDir' ? 0 : p === 'windKn' || p === 'tp' || p === 'power' ? 1 : 2);

interface ParamVerdict {
  param: AuditParam; label: string; unit: string; total: number;
  nz?: Score & { rank: number }; concept?: Score & { rank: number }; hybrid?: Score & { rank: number }; best?: Score; bestOther?: Score;
}

function rankFor(scores: Score[], source: string) {
  const i = scores.findIndex(s => s.source === source);
  return i < 0 ? undefined : { ...scores[i], rank: i + 1 };
}

function verdicts(pairs: Pair[]): ParamVerdict[] {
  return PARAMS.map(p => {
    const sc = scorePairs(pairs.filter(x => x.param === p.key)).filter(s => s.n >= MIN_N);
    return {
      param: p.key, label: p.label, unit: p.unit, total: sc.length,
      nz: rankFor(sc, NZ), concept: rankFor(sc, CONCEPT_SOURCE), hybrid: rankFor(sc, HYBRID_SOURCE), best: sc[0],
      bestOther: sc.find(s => !OURS.includes(s.source)),
    };
  }).filter(v => v.total > 0);
}

/** Eén zin oordeel voor een bron op een onderdeel. */
function judge(s: (Score & { rank: number }) | undefined, v: ParamVerdict): string {
  if (!s) return 'Nog te weinig vergelijkingen.';
  const d = decimals(v.param), parts: string[] = [];
  const ref = v.bestOther && v.bestOther.source !== s.source ? v.bestOther : undefined;
  if (s.rank === 1) parts.push(`Beste van ${v.total} bronnen.`);
  else if (v.best && s.mae <= v.best.mae * 1.1) parts.push(`Op het niveau van de top (#${s.rank} van ${v.total}, binnen 10% van ${v.best.label}).`);
  else if (s.rank <= Math.ceil(v.total / 3)) parts.push(`Bovenin (#${s.rank} van ${v.total}).`);
  else if (s.rank > Math.ceil(v.total * 2 / 3)) parts.push(`Onderin (#${s.rank} van ${v.total}); hier valt het meest te winnen.`);
  else parts.push(`Middenmoot (#${s.rank} van ${v.total}).`);
  if (ref && s.rank !== 1) parts.push(`Beste andere bron: ${ref.label} (${nl(ref.mae, d)} ${v.unit}).`);
  if (v.param !== 'dir' && v.param !== 'windDir' && Math.abs(s.bias) >= Math.max(0.5 * s.mae, 0.05)) {
    parts.push(`Structureel te ${s.bias > 0 ? 'hoog' : 'laag'} (${signed(s.bias, d)} ${v.unit}); met een vaste correctie te verbeteren.`);
  }
  return parts.join(' ');
}

function bucketTable(pairs: Pair[], param: AuditParam): string {
  const prm = PARAMS.find(p => p.key === param)!, d = decimals(param);
  const rows = LEAD_BUCKETS.map(b => {
    const sc = scorePairs(pairs.filter(p => p.param === param && p.bucket === b.key)).filter(s => s.n >= MIN_N);
    if (!sc.length) return '';
    const nz = sc.find(s => s.source === NZ), c = sc.find(s => s.source === CONCEPT_SOURCE), h = sc.find(s => s.source === HYBRID_SOURCE);
    const other = sc.find(s => !OURS.includes(s.source));
    const cell = (s?: Score) => s ? `${nl(s.mae, d)} <small>#${sc.indexOf(s) + 1}</small>` : '–';
    return `<tr><td>${esc(b.label)}</td><td>${cell(nz)}</td><td>${cell(c)}</td><td>${cell(h)}</td><td>${other ? `${nl(other.mae, d)} <small>${esc(other.label)}</small>` : '–'}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<h3>${esc(prm.label)} per vooruitkijktijd (${esc(prm.unit)})</h3>
<table><thead><tr><th>Looptijd</th><th>NzSurf</th><th>Concept</th><th>Hybride</th><th>Beste andere</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Hoe doen ze het juist als het ertoe doet (golf van betekenis, harde wind)? */
function conditionRows(pairs: Pair[]): string {
  const sets = [
    { label: 'Golf ≥ 1 m (gemeten)', f: (p: Pair) => (p.obsHs ?? 0) >= 1, param: 'hs' as AuditParam },
    { label: 'Wind ≥ 16 kn (gemeten)', f: (p: Pair) => (p.obsWindKn ?? 0) >= 16, param: 'windKn' as AuditParam },
    { label: 'Wind < 10 kn (gemeten), windrichting', f: (p: Pair) => (p.obsWindKn ?? 99) < 10, param: 'windDir' as AuditParam },
  ];
  return sets.map(s => {
    const sc = scorePairs(pairs.filter(p => p.param === s.param && s.f(p))).filter(x => x.n >= MIN_N);
    if (!sc.length) return '';
    const d = decimals(s.param), unit = PARAMS.find(p => p.key === s.param)!.unit;
    const r = (src: string) => { const i = sc.findIndex(x => x.source === src); return i < 0 ? '–' : `#${i + 1} (${nl(sc[i].mae, d)})`; };
    return `<tr><td>${esc(s.label)}</td><td>${r(NZ)}</td><td>${r(CONCEPT_SOURCE)}</td><td>${r(HYBRID_SOURCE)}</td><td>${esc(sc[0].label)} (${nl(sc[0].mae, d)} ${esc(unit)})</td><td>${sc.length}</td></tr>`;
  }).join('');
}


const roleOf = (source: string, bestOther?: string): BarRow['role'] =>
  source === NZ ? 'nz' : source === HYBRID_SOURCE ? 'hybrid' : source === bestOther ? 'best' : 'other';
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} en ${xs[xs.length - 1]}`;

interface SpotResult { html: string; vs: ParamVerdict[]; days: number; pairs: number; name: string; appendix: string }

/** Hoofdstuk voor één spot: oordeel, grafieken en tabellen. */
function spotSection(spot: ReportSpot, observations: AuditObsDoc[], reports: SpotReportLike[] | undefined, withReports: boolean): SpotResult {
  const forecasts = spot.forecasts;
  const pairs = buildPairs(forecasts, observations);
  const vs = verdicts(pairs);
  const days = new Set(forecasts.map(f => f.runDate)).size;
  const hasConcept = forecasts.some(f => f.source === CONCEPT_SOURCE);
  const latestConcept = forecasts.filter(f => f.source === CONCEPT_SOURCE).sort((a, b) => b.runAt.localeCompare(a.runAt))[0];
  const hasHybrid = forecasts.some(f => f.source === HYBRID_SOURCE);
  const latestHybrid = forecasts.filter(f => f.source === HYBRID_SOURCE).sort((a, b) => b.runAt.localeCompare(a.runAt))[0];
  const labelOf = new Map(forecasts.map(f => [f.source, f.label]));
  if (!pairs.length) {
    return { appendix: '', html: `<section class="spot"><h2 class="spot-h">${esc(spot.name)}</h2><p class="warn">Nog geen verwachtingen met een meting op hetzelfde uur. ${days ? `${days} ophaaldag(en) vastgelegd; ` : ''}de eerste vergelijkingen verschijnen zodra de boei de voorspelde uren heeft gemeten.</p></section>`, vs, days, pairs: 0, name: spot.name };
  }

  // Kernoordeel.
  const top = (src: 'nz' | 'concept' | 'hybrid') => vs.filter(v => v[src]?.rank === 1).map(v => v.label.toLowerCase());
  const weak = vs.filter(v => v.nz && v.nz.rank > Math.ceil(v.total * 2 / 3)).map(v => v.label.toLowerCase());
  const nearTop = vs.filter(v => v.nz && v.nz.rank > 1 && v.best && v.nz.mae <= v.best.mae * 1.1).map(v => v.label.toLowerCase());
  const summary: string[] = [];
  if (top('nz').length) summary.push(`NzSurf is de beste bron op ${list(top('nz'))}.`);
  if (nearTop.length) summary.push(`Op ${list(nearTop)} zit NzSurf binnen 10% van de beste bron.`);
  if (weak.length) summary.push(`NzSurf scoort zwak op ${list(weak)}.`);
  if (hasHybrid) {
    const hv = vs.filter(v => v.hybrid && v.nz);
    const avg = (k: 'nz' | 'hybrid') => hv.reduce((a, v) => a + v[k]!.rank, 0) / (hv.length || 1);
    const better = hv.filter(v => v.hybrid!.mae < v.nz!.mae).map(v => v.label.toLowerCase());
    const worse = hv.filter(v => v.hybrid!.mae > v.nz!.mae * 1.02).map(v => v.label.toLowerCase());
    if (hv.length) summary.push(`NzSurf hybride: gemiddelde rang ${nl(avg('hybrid'), 1)} tegen ${nl(avg('nz'), 1)} voor NzSurf${top('hybrid').length ? `; beste bron op ${list(top('hybrid'))}` : ''}.`);
    if (better.length) summary.push(`De hybride is beter dan NzSurf op ${list(better)}${worse.length ? `, slechter op ${list(worse)}` : ''}.`);
  }
  if (hasConcept && top('concept').length) summary.push(`Het NzSurf concept is de beste bron op ${list(top('concept'))}.`);
  if (!summary.length) summary.push('Nog te weinig vergelijkingen voor een oordeel.');
  const maturity = days < 28
    ? `<p class="warn"><b>Voorlopig oordeel.</b> ${days} ophaaldagen; pas na ongeveer 4–6 weken met verschillende weertypes is de ranglijst stabiel.</p>`
    : `<p class="ok">${days} ophaaldagen: genoeg voor een stabiel oordeel, mits er verschillende weertypes in zaten.</p>`;

  // Grafieken: afwijking per bron.
  const barsFor = (param: AuditParam) => {
    const v = vs.find(x => x.param === param);
    if (!v) return '';
    const sc = scorePairs(pairs.filter(p => p.param === param)).filter(x => x.n >= MIN_N);
    return barChart(`${v.label}: afwijking per bron`, v.unit, sc.map(x => ({ label: x.label, value: x.mae, role: roleOf(x.source, v.bestOther?.source) })), decimals(param));
  };

  // Grafieken: per looptijd (NzSurf, hybride, beste andere bron over de hele periode).
  const leadFor = (param: AuditParam) => {
    const v = vs.find(x => x.param === param);
    if (!v) return '';
    const val = (src?: string) => LEAD_BUCKETS.map(b => {
      if (!src) return undefined;
      const sc = scorePairs(pairs.filter(p => p.param === param && p.bucket === b.key && p.source === src));
      return sc[0] && sc[0].n >= MIN_N ? sc[0].mae : undefined;
    });
    return lineChart(`${v.label} per looptijd`, `gem. afwijking, ${v.unit}`, LEAD_BUCKETS.map(b => b.label.replace(/ \(.*\)/, '').replace('Dag ', 'd')), [
      { name: 'NzSurf', color: C.nz, values: val(NZ) },
      { name: 'Hybride', color: C.hybrid, values: val(hasHybrid ? HYBRID_SOURCE : undefined) },
      { name: v.bestOther ? v.bestOther.label.split(' (')[0] : 'Beste andere', color: C.best, values: val(v.bestOther?.source), dashed: true },
    ], decimals(param));
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
  const obsSeries = (() => {
    const byT = new Map<number, number>();
    for (const p of pairs) if (p.param === 'hs') byT.set(Date.parse(p.t), p.obs);
    return [...byT.entries()].map(([t, v]) => ({ t, v }));
  })();
  const time = timeChart('Golfhoogte: gemeten en voorspeld (dag 1)', 'm', [
    { name: 'Gemeten (boei)', color: C.obs, points: obsSeries, width: 2.5 },
    { name: 'NzSurf', color: C.nz, points: series(NZ) },
    ...(hasHybrid ? [{ name: 'Hybride', color: C.hybrid, points: series(HYBRID_SOURCE) }] : []),
  ]);

  // Te surfen? — gebalanceerde score (werkelijkheid: spotrapporten, anders de boeiregel).
  const truth = combinedTruth(reportTruth(reports || [], spot.id), obsTruth(observations, DEFAULT_RULE));
  const surfRank = componentRanking(componentScores(forecasts, observations, DEFAULT_RULE, truth), 'total').filter(r => r.n >= MIN_N);
  const bestSurfOther = surfRank.find(r => !OURS.includes(r.source))?.source;
  const surfChart = pctChart('Te surfen?: gebalanceerde score', surfRank.map(r => ({
    label: labelOf.get(r.source) || r.source, pct: r.pct, role: roleOf(r.source, bestSurfOther),
    sub: r.caught !== undefined ? `gevangen ${r.caught}% · terecht nee ${r.rightNo ?? '–'}% · zegt ja ${r.saysYes ?? '–'}%` : undefined,
  })), 'Gemiddelde van "surfbare momenten gevangen" en "terecht nee"; wie altijd nee zegt, komt op 50% (stippellijn). Werkelijkheid: spotrapporten, anders de regel op de boei (golf ≥ 0,6 m, periode ≥ 5 s, wind ≤ 16 kn aanlandig / 20 kn anders). Let op: de boei beschrijft de zee, niet het strand. Bronnen die de zee of de hele kust beoordelen (zoals Wompy) passen daar vanzelf beter bij dan een bron die naar de spot vertaalt (NzSurf dempt voor de Voordelta). De eerlijke toets voor het strand is de webcam en je spotrapporten (Beta: kans tegen werkelijkheid).');

  const verdictRows = vs.map(v => {
    const d = decimals(v.param);
    const cell = (x?: Score & { rank: number }) => x ? `<b>#${x.rank}</b>/${v.total}<br><small>${nl(x.mae, d)} ${esc(v.unit)} · bias ${signed(x.bias, d)}</small>` : '–';
    return `<tr><td><b>${esc(v.label)}</b></td><td>${cell(v.nz)}</td><td>${hasHybrid ? cell(v.hybrid) : '–'}</td><td>${hasConcept ? cell(v.concept) : '–'}</td><td>${v.best ? `${esc(v.best.label)}<br><small>${nl(v.best.mae, d)} ${esc(v.unit)}</small>` : '–'}</td></tr>
<tr class="note"><td></td><td colspan="4">${esc(judge(v.nz, v))}</td></tr>`;
  }).join('');

  let reportSection = '';
  if (withReports && reports?.length) {
    const rs = summarizeReports(reportRows(reports, forecasts, spot.id));
    const lines: string[] = [];
    if (rs.chance && rs.chance.n >= MIN_REPORTS) lines.push(`<li>NzSurf-kans klopt met je eigen oordeel in <b>${rs.chance.agree}%</b> van ${rs.chance.n} rapporten${rs.breakfinder && rs.breakfinder.n >= MIN_REPORTS ? `; breakfinder ${rs.breakfinder.agree}%` : ''}.</li>`);
    if (rs.wave && rs.wave.n >= MIN_REPORTS) lines.push(`<li>Hoogte op de spot wijkt ${nl(rs.wave.maeSpot)} m af van de foto, de hoogte op zee ${nl(rs.wave.maeSea)} m.</li>`);
    reportSection = `<h3>Spotrapporten</h3>${lines.length ? `<ul>${lines.join('')}</ul>` : `<p class="meta">Minder dan ${MIN_REPORTS} bruikbare rapporten.</p>`}`;
  }

  const conditions = conditionRows(pairs);
  const energy = energyHtml(forecasts, observations);
  const html = `<section class="spot">
<h2 class="spot-h">${esc(spot.name)}</h2>
<p class="meta">${days} ophaaldagen · ${pairs.length} vergelijkingen · meting: ${esc(spot.buoyNote)}</p>
<div class="sum"><ul>${summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
${maturity}

<h3>Per onderdeel</h3>
<p class="meta">Rang en gemiddelde afwijking t.o.v. de metingen. Bias = gemiddeld te hoog (+) of te laag (−).</p>
<table><thead><tr><th>Onderdeel</th><th>NzSurf</th><th>Hybride</th><th>Concept</th><th>Beste bron</th></tr></thead><tbody>${verdictRows}</tbody></table>

<div class="legend"><span><i style="background:${C.nz}"></i>NzSurf</span><span><i style="background:${C.hybrid}"></i>Hybride</span><span><i style="background:${C.best}"></i>Beste andere bron</span><span><i style="background:${C.other}"></i>Overige</span></div>
${barsFor('hs')}
${barsFor('windKn')}

<h3>Hoe ver vooruit is het betrouwbaar?</h3>
<div class="pair">${leadFor('hs')}${leadFor('windKn')}</div>
${bucketTable(pairs, 'hs')}${bucketTable(pairs, 'power')}${bucketTable(pairs, 'windKn')}

${time}

<h3>Te surfen?</h3>
${surfChart}

${conditions ? `<h3>Als het ertoe doet</h3>
<table><thead><tr><th>Omstandigheid</th><th>NzSurf</th><th>Concept</th><th>Hybride</th><th>Beste</th><th>Bronnen</th></tr></thead><tbody>${conditions}</tbody></table>` : ''}

${latestHybrid ? `<h3>NzSurf hybride: de regels</h3><p>${esc(HYBRID_RULES)}.</p><p class="meta">${esc((latestHybrid.note || '').replace(`Regels: ${HYBRID_RULES}. `, ''))}</p>` : ''}
${latestConcept ? `<h3>Waar het concept op leunt</h3><p class="meta">${esc(latestConcept.note || '')}</p>` : ''}
${energy.replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>')}
${reportSection}
</section>`;
  // Bijlage: alle ranglijsten van deze spot.
  const appendixTables = PARAMS.map(prm => {
    const sc = scorePairs(pairs.filter(p => p.param === prm.key));
    if (!sc.length) return '';
    const d = decimals(prm.key);
    const ok = sc.filter(x => x.n >= MIN_N), few = sc.filter(x => x.n < MIN_N);
    const row = (x: Score, i: number | null) => `<tr class="${OURS.includes(x.source) ? 'ours' : ''}${i === null ? ' few' : ''}"><td>${i === null ? '–' : i + 1}</td><td>${esc(x.label)}</td><td>${nl(x.mae, d)}</td><td>${signed(x.bias, d)}</td><td>${nl(x.rmse, d)}</td><td>${x.n}</td></tr>`;
    return `<h3>${esc(prm.label)} (${esc(prm.unit)})</h3>
<table class="rank"><thead><tr><th>#</th><th>Bron</th><th>Gem. afwijking</th><th>Bias</th><th>RMSE</th><th>n</th></tr></thead><tbody>${ok.map((x, i) => row(x, i)).join('')}${few.map(x => row(x, null)).join('')}</tbody></table>`;
  }).join('');
  const surfTable = surfRank.length ? `<h3>Te surfen? (gebalanceerd)</h3>
<table class="rank"><thead><tr><th>#</th><th>Bron</th><th>Score</th><th>Gevangen</th><th>Terecht nee</th><th>Zegt ja</th><th>n</th></tr></thead><tbody>${surfRank.map((r, i) =>
    `<tr class="${OURS.includes(r.source) ? 'ours' : ''}"><td>${i + 1}</td><td>${esc(labelOf.get(r.source) || r.source)}</td><td><b>${r.pct}%</b></td><td>${r.caught ?? '–'}%</td><td>${r.rightNo ?? '–'}%</td><td>${r.saysYes ?? '–'}%</td><td>${r.n}</td></tr>`).join('')}</tbody></table>` : '';
  const appendix = appendixTables || surfTable ? `<section class="spot"><h2 class="spot-h">Bijlage — ${esc(spot.name)}: alle ranglijsten</h2>
<p class="meta">Alle bronnen per onderdeel, gesorteerd op gemiddelde afwijking (lager = beter). Bias: + = te hoog, − = te laag. RMSE weegt grote missers zwaarder. Bronnen met minder dan ${MIN_N} vergelijkingen staan grijs onderaan zonder rang. Vet = NzSurf, hybride en concept.</p>
${surfTable}${appendixTables}</section>` : '';
  return { html, vs, days, pairs: pairs.length, name: spot.name, appendix };
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

  // In één oogopslag: per onderdeel de rang van NzSurf en de hybride per spot.
  const glanceRows = PARAMS.map(p => {
    const cells = results.map(r => {
      const v = r.vs.find(x => x.param === p.key);
      if (!v) return '<td>–</td><td>–</td><td>–</td>';
      return `<td>${v.nz ? `#${v.nz.rank}` : '–'}</td><td>${v.hybrid ? `#${v.hybrid.rank}` : '–'}</td><td><small>${v.best ? esc(v.best.label.split(' (')[0]) : '–'}</small></td>`;
    }).join('');
    return `<tr><td><b>${esc(p.label)}</b></td>${cells}</tr>`;
  }).join('');
  const glance = `<table class="glance"><thead><tr><th rowspan="2">Onderdeel</th>${results.map(r => `<th colspan="3">${esc(r.name)}</th>`).join('')}</tr>
<tr>${results.map(() => '<th>NzSurf</th><th>Hybride</th><th>Beste</th>').join('')}</tr></thead><tbody>${glanceRows}</tbody></table>
<p class="meta">Rang onder alle bronnen met ≥ ${MIN_N} vergelijkingen (1 = beste). Per spot verschilt het aantal bronnen.</p>`;

  const webcam = webcamHtml(input.webcam || [], input.observations, input.webcamSites || []);
  const title = `Duiding NzSurf — ${now.toISOString().slice(0, 10)}`;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head><body>
<h1>Duiding NzSurf — ${esc(results.map(r => r.name).join(' & '))}</h1>
<p class="meta">Gemaakt ${esc(now.toLocaleString('nl-NL'))} · ${esc(input.periodLabel)} · ${input.observations.length} meetdagen · alleen vakken met ≥ ${MIN_N} vergelijkingen tellen mee</p>

<h2>In één oogopslag</h2>
${glance}

${results.map(r => r.html).join('\n')}

${webcam ? `<section class="spot">${webcam}</section>` : ''}

<h2>Wat dit rapport niet zegt</h2>
<ul>
<li><b>Boei ≠ strand.</b> De meting is op zee (Maasgeul 2, oudere dagen Schouwenbank): voor de Maasvlakte ±5 km, voor Ouddorp 20 km. Hoogtes op de spot en de surfkans zijn alleen met spotrapporten en de webcam te toetsen.</li>
<li><b>Wind op Europlatform</b> waait harder dan aan de kust; alle bronnen lijken daardoor te laag. Vergelijk de rangorde, niet de absolute fout.</li>
<li><b>Periode:</b> de boei meet de gemiddelde periode (Tm02); een vaste afwijking is normaal.</li>
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
  const beach = [
    { name: 'NzSurf', ...maeVsWebcam(rows.map(r => ({ fc: r.nzSpot, cam: r.beach }))) },
    { name: 'Surfline', ...maeVsWebcam(rows.map(r => ({ fc: siteHeightAt(sites, 'surfline', Date.parse(r.m.runAt)), cam: r.beach }))) },
    { name: 'surfnerd', ...maeVsWebcam(rows.map(r => ({ fc: siteHeightAt(sites, 'surfnerd', Date.parse(r.m.runAt)), cam: r.beach }))) },
  ].filter(x => x.n > 0).sort((a, b) => (a.mae ?? 9) - (b.mae ?? 9));
  if (beach.length > 1) lines.push(`<li>Strandhoogte tegen de webcam (gem. afwijking): ${beach.map(b => `${b.name} ${nl(b.mae!)} m (n=${b.n}, bias ${signed(b.bias!)})`).join(' · ')}. Surfline = brekerhoogte, surfnerd = golf op de spot, surfnerd P5 en Surfline "Slufter", bij de reddingspost.</li>`);
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
