// Rapport "Duiding NzSurf": zet de cijfers van de voorspellingsaudit om in een
// leesbaar oordeel over NzSurf (ons algoritme) en het NzSurf concept (blend van
// eigen modelbronnen). Puur: geeft een zelfstandig HTML-bestand terug dat in de
// browser opent, te printen is als PDF en te delen via het deelmenu.

import {
  AuditForecastDoc, AuditObsDoc, AuditParam, PARAMS, LEAD_BUCKETS, MIN_N, MIN_REPORTS,
  Pair, Score, SpotReportLike, buildPairs, scorePairs, reportRows, summarizeReports, energyScores,
} from './forecastAudit';
import { CONCEPT_SOURCE } from './forecastBlend';
import type { WebcamMeasurement } from '../services/webcamMeasure';
import { webcamRow, summarizeWebcam, nearbyEstimates, buoyAt } from './webcamVerify';

export interface AuditReportInput {
  forecasts: AuditForecastDoc[];
  observations: AuditObsDoc[];
  reports?: SpotReportLike[];
  periodLabel: string;
  spotName?: string;
  auditSpotId?: string;
  webcam?: WebcamMeasurement[];
  now?: Date;
}

const NZ = 'nzsurf';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nl = (x: number, d = 2) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (x: number, d = 2) => (x > 0 ? '+' : '') + nl(x, d);
const decimals = (p: AuditParam) => (p === 'dir' || p === 'windDir' ? 0 : p === 'windKn' || p === 'tp' || p === 'power' ? 1 : 2);

interface ParamVerdict {
  param: AuditParam; label: string; unit: string; total: number;
  nz?: Score & { rank: number }; concept?: Score & { rank: number }; best?: Score; bestOther?: Score;
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
      nz: rankFor(sc, NZ), concept: rankFor(sc, CONCEPT_SOURCE), best: sc[0],
      bestOther: sc.find(s => s.source !== NZ && s.source !== CONCEPT_SOURCE),
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
    const nz = sc.find(s => s.source === NZ), c = sc.find(s => s.source === CONCEPT_SOURCE);
    const other = sc.find(s => s.source !== NZ && s.source !== CONCEPT_SOURCE);
    const cell = (s?: Score) => s ? `${nl(s.mae, d)} <small>#${sc.indexOf(s) + 1}</small>` : '–';
    return `<tr><td>${esc(b.label)}</td><td>${cell(nz)}</td><td>${cell(c)}</td><td>${other ? `${nl(other.mae, d)} <small>${esc(other.label)}</small>` : '–'}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<h3>${esc(prm.label)} per vooruitkijktijd (${esc(prm.unit)})</h3>
<table><thead><tr><th>Looptijd</th><th>NzSurf</th><th>Concept</th><th>Beste andere</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    return `<tr><td>${esc(s.label)}</td><td>${r(NZ)}</td><td>${r(CONCEPT_SOURCE)}</td><td>${esc(sc[0].label)} (${nl(sc[0].mae, d)} ${esc(unit)})</td><td>${sc.length}</td></tr>`;
  }).join('');
}

export function buildAuditReport(input: AuditReportInput): { title: string; html: string } {
  const now = input.now ?? new Date();
  const pairs = buildPairs(input.forecasts, input.observations);
  const vs = verdicts(pairs);
  const days = new Set(input.forecasts.map(f => f.runDate)).size;
  const obsDays = input.observations.length;
  const hasConcept = input.forecasts.some(f => f.source === CONCEPT_SOURCE);
  const latestConcept = input.forecasts.filter(f => f.source === CONCEPT_SOURCE).sort((a, b) => b.runAt.localeCompare(a.runAt))[0];

  // Kernoordeel in een paar zinnen.
  const top = (src: 'nz' | 'concept') => vs.filter(v => v[src]?.rank === 1).map(v => v.label.toLowerCase());
  const weak = (src: 'nz' | 'concept') => vs.filter(v => v[src] && v[src]!.rank > Math.ceil(v.total * 2 / 3)).map(v => v.label.toLowerCase());
  const headToHead = vs.filter(v => v.nz && v.concept).map(v => ({ v, conceptBetter: v.concept!.mae < v.nz!.mae }));
  const takeOver = headToHead.filter(h => h.conceptBetter).map(h => h.v.label.toLowerCase());
  const keep = headToHead.filter(h => !h.conceptBetter).map(h => h.v.label.toLowerCase());
  const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} en ${xs[xs.length - 1]}`;

  const summary: string[] = [];
  if (top('nz').length) summary.push(`NzSurf is de beste bron op ${list(top('nz'))}.`);
  const nearTop = vs.filter(v => v.nz && v.nz.rank > 1 && v.best && v.nz.mae <= v.best.mae * 1.1).map(v => v.label.toLowerCase());
  if (nearTop.length) summary.push(`Op ${list(nearTop)} zit NzSurf binnen 10% van de beste bron.`);
  if (weak('nz').length) summary.push(`NzSurf scoort zwak op ${list(weak('nz'))}.`);
  if (hasConcept && top('concept').length) summary.push(`Het NzSurf concept (alleen eigen modelbronnen) is de beste bron op ${list(top('concept'))}.`);
  if (takeOver.length) summary.push(`Het concept is beter dan het huidige NzSurf op ${list(takeOver)}: kandidaat om daar over te nemen.`);
  if (keep.length && hasConcept) summary.push(`Op ${list(keep)} blijft het huidige NzSurf beter.`);
  // Per looptijd: waar is het concept de beste van allemaal?
  if (hasConcept) for (const prm of PARAMS) {
    const wins = LEAD_BUCKETS.filter(b => {
      const sc = scorePairs(pairs.filter(x => x.param === prm.key && x.bucket === b.key)).filter(x => x.n >= MIN_N);
      return sc[0]?.source === CONCEPT_SOURCE;
    }).map(b => b.label.split(' (')[0].toLowerCase());
    if (wins.length && !top('concept').includes(prm.label.toLowerCase())) summary.push(`Het concept is de beste bron voor ${prm.label.toLowerCase()} op ${list(wins)}.`);
  }
  if (!summary.length) summary.push('Nog te weinig vergelijkingen voor een oordeel.');

  const maturity = days < 28
    ? `<p class="warn"><b>Voorlopig oordeel.</b> ${days} ophaaldagen; pas na ongeveer 4–6 weken met verschillende weertypes (westelijke en noordelijke swell, rustig en storm) is de ranglijst stabiel. Het concept leert ook nog: zijn correctie wordt sterker naarmate er meer dagen zijn.</p>`
    : `<p class="ok">${days} ophaaldagen: genoeg voor een stabiel oordeel, mits er verschillende weertypes in zaten.</p>`;

  const verdictRows = vs.map(v => {
    const d = decimals(v.param);
    const cell = (s?: Score & { rank: number }) => s ? `<b>#${s.rank}</b>/${v.total}<br><small>${nl(s.mae, d)} ${esc(v.unit)} · bias ${signed(s.bias, d)}</small>` : '–';
    return `<tr><td><b>${esc(v.label)}</b></td><td>${cell(v.nz)}</td><td>${hasConcept ? cell(v.concept) : '–'}</td><td>${v.best ? `${esc(v.best.label)}<br><small>${nl(v.best.mae, d)} ${esc(v.unit)}</small>` : '–'}</td></tr>
<tr class="note"><td></td><td>${esc(judge(v.nz, v))}</td><td>${hasConcept ? esc(judge(v.concept, v)) : ''}</td><td></td></tr>`;
  }).join('');

  // Spotrapporten: zegt de surfkans iets over wat je op het strand zag?
  let reportSection = '';
  if (input.reports?.length) {
    const rs = summarizeReports(reportRows(input.reports, input.forecasts, input.auditSpotId));
    const lines: string[] = [];
    if (rs.chance && rs.chance.n >= MIN_REPORTS) {
      lines.push(`<li>NzSurf-kans klopt met je eigen oordeel ("werkt" bij ≥ 45%) in <b>${rs.chance.agree}%</b> van ${rs.chance.n} rapporten${rs.breakfinder && rs.breakfinder.n >= MIN_REPORTS ? `; breakfinder ${rs.breakfinder.agree}% (${rs.breakfinder.n} rapporten)` : ''}.</li>`);
    }
    if (rs.wave && rs.wave.n >= MIN_REPORTS) {
      lines.push(`<li>Golfhoogte op de spot wijkt gemiddeld ${nl(rs.wave.maeSpot)} m af van de foto, tegen ${nl(rs.wave.maeSea)} m voor de hoogte op zee: ${rs.wave.maeSpot < rs.wave.maeSea ? 'de vertaling naar de spot helpt' : 'de vertaling naar de spot maakt het niet beter; herzien'}.</li>`);
    }
    reportSection = lines.length
      ? `<h2>Surfkans getoetst aan spotrapporten</h2><ul>${lines.join('')}</ul>`
      : `<h2>Surfkans getoetst aan spotrapporten</h2><p>Minder dan ${MIN_REPORTS} bruikbare rapporten. De kans en de spothoogte zijn alleen met eigen waarnemingen te toetsen: blijf rapporten maken (foto + oordeel).</p>`;
  }

  const conditions = conditionRows(pairs);
  const webcamSection = webcamHtml(input.webcam || [], input.observations);
  const energySection = energyHtml(input.forecasts, input.observations);
  const title = `Duiding NzSurf — ${now.toISOString().slice(0, 10)}`;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:860px;margin:0 auto;padding:20px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 8px;border-bottom:2px solid #0891b2;padding-bottom:3px}h3{font-size:14px;margin:16px 0 6px}
.meta{color:#64748b;font-size:12px}table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9}
tr.note td{color:#475569;font-size:12px;border-bottom:2px solid #cbd5e1}small{color:#64748b}
.sum{background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:10px 14px}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;font-size:13px}
.ok{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:8px 12px;font-size:13px}ul{padding-left:18px}li{margin:4px 0}
@media print{body{padding:0}h2{break-after:avoid}table{break-inside:avoid}}
</style></head><body>
<h1>Duiding NzSurf${input.spotName ? ` — ${esc(input.spotName)}` : ''}</h1>
<p class="meta">Gemaakt ${esc(now.toLocaleString('nl-NL'))} · periode ${esc(input.periodLabel)} · ${days} ophaaldagen · ${obsDays} meetdagen · ${pairs.length} vergelijkingen · alleen vakken met ≥ ${MIN_N} vergelijkingen tellen mee</p>

<h2>Kernoordeel</h2>
<div class="sum"><ul>${summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
${maturity}

<h2>Per onderdeel</h2>
<p class="meta">Rang en gemiddelde afwijking (MAE) t.o.v. de RWS-metingen. Bias = gemiddeld te hoog (+) of te laag (−).</p>
<table><thead><tr><th>Onderdeel</th><th>NzSurf</th><th>NzSurf concept</th><th>Beste bron</th></tr></thead><tbody>${verdictRows}</tbody></table>

<h2>Hoe ver vooruit is het betrouwbaar?</h2>
${bucketTable(pairs, 'hs')}${bucketTable(pairs, 'power')}${bucketTable(pairs, 'windKn')}${bucketTable(pairs, 'windDir')}

${conditions ? `<h2>Als het ertoe doet</h2>
<p class="meta">Dezelfde toets, alleen op momenten met golf van betekenis of harde wind. Hier wordt een surfverwachting op afgerekend.</p>
<table><thead><tr><th>Omstandigheid</th><th>NzSurf</th><th>Concept</th><th>Beste</th><th>Bronnen</th></tr></thead><tbody>${conditions}</tbody></table>` : ''}

${latestConcept ? `<h2>Waar het concept op leunt</h2><p>${esc(latestConcept.note || '')}</p>
<p class="meta">Het concept rekent per ophaaldag alleen met runs en metingen van vóór die dag; de gewichten verschuiven naar de bron die recent het best presteerde.</p>` : ''}

${energySection}

${reportSection}

${webcamSection}

<h2>Wat dit rapport niet zegt</h2>
<ul>
<li><b>Boei ≠ strand.</b> De meting is op zee (Maasgeul/Schouwenbank). Hoogtes op de spot en de surfkans zijn alleen met spotrapporten en de webcam (AI-schatting, Maasvlakte) te toetsen.</li>
<li><b>Wind op Europlatform</b> waait harder dan aan de kust; alle bronnen lijken daardoor te laag. Vergelijk de rangorde, niet de absolute fout.</li>
<li><b>Periode:</b> modellen geven de piekperiode (Tp), de boei de gemiddelde (Tm02). Een vaste afwijking is dus normaal.</li>
<li><b>Golfkracht</b> is berekend (0,49 × Hs² × 1,2 × T), niet gemeten; sites die een piekperiode geven i.p.v. een gemiddelde komen daardoor hoger uit.</li>
<li><b>Dubbelingen:</b> Open-Meteo best match is golf van Météo-France en wind van KNMI; telt niet als aparte stem.</li>
</ul>
</body></html>`;
  return { title, html };
}

/** Sectie webcam Maasvlakte: NzSurf getoetst aan wat er aan het strand aankomt (AI-schatting). */
function webcamHtml(items: WebcamMeasurement[], observations: AuditObsDoc[]): string {
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
