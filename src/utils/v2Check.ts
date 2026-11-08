// Klopt NzSurf v2? Twee vragen, alleen v2 zoals de app hem echt liet zien (bron 'nzsurf-v2-live').
//
//   1. Klopte mijn advies?      — het persoonlijke advies uit het profiel (skill, gewicht, boards,
//                                  voorkeuren), 1, 2 en 3 dagen vooruit, tegen het webcamoordeel
//                                  voor de boards van de gebruiker.
//   2. Klopte mijn voorspelling? — de algemene kans tegen het webcamoordeel voor een gemiddeld board,
//                                  en de getallen op zee (golf, periode, wind) tegen de boei.
//
// Waarheid aan het strand = het webcamoordeel (Maasvlakte), los van elke voorspelling.
// Elke misser wordt uitgesplitst: zat de zee ernaast (golf/wind tegen boei en Europlatform) of
// klopte de zee en zat de vertaling naar het strand/het board ernaast?

import type { ForecastData, SurfSpot, UserProfile } from '../types';
import type { WebcamMeasurement } from '../services/webcamMeasure';
import type { AuditForecastDoc, AuditObsDoc, AuditParam, AuditPoint, ObsPoint, Pair } from './forecastAudit';
import { NOT_RANKED_SOURCES } from './forecastAudit';
import { fairVariableTable, isDailyPoint, leadDayOf, type FairTable } from './fairCompare';
import { truthFor, truthForClasses, type Truth } from './chanceTest';
import { personalHours } from './surfProfile';
import { windQualityFor } from './windQuality';
import { DEFAULT_RULE, forecastVerdict, obsIndex } from './surfVerdict';
import { V2_SOURCE } from './forecastV2';

export const LIVE = 'nzsurf-v2-live';
/** Vanaf deze kans zegt de app "Redelijk" of beter: dat telt als advies "ja, gaan". */
export const ADVICE_MIN = 45;
export const CHECK_DAYS = [1, 2, 3] as const;
export type CheckDay = typeof CHECK_DAYS[number];

/** Sites met een eigen oordeel (kans, rating of go/no-go); die leggen we naast v2. */
const OWN_VERDICT_SITES = ['surfline', 'breakfinder', 'wompy', 'secretswell'];
/** Hoogte aan het strand of alleen swell: geen golfhoogte op zee, dus niet tegen de boei. */
export const BEACH_HEIGHT_SOURCES = new Set(['breakfinder', 'surfnerd', 'secretswell', 'wompy', 'surfline']);

const HOUR = 3600e3;
const nlHour = (t: number) => Number(new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' }));
const nlDay = (t: number) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

/**
 * Punt van `source` voor moment `at`, uit de laatste ophaalronde die `day` dagen vooruit keek.
 * Dagoordelen (Wompy, Secret Swell zonder uren) tellen voor de hele dag.
 */
export function pointForDay(docs: AuditForecastDoc[], source: string, at: number, day: number): { p: AuditPoint; runAt: string } | undefined {
  const runs = docs
    .filter(d => d.source === source && Date.parse(d.runAt) < at && leadDayOf((at - Date.parse(d.runAt)) / HOUR) === day)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt));
  for (const run of runs) {
    let best: AuditPoint | undefined, bd = Infinity;
    for (const p of run.points || []) {
      if (isDailyPoint(source, p)) { if (nlDay(Date.parse(p.t)) === nlDay(at) && bd > 0) { best = p; bd = 0; } continue; }
      const d = Math.abs(Date.parse(p.t) - at);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd <= 1.5 * HOUR) return { p: best, runAt: run.runAt };
  }
  return undefined;
}

/** v2-uur terug naar de invoer van de kansberekening (zoals de app hem had). */
function hourFromPoint(p: AuditPoint, spot: SurfSpot): ForecastData | undefined {
  if (typeof p.hs !== 'number' || typeof p.tp !== 'number') return undefined;
  const windKn = p.windKn ?? 0, windDir = p.windDir ?? 0;
  const wq = typeof p.windKn === 'number' && typeof p.windDir === 'number'
    ? windQualityFor(spot.coastlineAngle ?? 300, windDir, windKn) : { windQuality: 50, windType: undefined };
  return {
    timestamp: p.t, waveHeight: p.hs, spotWaveHeight: p.spotHs, swellPeriod: p.tp, swellDirection: p.dir ?? 300,
    windSpeed: windKn, windDirection: windDir, windQuality: wq.windQuality, windType: wq.windType,
    tideFactor: p.why?.t ?? 1, tideHeight: p.tide,
  } as unknown as ForecastData;
}

export interface DayCall {
  runAt: string; p: AuditPoint;
  personal?: number; board?: string; limit?: string;   // persoonlijk (profiel)
  general?: number;                                     // algemene kans zoals de app hem gaf
  sites: { source: string; ok: boolean }[];             // eigen oordeel van andere sites, zelfde moment en dag vooruit
}
export interface CheckRow {
  m: WebcamMeasurement; at: number;
  truthMe?: Truth;    // webcamoordeel voor jouw boards
  truthGen?: Truth;   // webcamoordeel voor een gemiddeld board
  obs?: ObsPoint;     // boei/Europlatform op dat uur
  days: Partial<Record<CheckDay, DayCall>>;
}

export function buildCheckRows(measurements: WebcamMeasurement[], docs: AuditForecastDoc[], observations: AuditObsDoc[], spot: SurfSpot, user?: UserProfile): CheckRow[] {
  const idx = obsIndex(observations);
  const siteSources = OWN_VERDICT_SITES.filter(s => docs.some(d => d.source === s));
  return measurements
    .map(m => {
      const at = Date.parse(m.runAt);
      const row: CheckRow = {
        m, at, days: {},
        truthMe: user ? truthFor(m, user) : undefined,
        truthGen: truthForClasses(m, ['mid']),
        obs: idx.get(new Date(at + 30 * 60e3).toISOString().slice(0, 13)), // dichtstbijzijnde hele uur
      };
      for (const day of CHECK_DAYS) {
        const hit = pointForDay(docs, LIVE, at, day);
        if (!hit) continue;
        const call: DayCall = { runAt: hit.runAt, p: hit.p, general: hit.p.chance, sites: [] };
        const f = hourFromPoint(hit.p, spot);
        if (f && user) {
          const h = personalHours(spot, [f], user).hours[0];
          if (h) { call.personal = h.personal; call.board = h.bestBoard; call.limit = h.limit; }
        }
        for (const s of siteSources) {
          const sp = pointForDay(docs, s, at, day);
          if (!sp) continue;
          const v = forecastVerdict(s, sp.p, DEFAULT_RULE);
          if (v.own && typeof v.ok === 'boolean') call.sites.push({ source: s, ok: v.ok });
        }
        row.days[day] = call;
      }
      return row;
    })
    .sort((a, b) => b.at - a.at);
}

// ── Score ────────────────────────────────────────────────────────────────────

export type Outcome = 'goed' | 'onterecht-ja' | 'gemist' | 'matig';
/** Uitkomst van één advies tegen de werkelijkheid. Matig telt niet als goed of fout. */
export function outcomeOf(chance: number | undefined, truth: Truth | undefined): Outcome | undefined {
  if (typeof chance !== 'number' || !truth) return undefined;
  if (truth.y === 0.5) return 'matig';
  const yes = chance >= ADVICE_MIN;
  if (yes === (truth.y === 1)) return 'goed';
  return yes ? 'onterecht-ja' : 'gemist';
}

export interface Score { n: number; good: number; falseYes: number; missed: number; matig: number }
export function emptyScore(): Score { return { n: 0, good: 0, falseYes: 0, missed: 0, matig: 0 }; }
function add(s: Score, o: Outcome | undefined) {
  if (!o) return;
  if (o === 'matig') { s.matig++; return; }
  s.n++;
  if (o === 'goed') s.good++; else if (o === 'onterecht-ja') s.falseYes++; else s.missed++;
}

export function scoreAdvice(rows: CheckRow[], day: CheckDay, which: 'personal' | 'general'): Score {
  const s = emptyScore();
  for (const r of rows) {
    const c = r.days[day];
    if (!c) continue;
    add(s, which === 'personal' ? outcomeOf(c.personal, r.truthMe) : outcomeOf(c.general, r.truthGen));
  }
  return s;
}

/** v2 naast elke site met een eigen oordeel, op precies dezelfde momenten (algemene waarheid). */
export function scoreSites(rows: CheckRow[], day: CheckDay, labelOf: (s: string) => string): { source: string; label: string; v2: Score; site: Score }[] {
  const out = new Map<string, { v2: Score; site: Score }>();
  for (const r of rows) {
    const c = r.days[day];
    if (!c || !r.truthGen || r.truthGen.y === 0.5 || typeof c.general !== 'number') continue;
    for (const s of c.sites) {
      const e = out.get(s.source) || out.set(s.source, { v2: emptyScore(), site: emptyScore() }).get(s.source)!;
      add(e.v2, outcomeOf(c.general, r.truthGen));
      add(e.site, outcomeOf(s.ok ? 100 : 0, r.truthGen));
    }
  }
  return [...out].map(([source, x]) => ({ source, label: labelOf(source), ...x })).sort((a, b) => b.site.n - a.site.n);
}

// ── Waarom zat het ernaast? ──────────────────────────────────────────────────

export interface MissReason { kind: 'zee' | 'wind' | 'strand' | 'onbekend'; text: string }
const n1 = (x: number) => x.toFixed(1).replace('.', ',');
/**
 * Zee fout: golfhoogte meer dan 0,2 m én 30% naast de boei. Wind fout: meer dan 6 kn naast
 * Europlatform. Anders klopte de zee en zat de vertaling naar strand/board ernaast.
 */
export function missReason(p: AuditPoint, obs?: ObsPoint): MissReason {
  if (!obs || (typeof obs.hs !== 'number' && typeof obs.windKn !== 'number')) return { kind: 'onbekend', text: 'geen meting van de boei op dat uur' };
  const parts: string[] = [];
  let sea = false, wind = false;
  if (typeof p.hs === 'number' && typeof obs.hs === 'number') {
    const e = p.hs - obs.hs;
    sea = Math.abs(e) > Math.max(0.2, 0.3 * obs.hs);
    parts.push(`golf op zee v2 ${n1(p.hs)} m, boei ${n1(obs.hs)} m`);
  }
  if (typeof p.windKn === 'number' && typeof obs.windKn === 'number') {
    wind = Math.abs(p.windKn - obs.windKn) > 6;
    parts.push(`wind v2 ${Math.round(p.windKn)} kn, gemeten ${Math.round(obs.windKn)} kn`);
  }
  const detail = parts.join('; ');
  if (sea) return { kind: 'zee', text: `golf op zee verkeerd voorspeld (${detail})` };
  if (wind) return { kind: 'wind', text: `wind verkeerd voorspeld (${detail})` };
  return { kind: 'strand', text: `zee klopte (${detail}); de vertaling naar het strand/het board zat ernaast` };
}

export function missBreakdown(rows: CheckRow[], day: CheckDay, which: 'personal' | 'general'): Record<MissReason['kind'], number> {
  const out = { zee: 0, wind: 0, strand: 0, onbekend: 0 };
  for (const r of rows) {
    const c = r.days[day];
    if (!c) continue;
    const o = which === 'personal' ? outcomeOf(c.personal, r.truthMe) : outcomeOf(c.general, r.truthGen);
    if (o === 'onterecht-ja' || o === 'gemist') out[missReason(c.p, r.obs).kind]++;
  }
  return out;
}

// ── Op zee: v2 live tegen de boei, alleen bronnen met een zeewaarde ─────────

export interface SeaSummary {
  param: AuditParam; day: number; table: FairTable;
  rank?: number; of: number; v2?: number;
  better: string[]; worse: string[]; same: string[];   // echt beter / echt slechter / binnen de onzekerheid
}

/**
 * Eerlijke vergelijking (zelfde dag vooruit, 3-uursblokken, dezelfde momenten) met v2 live als
 * referentie. Zonder v1 en v2-nagerekend; voor de golfhoogte zonder sites die een strandhoogte of
 * alleen swell geven (dat is een andere grootheid dan de boei meet).
 */
export function seaSummary(pairs: Pair[], docs: AuditForecastDoc[], param: AuditParam, day: number, labelOf: (s: string) => string): SeaSummary {
  // Golfrichting van die sites is de swellrichting: een andere grootheid dan de gemiddelde richting van de boei.
  const drop = (s: string) => s === 'nzsurf' || s === V2_SOURCE || NOT_RANKED_SOURCES.has(s) || ((param === 'hs' || param === 'dir') && BEACH_HEIGHT_SOURCES.has(s));
  const table = fairVariableTable(pairs.filter(p => !drop(p.source)), docs.filter(d => !drop(d.source)),
    { param, leadDay: day, raster: 3, refs: [LIVE], labelOf });
  const i = table.rows.findIndex(r => r.source === LIVE);
  const others = table.rows.filter(r => r.source !== LIVE);
  return {
    param, day, table, of: table.rows.length,
    rank: i >= 0 ? i + 1 : undefined, v2: i >= 0 ? table.rows[i].value : undefined,
    better: others.filter(r => typeof r.hi === 'number' && r.hi < 0).map(r => r.label),
    worse: others.filter(r => typeof r.lo === 'number' && r.lo > 0).map(r => r.label),
    same: others.filter(r => !(typeof r.hi === 'number' && r.hi < 0) && !(typeof r.lo === 'number' && r.lo > 0)).map(r => r.label),
  };
}

// ── Getij: v2 tegen de gemeten waterstand (Goeree) ──────────────────────────

export interface TideCheck {
  n: number;
  mae?: number;        // gemiddeld ernaast (m)
  offset?: number;     // vaste verschuiving: gemiddeld te hoog (+) of te laag (−)
  shapeMae?: number;   // ernaast na aftrek van die verschuiving
  phaseN: number; phaseOk: number; // fase laag/midden/hoog gelijk
}

/** Fase binnen de getijslag (0 = laagwater, 1 = hoogwater) over ±7 uur, zoals de app hem gebruikt. */
function phaseAt(series: { t: number; v: number }[], t: number): number | undefined {
  const win = series.filter(x => Math.abs(x.t - t) <= 7 * HOUR);
  if (win.length < 4) return undefined;
  const at = win.find(x => x.t === t);
  if (!at) return undefined;
  const lo = Math.min(...win.map(x => x.v)), hi = Math.max(...win.map(x => x.v));
  return hi - lo < 0.2 ? 0.5 : (at.v - lo) / (hi - lo);
}
const phaseClass = (x: number) => (x < 0.2 ? 'laag' : x > 0.8 ? 'hoog' : 'midden');

/**
 * Het getij van v2 tegen de gemeten waterstand, per 3 uur op NL-tijd (zelfde blokken als de
 * vergelijking op zee; zelfde gewicht vóór en na de overstap naar uurwaarden). De absolute hoogte heeft een ander nulpunt (zeeniveau vs NAP) en
 * mist opwaaiing; de kans gebruikt alleen de fase. Daarom: fout, vaste verschuiving en fase.
 */
export function tideCheck(docs: AuditForecastDoc[], observations: AuditObsDoc[], day: number): TideCheck {
  const obs: { t: number; v: number }[] = [];
  for (const d of observations) for (const p of d.points || []) if (typeof p.level === 'number') obs.push({ t: Date.parse(p.t), v: p.level });
  obs.sort((a, b) => a.t - b.t);
  const obsAt = new Map(obs.map(x => [x.t, x.v]));
  // Per doelmoment het punt met de kortste vooruitkijktijd binnen deze dag.
  const pick = new Map<number, { v: number; lead: number; series: { t: number; v: number }[] }>();
  for (const d of docs.filter(x => x.source === LIVE)) {
    const series = (d.points || []).filter(p => typeof p.tide === 'number').map(p => ({ t: Date.parse(p.t), v: p.tide! }));
    for (const p of d.points || []) {
      const t = Date.parse(p.t);
      if (typeof p.tide !== 'number' || leadDayOf(p.lead) !== day || p.lead <= 0 || nlHour(t) % 3 !== 0 || !obsAt.has(t)) continue;
      const cur = pick.get(t);
      if (!cur || p.lead < cur.lead) pick.set(t, { v: p.tide, lead: p.lead, series });
    }
  }
  const errs: number[] = [];
  let phaseN = 0, phaseOk = 0;
  for (const [t, x] of pick) {
    errs.push(x.v - obsAt.get(t)!);
    const pf = phaseAt(x.series, t), po = phaseAt(obs, t);
    if (typeof pf === 'number' && typeof po === 'number') { phaseN++; if (phaseClass(pf) === phaseClass(po)) phaseOk++; }
  }
  if (!errs.length) return { n: 0, phaseN, phaseOk };
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const offset = mean(errs);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { n: errs.length, mae: r2(mean(errs.map(Math.abs))), offset: r2(offset), shapeMae: r2(mean(errs.map(e => Math.abs(e - offset)))), phaseN, phaseOk };
}

// ── Telling: waar vallen webcammetingen af? ──────────────────────────────────

export interface Funnel {
  total: number;          // alle webcammetingen
  beforeLive: number;     // vóór de eerste v2-live-ophaalronde (+ deze dag vooruit)
  noRun: number;          // later, maar geen v2-verwachting precies zoveel dagen eerder
  incomplete: number;     // wel een verwachting, maar zonder golf/periode (geen kans te berekenen)
  unusable: number;       // webcambeeld onbruikbaar (donker, mist, storing)
  noVerdict: number;      // beeld bruikbaar, maar geen oordeel en geen surfers/plat/closeout
  matig: number;          // matig: telt niet als goed of fout
  counted: number;        // getoetst (= n van de score)
}

/** Waar de metingen afvallen, in dezelfde volgorde als de toets ze filtert. */
export function funnelOf(rows: CheckRow[], docs: AuditForecastDoc[], day: CheckDay, which: 'personal' | 'general'): Funnel {
  const live = docs.filter(d => d.source === LIVE).map(d => Date.parse(d.runAt));
  const first = live.length ? Math.min(...live) : Infinity;
  const f: Funnel = { total: rows.length, beforeLive: 0, noRun: 0, incomplete: 0, unusable: 0, noVerdict: 0, matig: 0, counted: 0 };
  for (const r of rows) {
    const c = r.days[day];
    if (!c) { if (r.at < first + (day - 1) * 24 * HOUR) f.beforeLive++; else f.noRun++; continue; }
    const chance = which === 'personal' ? c.personal : c.general;
    if (typeof chance !== 'number') { f.incomplete++; continue; }
    const truth = which === 'personal' ? r.truthMe : r.truthGen;
    if (!truth) { if (!r.m.result || r.m.result.framesUsable === 0) f.unusable++; else f.noVerdict++; continue; }
    if (truth.y === 0.5) f.matig++; else f.counted++;
  }
  return f;
}
