// NzSurf v2 — opvolger van NzSurf hybride en NzSurf concept (Beta-audit).
//
// Alleen open modeldata (DWD, Météo-France, ECMWF, GFS, KNMI via Open-Meteo, plus het eigen
// NzSurf-model) en metingen (boeien en windstation van Rijkswaterstaat). Commerciële sites
// (Surfline, Windfinder, Wompy, …) zijn alleen meetlat, nooit invoer.
//
// Laag 1 — zee: per onderdeel de bron(nen) die zich tegen de metingen bewezen hebben,
//   elk eerst gekalibreerd (meting ≈ a + b × verwachting, per vooruitkijkklasse, rollend
//   venster, alleen metingen van vóór het ophaalmoment):
//     golfhoogte   = gewogen DWD, Météo-France en NzSurf (ECMWF niet: bias −0,76 m)
//     periode      = gewogen Météo-France en NzSurf
//     swellrichting= DWD (anders NzSurf), niet gekalibreerd
//     windsnelheid = per vooruitkijkklasse de ene bron met de kleinste fout na kalibratie
//                    (standaard GFS); niet mengen, want een slechte bron trekt het gemiddelde mee
//     windrichting = gewogen Météo-France, KNMI, GFS en NzSurf
// Laag 2 — bijsturen met de laatste meting: de fout van laag 1 op het laatst gemeten uur
//   (minstens een uur vóór het ophaalmoment, zoals die er op dat moment echt was) wordt
//   meegenomen en dooft uit (halfwaardetijd golf/periode 9 u, wind 4 u, windrichting 3 u).
//   Modelfouten houden uren aan; dit helpt vooral "vandaag" en "morgenochtend".
// Laag 3 — strand: NzSurf's eigen vertaling zee → spot (blootstelling, Voordelta, getij),
//   toegepast op de v2-zeehoogte. Of dat klopt toetsen de webcam en de spotrapporten.
//   Een eigen strandkalibratie volgt als daar genoeg metingen voor zijn.

import { AuditForecastDoc, AuditObsDoc, AuditPoint, ObsPoint, cleanObservations } from './forecastAudit';
import { BlendVar, blendForecast, learnSkill, BLEND_DEFAULTS } from './forecastBlend';

export const V2_SOURCE = 'nzsurf-v2';
export const V2_LABEL = 'NzSurf v2';
export const V2_RULES = 'zee: golfhoogte = DWD, Météo-France en NzSurf gewogen (elk gekalibreerd op de boei) · periode = Météo-France en NzSurf · swellrichting = DWD · windsnelheid = de bron met de kleinste fout na kalibratie (standaard GFS) · windrichting = Météo-France, KNMI, GFS en NzSurf gewogen · eerste uren bijgestuurd met de laatste meting (uitdovend) · strand = NzSurf-strandvertaling op de v2-zeehoogte';

const NZ = 'nzsurf';
const HS_SOURCES = ['dwd', 'meteofrance', NZ];
const TP_SOURCES = ['meteofrance', NZ];
const WDIR_SOURCES = ['meteofrance', 'knmi', 'gfs', NZ];
const WIND_CANDIDATES = ['gfs', NZ, 'knmi', 'dwd', 'meteofrance', 'ecmwf'];
const WIND_DEFAULT = 'gfs';
const WIND_MIN_PAIRS = 40;        // pas wisselen van windbron met genoeg bewijs
const HALF_LIFE_H = { hs: 9, tp: 9, windKn: 4, windDir: 3 };
const OBS_LATENCY_MS = 3_600_000; // meting moet er op het ophaalmoment al zijn
const OBS_MAX_AGE_MS = 6 * 3_600_000;

const SOURCE_NAMES: Record<string, string> = { dwd: 'DWD', meteofrance: 'Météo-France', ecmwf: 'ECMWF', gfs: 'GFS', knmi: 'KNMI', [NZ]: 'NzSurf' };
const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const nl = (x: number, d = 2) => String(r(x, d)).replace('.', ',');
const hourKey = (t: number) => Math.round(t / 3_600_000);
const bucketIndex = (leadH: number) => {
  const i = BLEND_DEFAULTS.leadBuckets.findIndex(max => Math.max(leadH, 0) < max);
  return i < 0 ? BLEND_DEFAULTS.leadBuckets.length - 1 : i;
};

function latestDoc(forecasts: AuditForecastDoc[], source: string, asOf: number): AuditForecastDoc | undefined {
  let best: AuditForecastDoc | undefined;
  for (const f of forecasts) {
    if (f.source !== source || !f.points?.length || Date.parse(f.runAt) > asOf) continue;
    if (!best || Date.parse(f.runAt) > Date.parse(best.runAt)) best = f;
  }
  return best;
}
function pointNear(doc: AuditForecastDoc | undefined, t: number, maxMs = 90 * 60e3): AuditPoint | undefined {
  if (!doc) return undefined;
  let best: AuditPoint | undefined, bd = maxMs + 1;
  for (const p of doc.points) { const d = Math.abs(Date.parse(p.t) - t); if (d < bd) { bd = d; best = p; } }
  return best;
}

interface Layer1 { hs?: number; tp?: number; dir?: number; windKn?: number; windDir?: number; windSrc?: string }

/** Eén v2-verwachting op ophaalmoment `runAt` (alleen kennis van vóór dat moment). */
export function buildV2Doc(forecasts: AuditForecastDoc[], observations: AuditObsDoc[], runAt: string, runDate: string, spotId: string, opts: { nowcast?: boolean } = {}): AuditForecastDoc | null {
  const run = Date.parse(runAt);
  const asOf = run + 60_000;
  const fromMs = run - OBS_MAX_AGE_MS - 3_600_000; // ook de uren rond de laatste meting (voor laag 2)
  const obs = cleanObservations(observations);

  // ── Laag 1 ──
  const blend = (sources: string[], v: BlendVar) => blendForecast(forecasts, obs, asOf, { sources, vars: [v], exclude: {}, fromMs });
  const hsB = blend(HS_SOURCES, 'hs'), tpB = blend(TP_SOURCES, 'tp'), wdB = blend(WDIR_SOURCES, 'windDir');
  const byHour = new Map<number, Layer1>();
  const at = (t: number) => { const k = hourKey(t); let x = byHour.get(k); if (!x) { x = {}; byHour.set(k, x); } return x; };
  for (const h of hsB.hours) if (typeof h.hs === 'number') at(Date.parse(h.t)).hs = h.hs;
  for (const h of tpB.hours) if (typeof h.tp === 'number') at(Date.parse(h.t)).tp = h.tp;
  for (const h of wdB.hours) if (typeof h.windDir === 'number') at(Date.parse(h.t)).windDir = h.windDir;

  // Wind: per vooruitkijkklasse de bron met de kleinste fout na kalibratie.
  const wSkill = learnSkill(forecasts, obs, asOf, { sources: WIND_CANDIDATES, vars: ['windKn'], exclude: {} });
  const windDocs = Object.fromEntries(WIND_CANDIDATES.map(s => [s, latestDoc(forecasts, s, asOf)]));
  const windPick = BLEND_DEFAULTS.leadBuckets.map((_, b) => {
    const ranked = WIND_CANDIDATES
      .map(s => ({ s, k: wSkill[`${s}|windKn|${b}`] }))
      .filter(x => x.k && x.k.n >= WIND_MIN_PAIRS && windDocs[x.s])
      .sort((a, b2) => a.k!.rmse - b2.k!.rmse);
    const def = windDocs[WIND_DEFAULT] ? WIND_DEFAULT : ranked[0]?.s;
    return ranked[0]?.s ?? def;
  });
  const dirDoc = latestDoc(forecasts, 'dwd', asOf) ?? latestDoc(forecasts, NZ, asOf);
  const nzDoc = latestDoc(forecasts, NZ, asOf);

  for (const [k, x] of byHour) {
    const t = k * 3_600_000;
    const lead = (t - run) / 3_600_000, b = bucketIndex(lead);
    const src = windPick[b];
    const wp = src ? pointNear(windDocs[src], t) : undefined;
    if (wp && typeof wp.windKn === 'number') {
      const s = wSkill[`${src}|windKn|${b}`];
      x.windKn = Math.max(0, s ? s.a + s.b * wp.windKn : wp.windKn);
      x.windSrc = src;
    }
    const dp = pointNear(dirDoc, t);
    if (typeof dp?.dir === 'number') x.dir = dp.dir;
  }

  // ── Laag 2: laatste meting die er op het ophaalmoment al was ──
  const obsPts: ObsPoint[] = obs.flatMap(d => d.points || [])
    .filter(p => { const t = Date.parse(p.t); return t <= run - OBS_LATENCY_MS && t >= run - OBS_MAX_AGE_MS; })
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
  const lastWith = (f: keyof ObsPoint) => obsPts.find(p => typeof p[f] === 'number');
  const ref = (t: number) => { // laag-1-waarde op het meetuur (of het dichtstbijzijnde uur binnen 3 u)
    for (const d of [0, 1, -1, 2, -2, 3, -3]) { const x = byHour.get(hourKey(t) + d); if (x) return x; }
    return undefined;
  };
  type Corr = { t: number; f: (v: number, w: number) => number; txt: string };
  const corr: Partial<Record<'hs' | 'tp' | 'windKn' | 'windDir', Corr>> = {};
  const oHs = lastWith('hs'); const rHs = oHs && ref(Date.parse(oHs.t));
  if (oHs && typeof rHs?.hs === 'number' && rHs.hs > 0.1) {
    const ratio = clamp(oHs.hs! / rHs.hs, 0.6, 1.7);
    corr.hs = { t: Date.parse(oHs.t), f: (v, w) => v * ratio ** w, txt: `golf ×${nl(ratio)}` };
  }
  const oTp = lastWith('tm02'); const rTp = oTp && ref(Date.parse(oTp.t));
  if (oTp && typeof rTp?.tp === 'number') {
    const e = clamp(oTp.tm02! - rTp.tp, -2, 2);
    corr.tp = { t: Date.parse(oTp.t), f: (v, w) => v + e * w, txt: `periode ${e >= 0 ? '+' : ''}${nl(e, 1)} s` };
  }
  const oW = lastWith('windKn'); const rW = oW && ref(Date.parse(oW.t));
  if (oW && typeof rW?.windKn === 'number') {
    const e = clamp(oW.windKn! - rW.windKn, -10, 10);
    corr.windKn = { t: Date.parse(oW.t), f: (v, w) => Math.max(0, v + e * w), txt: `wind ${e >= 0 ? '+' : ''}${nl(e, 1)} kn` };
  }
  const oD = obsPts.find(p => typeof p.windDir === 'number' && (p.windKn ?? 0) >= 5); const rD = oD && ref(Date.parse(oD.t));
  if (oD && typeof rD?.windDir === 'number') {
    const e = clamp(angDiff(oD.windDir!, rD.windDir), -60, 60);
    corr.windDir = { t: Date.parse(oD.t), f: (v, w) => ((v + e * w) % 360 + 360) % 360, txt: `windrichting ${e >= 0 ? '+' : ''}${Math.round(e)}°` };
  }
  const apply = (k: keyof typeof corr, v: number | undefined, t: number) => {
    const c = corr[k];
    if (typeof v !== 'number' || !c || t < c.t || opts.nowcast === false) return v;
    return c.f(v, 0.5 ** ((t - c.t) / 3_600_000 / HALF_LIFE_H[k]));
  };

  // ── Uitvoer (vanaf een uur vóór het ophaalmoment), met laag 3 voor de spothoogte ──
  const points: AuditPoint[] = [];
  for (const k of [...byHour.keys()].sort((a, b) => a - b)) {
    const t = k * 3_600_000;
    if (t < run - 3_600_000) continue;
    const x = byHour.get(k)!;
    const hs = apply('hs', x.hs, t), tp = apply('tp', x.tp, t), windKn = apply('windKn', x.windKn, t), windDir = apply('windDir', x.windDir, t);
    if (typeof hs !== 'number' && typeof windKn !== 'number') continue;
    const nz = pointNear(nzDoc, t);
    const spotHs = typeof nz?.spotHs === 'number' && typeof nz.hs === 'number' && nz.hs > 0.05 && typeof hs === 'number'
      ? nz.spotHs * clamp(hs / nz.hs, 0.5, 2) : undefined;
    const q: AuditPoint = {
      t: new Date(t).toISOString(), lead: Math.round((t - run) / 3_600_000),
      hs: typeof hs === 'number' ? r(hs, 2) : undefined,
      tp: typeof tp === 'number' ? r(tp, 1) : undefined,
      dir: typeof x.dir === 'number' ? Math.round(x.dir) : undefined,
      windKn: typeof windKn === 'number' ? r(windKn, 1) : undefined,
      windDir: typeof windDir === 'number' ? Math.round(windDir) : undefined,
      spotHs: typeof spotHs === 'number' ? r(spotHs, 2) : undefined,
      tide: nz?.tide,
    };
    points.push(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as unknown as AuditPoint);
  }
  if (!points.length) return null;

  const hsW = hsB.hours.find(h => Date.parse(h.t) >= run && h.weights.hs)?.weights.hs;
  const w = hsW ? Object.entries(hsW).sort((a, b) => b[1] - a[1]).map(([s, x]) => `${SOURCE_NAMES[s] ?? s} ${Math.round(x * 100)}%`).join(', ') : '–';
  const windTxt = [...new Set(windPick.slice(0, 3).filter(Boolean).map(s => SOURCE_NAMES[s!] ?? s))].join(' / ') || '–';
  const nowcast = Object.values(corr).map(c => c!.txt).join(', ');
  return {
    runAt, runDate, spotId, source: V2_SOURCE, label: V2_LABEL, kind: 'model',
    note: `golf nu: ${w} · wind dag 1–3: ${windTxt}${nowcast ? ` · bijgestuurd met meting: ${nowcast}` : ' · geen recente meting om bij te sturen'}`,
    points,
  };
}

/** Per ophaaldag een v2-verwachting, op het laatste ophaalmoment van die dag. */
export function buildV2Docs(forecasts: AuditForecastDoc[], observations: AuditObsDoc[], opts: { nowcast?: boolean } = {}): AuditForecastDoc[] {
  const inputs = new Set([...HS_SOURCES, ...TP_SOURCES, ...WDIR_SOURCES, ...WIND_CANDIDATES]);
  const runByDay = new Map<string, { runAt: string; spotId: string }>();
  for (const f of forecasts) {
    if (!inputs.has(f.source) || !f.points?.length) continue;
    const cur = runByDay.get(f.runDate);
    if (!cur || Date.parse(f.runAt) > Date.parse(cur.runAt)) runByDay.set(f.runDate, { runAt: f.runAt, spotId: f.spotId });
  }
  const out: AuditForecastDoc[] = [];
  for (const [runDate, { runAt, spotId }] of [...runByDay.entries()].sort()) {
    const d = buildV2Doc(forecasts, observations, runAt, runDate, spotId, opts);
    if (d) out.push(d);
  }
  return out;
}
