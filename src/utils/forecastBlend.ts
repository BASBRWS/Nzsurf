// Gewogen ensemble ("blend") van de eigen modelbronnen — laag 1 t/m 3.
//
// 1. Kalibratie per bron, per onderdeel en per vooruitkijktijd:
//    meting ≈ a + b · verwachting, geleerd uit eerdere runs tegen de
//    RWS-metingen (rollend venster). Bij weinig paren krimpt a naar 0 en b
//    naar 1, zodat een correctie pas sterk wordt als hij onderbouwd is.
// 2. Gewicht per bron = 1 / (fout na kalibratie)², ook per onderdeel en
//    vooruitkijktijd. Zolang er weinig paren zijn telt een vaste start-fout mee.
// 3. Spreiding tussen de bronnen als maat voor onzekerheid.
//
// Puur (geen I/O), net als forecastAudit.ts. Alleen metingen van vóór het
// moment van voorspellen worden gebruikt, dus geen kijken in de toekomst.
//
// Let op:
//  - Periode: modellen geven Tp (piek), de boei Tm02 (gemiddeld). De
//    kalibratie zet elke bron om naar de Tm02-schaal van de boei.
//  - Wind wordt gekalibreerd naar het meetstation. Is dat Europlatform, dan
//    ligt het resultaat hoger dan aan de kust.

import { AuditForecastDoc, AuditObsDoc, ObsPoint, cleanObservations } from './forecastAudit';

export type BlendVar = 'hs' | 'tp' | 'windKn' | 'windDir';

export interface BlendOptions {
  /** Bronnen die meedoen. Open-Meteo best match bewust niet: kopie van Météo-France (golf) en KNMI (wind). */
  sources: string[];
  vars: BlendVar[];
  /** Rollend leervenster in dagen. */
  windowDays: number;
  /** Bovengrenzen (uur) van de vooruitkijkklassen. */
  leadBuckets: number[];
  /** Krimp: bij n paren telt de fit voor n / (n + shrinkN). */
  shrinkN: number;
  /** Onder dit aantal paren telt de start-fout zwaar mee. */
  minPairs: number;
  priorRmse: Record<BlendVar, number>;
  /** Windrichting pas meetellen boven deze gemeten windsnelheid (kn). */
  minWindForDir: number;
  /** Bron/onderdeel-paren die niet meedoen. ECMWF-golf: roosterpunt voor Ouddorp ligt te beschut (Hs gehalveerd, periode 2–3 s). */
  exclude: Record<string, BlendVar[]>;
  /** Veiligheidsgrens voor de kalibratiehelling. */
  slopeRange: [number, number];
}

export const BLEND_DEFAULTS: BlendOptions = {
  sources: ['dwd', 'meteofrance', 'ecmwf', 'gfs', 'knmi'],
  vars: ['hs', 'tp', 'windKn', 'windDir'],
  windowDays: 30,
  leadBuckets: [24, 48, 72, 120, 9999],
  shrinkN: 20,
  minPairs: 12,
  priorRmse: { hs: 0.35, tp: 1.0, windKn: 4.0, windDir: 25 },
  minWindForDir: 5,
  exclude: { ecmwf: ['hs', 'tp'] },
  slopeRange: [0.5, 2.0],
};

const OBS_FIELD: Record<BlendVar, keyof ObsPoint> = { hs: 'hs', tp: 'tm02', windKn: 'windKn', windDir: 'windDir' };

export interface SourceSkill { n: number; a: number; b: number; rmse: number }
/** Sleutel: `${source}|${var}|${bucketIndex}` */
export type SkillTable = Record<string, SourceSkill>;

export interface BlendHour {
  t: string;
  hs?: number; hsSpread?: number;
  tp?: number; tpSpread?: number;
  windKn?: number; windKnSpread?: number;
  windDir?: number; windDirSpread?: number;
  /** Aantal bronnen per onderdeel. */
  sources: Partial<Record<BlendVar, number>>;
  /** Genormaliseerd gewicht per bron, per onderdeel. */
  weights: Partial<Record<BlendVar, Record<string, number>>>;
}
export interface BlendResult { asOf: string; skill: SkillTable; hours: BlendHour[] }

// ── hulpfuncties ────────────────────────────────────────────────────────────
const hourKey = (t: number) => Math.round(t / 3_600_000);
/** Verschil a − b in graden, −180..180. */
const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const bucketOf = (lead: number, buckets: number[]) => {
  const i = buckets.findIndex(b => lead < b);
  return i < 0 ? buckets.length - 1 : i;
};
const isExcluded = (src: string, v: BlendVar, opt: BlendOptions) => !!opt.exclude[src]?.includes(v);

function circMean(dirs: number[], w: number[]) {
  let u = 0, v = 0, ws = 0;
  dirs.forEach((d, i) => { const r = d * Math.PI / 180; u += w[i] * Math.cos(r); v += w[i] * Math.sin(r); ws += w[i]; });
  const mean = (Math.atan2(v, u) * 180 / Math.PI + 360) % 360;
  const R = Math.sqrt(u * u + v * v) / (ws || 1); // 1 = eensgezind
  const spread = Math.sqrt(-2 * Math.log(Math.max(R, 1e-6))) * 180 / Math.PI; // circulaire std
  return { mean, spread };
}

function indexObservations(observations: AuditObsDoc[]): Record<number, ObsPoint> {
  const idx: Record<number, ObsPoint> = {};
  for (const day of cleanObservations(observations)) for (const p of day.points) idx[hourKey(Date.parse(p.t))] = p;
  return idx;
}

// ── laag 1 + 2: kalibratie en fout per bron ────────────────────────────────
export function learnSkill(
  forecasts: AuditForecastDoc[], observations: AuditObsDoc[], asOf: number, options: Partial<BlendOptions> = {},
): SkillTable {
  const opt = { ...BLEND_DEFAULTS, ...options };
  const obs = indexObservations(observations);
  const tMin = asOf - opt.windowDays * 86_400_000;
  type Acc = { n: number; sx: number; sy: number; sxx: number; sxy: number; syy: number; sumE: number; sumE2: number };
  const acc: Record<string, Acc> = {};

  for (const f of forecasts) {
    if (!opt.sources.includes(f.source)) continue;
    const run = Date.parse(f.runAt);
    for (const p of f.points || []) {
      const t = Date.parse(p.t);
      if (t >= asOf || t < tMin) continue; // alleen verleden, binnen het venster
      const o = obs[hourKey(t)]; if (!o) continue;
      const lead = (t - run) / 3_600_000; if (lead < -0.5) continue;
      const b = bucketOf(Math.max(lead, 0), opt.leadBuckets);
      for (const v of opt.vars) {
        if (isExcluded(f.source, v, opt)) continue;
        const fv = (p as any)[v] as number | undefined, ov = o[OBS_FIELD[v]] as number | undefined;
        if (fv == null || ov == null) continue;
        if (v === 'windDir' && (o.windKn ?? 0) < opt.minWindForDir) continue;
        const k = `${f.source}|${v}|${b}`;
        const a = acc[k] ??= { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0, syy: 0, sumE: 0, sumE2: 0 };
        a.n++;
        if (v === 'windDir') { const e = angDiff(fv, ov); a.sumE += e; a.sumE2 += e * e; }
        else { a.sx += fv; a.sy += ov; a.sxx += fv * fv; a.sxy += fv * ov; a.syy += ov * ov; }
      }
    }
  }

  const skill: SkillTable = {};
  for (const [k, a] of Object.entries(acc)) {
    const v = k.split('|')[1] as BlendVar, n = a.n;
    const w = n / (n + opt.shrinkN); // vertrouwen in de fit
    let resid: number, ca: number, cb: number;
    if (v === 'windDir') {
      const bias = a.sumE / n;
      ca = bias * w; cb = 1; // richting: alleen verschuiving
      resid = Math.max(a.sumE2 / n - bias * bias, 0);
    } else {
      const mx = a.sx / n, my = a.sy / n;
      const vx = a.sxx / n - mx * mx, cov = a.sxy / n - mx * my;
      let bHat = vx > 1e-9 ? cov / vx : 1;
      bHat = Math.min(Math.max(bHat, opt.slopeRange[0]), opt.slopeRange[1]);
      cb = 1 + w * (bHat - 1);        // helling krimpt naar 1
      ca = w * (my - cb * mx);        // verschuiving krimpt naar 0
      // gemiddelde kwadratische fout van de gekalibreerde verwachting
      resid = a.syy / n - 2 * ca * my - 2 * cb * a.sxy / n + ca * ca + 2 * ca * cb * mx + cb * cb * a.sxx / n;
      resid = Math.max(resid, 0);
    }
    const mix = n / (n + opt.minPairs); // meng met de start-fout
    const rmse = Math.sqrt(mix * resid + (1 - mix) * opt.priorRmse[v] ** 2);
    skill[k] = { n, a: ca, b: cb, rmse };
  }
  return skill;
}

// ── laag 3: gewogen verwachting per uur ────────────────────────────────────
/** Verwachting per uur uit de meest recente run van elke bron die vóór `asOf` beschikbaar was. */
export function blendForecast(
  forecasts: AuditForecastDoc[], observations: AuditObsDoc[], asOf: number, options: Partial<BlendOptions> = {},
): BlendResult {
  const opt = { ...BLEND_DEFAULTS, ...options };
  const skill = learnSkill(forecasts, observations, asOf, opt);

  const latest: Record<string, AuditForecastDoc> = {};
  for (const f of forecasts) {
    if (!opt.sources.includes(f.source) || Date.parse(f.runAt) > asOf) continue;
    if (!latest[f.source] || Date.parse(f.runAt) > Date.parse(latest[f.source].runAt)) latest[f.source] = f;
  }

  type Member = { src: string; val: number; w: number };
  const hours: Record<number, Partial<Record<BlendVar, Member[]>>> = {};
  for (const [src, f] of Object.entries(latest)) {
    const run = Date.parse(f.runAt);
    for (const p of f.points) {
      const t = Date.parse(p.t); if (t < asOf - 3_600_000) continue;
      const b = bucketOf(Math.max((t - run) / 3_600_000, 0), opt.leadBuckets);
      const h = hours[hourKey(t)] ??= {};
      for (const v of opt.vars) {
        const raw = (p as any)[v] as number | undefined;
        if (raw == null || isExcluded(src, v, opt)) continue;
        const s = skill[`${src}|${v}|${b}`] ?? { a: 0, b: 1, rmse: opt.priorRmse[v], n: 0 };
        let val = v === 'windDir' ? ((raw - s.a) % 360 + 360) % 360 : s.a + s.b * raw;
        if (v !== 'windDir') val = Math.max(val, 0);
        (h[v] ??= []).push({ src, val, w: 1 / (s.rmse * s.rmse) });
      }
    }
  }

  const out: BlendHour[] = Object.keys(hours).map(Number).sort((a, b) => a - b).map(k => {
    const row: BlendHour = { t: new Date(k * 3_600_000).toISOString(), sources: {}, weights: {} };
    for (const v of opt.vars) {
      const m = hours[k][v]; if (!m?.length) continue;
      const ws = m.reduce((s, x) => s + x.w, 0);
      if (v === 'windDir') {
        const c = circMean(m.map(x => x.val), m.map(x => x.w));
        row.windDir = round(c.mean, 0); row.windDirSpread = round(c.spread, 0);
      } else {
        const mean = m.reduce((s, x) => s + x.w * x.val, 0) / ws;
        const sd = Math.sqrt(m.reduce((s, x) => s + x.w * (x.val - mean) ** 2, 0) / ws);
        const d = v === 'hs' ? 2 : 1;
        (row as any)[v] = round(mean, d);
        (row as any)[`${v}Spread`] = round(sd, d);
      }
      row.sources[v] = m.length;
      row.weights[v] = Object.fromEntries(m.map(x => [x.src, round(x.w / ws, 2)]));
    }
    return row;
  });
  return { asOf: new Date(asOf).toISOString(), skill, hours: out };
}

// ── "NzSurf concept" als virtuele auditbron ────────────────────────────────
export const CONCEPT_SOURCE = 'nzsurf-concept';
export const CONCEPT_LABEL = 'NzSurf concept';

const SOURCE_NAMES: Record<string, string> = {
  dwd: 'DWD', meteofrance: 'Météo-France', ecmwf: 'ECMWF', gfs: 'GFS', knmi: 'KNMI',
};
const VAR_NAMES: Record<BlendVar, string> = { hs: 'golf', tp: 'periode', windKn: 'wind', windDir: 'windrichting' };

/** Korte bronvermelding, bv. "golf: DWD 38%, Météo-France 38% · wind: GFS 27%, …". */
export function describeWeights(hour: BlendHour, vars: BlendVar[] = ['hs', 'windKn']): string {
  return vars.map(v => {
    const w = hour.weights[v]; if (!w) return null;
    const parts = Object.entries(w).sort((a, b) => b[1] - a[1])
      .map(([s, x]) => `${SOURCE_NAMES[s] ?? s} ${Math.round(x * 100)}%`);
    return `${VAR_NAMES[v]}: ${parts.join(', ')}`;
  }).filter(Boolean).join(' · ');
}

/**
 * Maakt per ophaaldag een verwachting van het NzSurf concept, in hetzelfde
 * formaat als de opgeslagen bronnen. Elke dag wordt berekend met alleen de
 * metingen en runs van vóór die ophaalronde, zodat de audit hem eerlijk kan
 * vergelijken met de andere bronnen.
 */
export function buildConceptDocs(
  forecasts: AuditForecastDoc[], observations: AuditObsDoc[], options: Partial<BlendOptions> = {},
): AuditForecastDoc[] {
  const opt = { ...BLEND_DEFAULTS, ...options };
  // Ophaalmoment per dag = laatste run van een meedoende bron op die dag.
  const runByDay = new Map<string, { runAt: string; spotId: string }>();
  for (const f of forecasts) {
    if (!opt.sources.includes(f.source) || !f.points?.length) continue;
    const cur = runByDay.get(f.runDate);
    if (!cur || Date.parse(f.runAt) > Date.parse(cur.runAt)) runByDay.set(f.runDate, { runAt: f.runAt, spotId: f.spotId });
  }
  const docs: AuditForecastDoc[] = [];
  for (const [runDate, { runAt, spotId }] of [...runByDay.entries()].sort()) {
    const asOf = Date.parse(runAt) + 60_000;
    const res = blendForecast(forecasts, observations, asOf, opt);
    const hours = res.hours.filter(h => Date.parse(h.t) >= Date.parse(runAt) - 3_600_000);
    if (!hours.length) continue;
    const used = [...new Set(hours.flatMap(h => Object.values(h.weights).flatMap(w => Object.keys(w ?? {}))))]
      .map(s => SOURCE_NAMES[s] ?? s);
    const first = hours.find(h => h.weights.hs && h.weights.windKn) ?? hours[0];
    docs.push({
      runAt, runDate, spotId,
      source: CONCEPT_SOURCE, label: CONCEPT_LABEL, kind: 'model',
      note: `Bronnen: ${used.join(', ')} — gewicht nu: ${describeWeights(first)}`,
      points: hours.map(h => ({
        t: h.t, lead: Math.round((Date.parse(h.t) - Date.parse(runAt)) / 3_600_000),
        hs: h.hs, tp: h.tp, windKn: h.windKn, windDir: h.windDir,
      })),
    });
  }
  return docs;
}
