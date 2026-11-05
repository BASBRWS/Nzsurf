// Eerlijke vergelijking: elke bron in een tabel wordt beoordeeld op PRECIES dezelfde momenten.
//
// Drie regels (op verzoek, nov 2026):
//  1. Zelfde vooruitkijkdag: dag 1 alleen tegen dag 1, enz. Nooit dagen door elkaar.
//  2. Zelfde soort waarde en zelfde raster: punt-voorspellingen (een waarde vóór een tijdstip)
//     op een vast raster (elk uur, elke 3 uur, elke 6 uur). Een bron doet alleen mee als zijn
//     eigen stap in het raster past (uurbron: overal; 3-uursbron: raster 3 of 6). Dagoordelen
//     (Wompy, de dagkaarten van Secret Swell) zijn geen punt-voorspelling: die staan apart en
//     worden alleen met elkaar vergeleken, op dag-niveau.
//  3. Zelfde momenten: alleen tijdstippen waarop ÁLLE bronnen in de tabel een verwachting hebben
//     en de werkelijkheid bekend is. Is die overlap te klein (< 40 momenten of < 5 dagen), dan
//     valt de bron met de minste overlap uit de tabel (en staat eronder als "te weinig overlap").
//
// Per moment telt per bron één verwachting: die van de laatste ophaalronde binnen die
// vooruitkijkdag. Verschil met de referentie (NzSurf v2) met 90%-interval via bootstrap per dag.

import type { AuditForecastDoc, AuditParam, AuditPoint, Pair } from './forecastAudit';
import { NOT_RANKED_SOURCES } from './forecastAudit';
import { forecastVerdict, type SurfRule, type TruthFn } from './surfVerdict';

export type Raster = 1 | 3 | 6;
export const RASTERS: Raster[] = [1, 3, 6];
export const FAIR_MIN_MOMENTS = 40;
export const FAIR_MIN_DAYS = 5;
export const LEAD_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Dagoordeel in plaats van een punt-voorspelling? */
export function isDailyPoint(source: string, p: AuditPoint): boolean {
  if (source === 'wompy') return true;
  // Secret Swell: dagkaarten zijn over de dag uitgesmeerd (geen periode, geen windrichting);
  // de uurtabel heeft die wel.
  if (source === 'secretswell') return typeof p.tp !== 'number' && typeof p.windDir !== 'number';
  return false;
}
export const DAILY_SOURCES = new Set(['wompy', 'secretswell']);

/** Eigen stap van een bron in uren (1, 3, 6), uit de afstand tussen opeenvolgende punten. */
export function nativeSteps(docs: AuditForecastDoc[]): Map<string, number> {
  const gaps = new Map<string, number[]>();
  for (const d of docs) {
    const ts = (d.points || []).filter(p => !isDailyPoint(d.source, p)).map(p => Date.parse(p.t)).sort((a, b) => a - b);
    const g = gaps.get(d.source) || [];
    for (let i = 1; i < ts.length; i++) { const h = Math.round((ts[i] - ts[i - 1]) / 3600e3); if (h >= 1 && h <= 24) g.push(h); }
    gaps.set(d.source, g);
  }
  const out = new Map<string, number>();
  for (const [s, g] of gaps) {
    if (!g.length) continue;
    g.sort((a, b) => a - b);
    const med = g[Math.floor(g.length / 2)];
    out.set(s, med <= 1 ? 1 : med <= 3 ? 3 : med <= 6 ? 6 : 24);
  }
  return out;
}

export const leadDayOf = (leadHours: number) => Math.max(1, Math.ceil(Math.max(leadHours, 0.01) / 24));
// Blokken op Nederlandse tijd: raster 3 = 00–03, 03–06, … uur NL-tijd. NzSurf rekent in
// 3-uursblokken op NL-tijd, de modellen in de audit op UTC-tijden; in hetzelfde blok liggen
// die hooguit 1 uur (winter) of 2 uur (zomer) uit elkaar. Raster 1 = exact hetzelfde uur.
const NL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function nlParts(tMs: number) { const p = NL.formatToParts(new Date(tMs)).reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {}); return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }; }
/** Sleutel van het blok (NL-dag + beginuur) en de afstand tot het begin van het blok (uren). */
export function blockOf(tMs: number, raster: Raster) { const { day, hour } = nlParts(Math.round(tMs / 3600e3) * 3600e3); const start = Math.floor(hour / raster) * raster; return { key: `${day}T${String(start).padStart(2, '0')}`, offset: hour - start, hour }; }
const localDay = (key: string) => key.slice(0, 10);

interface Cell<T> { v: T; lead: number; offset: number; truth?: boolean }
type Series<T> = Map<string, Map<string, Cell<T>>>; // bron → uur → waarde

/** Kies de grootste set bronnen met genoeg gezamenlijke momenten (bron met de minste overlap valt eerst af). */
export function commonMoments<T>(series: Series<T>, extraOk: (key: string) => boolean = () => true, keep: string[] = [], minMoments = FAIR_MIN_MOMENTS, minDays = FAIR_MIN_DAYS) {
  let included = [...series.keys()].filter(s => series.get(s)!.size > 0);
  const dropped: { source: string; overlap: number }[] = [];
  const inter = (set: string[]) => {
    if (!set.length) return [] as string[];
    const [first, ...rest] = set.map(s => series.get(s)!);
    return [...first.keys()].filter(k => extraOk(k) && rest.every(m => m.has(k)));
  };
  const enough = (keys: string[]) => keys.length >= minMoments && new Set(keys.map(localDay)).size >= minDays;
  let keys = inter(included);
  while (included.length > 1 && !enough(keys)) {
    // Welke bron weglaten levert de meeste gezamenlijke momenten op?
    // De referentie (NzSurf v2) blijft zo lang mogelijk staan.
    const candidates = included.some(s => !keep.includes(s)) ? included.filter(s => !keep.includes(s)) : included;
    let best = -1, bestKeys: string[] = [];
    included.forEach((s, i) => {
      if (!candidates.includes(s)) return;
      const k = inter(included.filter((_, j) => j !== i));
      if (best < 0 || k.length > bestKeys.length) { best = i; bestKeys = k; }
    });
    dropped.push({ source: included[best], overlap: keys.length });
    included = included.filter((_, j) => j !== best);
    keys = bestKeys;
  }
  if (!enough(keys)) { dropped.push(...included.map(s => ({ source: s, overlap: keys.length }))); included = []; keys = []; }
  return { included, keys, days: new Set(keys.map(localDay)).size, dropped };
}

export interface FairRow {
  source: string; label: string; step: number;
  offset?: number;          // gemiddeld aantal uren na het begin van het blok (0 = zelfde moment)
  value: number;            // MAE (variabelen) of gebalanceerde score in % (te surfen)
  bias?: number; caught?: number; rightNo?: number; saysYes?: number;
  delta?: number; lo?: number; hi?: number; // t.o.v. de referentie (zelfde momenten)
}
export interface FairTable {
  moments: number; days: number; raster: Raster; leadDay: number;
  rows: FairRow[];                                   // gesorteerd: beste eerst
  dropped: { source: string; label: string; reason: string }[];
  ref?: string; higherIsBetter: boolean;
}

function bootstrapDelta(keys: string[], perKey: (k: string) => [number, number] | null, combine: (pairs: [number, number][]) => number, n = 300) {
  const byDay = new Map<string, string[]>();
  for (const k of keys) { const d = localDay(k); (byDay.get(d) || byDay.set(d, []).get(d)!).push(k); }
  const days = [...byDay.keys()];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    const pick: [number, number][] = [];
    for (let i = 0; i < days.length; i++) for (const k of byDay.get(days[Math.floor(rnd() * days.length)])!) { const v = perKey(k); if (v) pick.push(v); }
    const x = combine(pick); if (Number.isFinite(x)) out.push(x);
  }
  out.sort((a, b) => a - b);
  return out.length ? { lo: out[Math.floor(out.length * 0.05)], hi: out[Math.floor(out.length * 0.95)] } : null;
}

/** Bronnen die wel punten hebben, maar niet voor deze vooruitkijkdag. */
function missingLead(docs: AuditForecastDoc[], present: Set<string>, other: Set<string>, leadDay: number, label: (s: string) => string) {
  const all = new Set(docs.filter(d => !NOT_RANKED_SOURCES.has(d.source) && (d.points || []).some(p => !isDailyPoint(d.source, p))).map(d => d.source));
  return [...all].filter(s => !present.has(s) && !other.has(s)).map(s => ({ source: s, label: label(s), reason: `geen verwachting voor dag ${leadDay}` }));
}

function labelsOf(docs: AuditForecastDoc[]) { const m = new Map<string, string>(); for (const d of docs) m.set(d.source, d.label); return m; }
/** Alleen de eerste beschikbare referentie is beschermd; v1 en de rest vallen af op overlap. */
function primaryRef(series: Map<string, Map<string, unknown>>, refs: string[]) { const r = refs.find(x => (series.get(x)?.size ?? 0) > 0); return r ? [r] : []; }
function pickRef(included: string[], refs: string[]) { return refs.find(r => included.includes(r)); }
const r2 = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Variabelen (golfhoogte, periode, wind, …): gemiddelde afwijking op dezelfde momenten. */
export function fairVariableTable(pairs: Pair[], docs: AuditForecastDoc[], o: { param: AuditParam; leadDay: number; raster: Raster; refs: string[]; labelOf?: (s: string) => string }): FairTable {
  const steps = nativeSteps(docs);
  const labels = labelsOf(docs);
  const label = (s: string) => o.labelOf?.(s) ?? labels.get(s) ?? s;
  const dailyKeys = new Set<string>();
  for (const d of docs) if (DAILY_SOURCES.has(d.source)) for (const p of d.points || []) if (isDailyPoint(d.source, p)) dailyKeys.add(`${d.source}|${d.runDate}|${p.t.slice(0, 13)}`);
  const series: Series<number> = new Map();
  const notInRaster = new Set<string>();
  for (const p of pairs) {
    if (p.param !== o.param || NOT_RANKED_SOURCES.has(p.source)) continue;
    if (dailyKeys.has(`${p.source}|${p.runDate}|${p.t.slice(0, 13)}`)) continue; // dagoordeel: niet bij punten
    const step = steps.get(p.source) ?? 1;
    if (o.raster % step !== 0) { notInRaster.add(p.source); continue; }
    const t = Date.parse(p.t);
    if (leadDayOf(p.lead) !== o.leadDay) continue;
    const b = blockOf(t, o.raster);
    const m = series.get(p.source) || series.set(p.source, new Map()).get(p.source)!;
    const cur = m.get(b.key);
    // Per blok één waarde: zo dicht mogelijk bij het begin van het blok, dan de laatste ophaalronde.
    if (!cur || b.offset < cur.offset || (b.offset === cur.offset && p.lead < cur.lead)) m.set(b.key, { v: p.err, lead: p.lead, offset: b.offset });
  }
  const { included, keys, days, dropped } = commonMoments(series, () => true, primaryRef(series, o.refs));
  const mae = (s: string, ks: string[]) => ks.reduce((a, k) => a + Math.abs(series.get(s)!.get(k)!.v), 0) / ks.length;
  const ref = pickRef(included, o.refs);
  const rows: FairRow[] = included.map(s => {
    const errs = keys.map(k => series.get(s)!.get(k)!.v);
    const row: FairRow = { source: s, label: label(s), step: steps.get(s) ?? 1, value: r2(mae(s, keys)), bias: r2(errs.reduce((a, b) => a + b, 0) / errs.length), offset: r2(keys.reduce((a, k) => a + series.get(s)!.get(k)!.offset, 0) / keys.length, 1) };
    if (ref && s !== ref) {
      row.delta = r2(row.value - mae(ref, keys));
      const ci = bootstrapDelta(keys, k => [Math.abs(series.get(s)!.get(k)!.v), Math.abs(series.get(ref)!.get(k)!.v)], ps => ps.reduce((a, [x, y]) => a + x - y, 0) / ps.length);
      if (ci) { row.lo = r2(ci.lo); row.hi = r2(ci.hi); }
    }
    return row;
  }).sort((a, b) => a.value - b.value);
  return {
    moments: keys.length, days, raster: o.raster, leadDay: o.leadDay, rows, ref, higherIsBetter: false,
    dropped: [
      ...dropped.map(d => ({ source: d.source, label: label(d.source), reason: `te weinig gezamenlijke momenten met de rest (${d.overlap})` })),
      ...[...notInRaster].map(s => ({ source: s, label: label(s), reason: `eigen stap ${steps.get(s)} uur past niet in dit raster` })),
      ...missingLead(docs, new Set(series.keys()), notInRaster, o.leadDay, label),
    ],
  };
}

/** Te surfen?: gebalanceerde score (gemiddelde van gevangen en terecht nee) op dezelfde momenten. */
export function fairSurfTable(docs: AuditForecastDoc[], rule: SurfRule, truthFn: TruthFn, o: { leadDay: number; raster: Raster; refs: string[]; labelOf?: (s: string) => string }): FairTable {
  const steps = nativeSteps(docs);
  const labels = labelsOf(docs);
  const label = (s: string) => o.labelOf?.(s) ?? labels.get(s) ?? s;
  const series: Series<boolean> = new Map();
  const notInRaster = new Set<string>();
  const noVerdict = new Set<string>();
  for (const d of docs) {
    if (NOT_RANKED_SOURCES.has(d.source)) continue;
    const step = steps.get(d.source) ?? 1;
    for (const p of d.points || []) {
      if (isDailyPoint(d.source, p)) continue;
      if (o.raster % step !== 0) { notInRaster.add(d.source); continue; }
      const t = Date.parse(p.t);
      if (leadDayOf(p.lead) !== o.leadDay || p.lead <= 0) continue;
      const b = blockOf(t, o.raster);
      // Daglicht per blok (midden van het blok tussen 07 en 20 u), zodat elke bron dezelfde blokken houdt.
      const mid = Number(b.key.slice(11, 13)) + o.raster / 2;
      if (mid < 7 || mid > 20) continue;
      const ok = forecastVerdict(d.source, p, rule).ok;
      if (ok === undefined) { noVerdict.add(d.source); continue; }
      const tr = truthFn(Math.round(t / 3600e3) * 3600e3, ''); // werkelijkheid op het uur van deze verwachting
      if (tr === undefined) continue;
      const m = series.get(d.source) || series.set(d.source, new Map()).get(d.source)!;
      const cur = m.get(b.key);
      if (!cur || b.offset < cur.offset || (b.offset === cur.offset && p.lead < cur.lead)) m.set(b.key, { v: ok, lead: p.lead, offset: b.offset, truth: tr });
    }
  }
  const { included, keys, days, dropped } = commonMoments(series, () => true, primaryRef(series, o.refs));
  const score = (s: string, ks: string[]) => {
    let tp = 0, fn = 0, tn = 0, fp = 0;
    for (const k of ks) { const c = series.get(s)!.get(k)!, f = c.v, t = c.truth!; if (t) { if (f) tp++; else fn++; } else { if (f) fp++; else tn++; } }
    const rec = tp + fn ? tp / (tp + fn) : NaN, spec = tn + fp ? tn / (tn + fp) : NaN;
    return { bal: (rec + spec) / 2, rec, spec, yes: (tp + fp) / Math.max(1, ks.length) };
  };
  const ref = pickRef(included, o.refs);
  const rows: FairRow[] = included.map(s => {
    const sc = score(s, keys);
    const row: FairRow = { source: s, label: label(s), step: steps.get(s) ?? 1, value: Math.round(100 * sc.bal), caught: Math.round(100 * sc.rec), rightNo: Math.round(100 * sc.spec), saysYes: Math.round(100 * sc.yes), offset: r2(keys.reduce((a, k) => a + series.get(s)!.get(k)!.offset, 0) / keys.length, 1) };
    if (ref && s !== ref) {
      row.delta = row.value - Math.round(100 * score(ref, keys).bal);
      // Bootstrap op de gebalanceerde score: per steekproef beide scores opnieuw.
      const byDay = new Map<string, string[]>();
      for (const k of keys) { const d = localDay(k); (byDay.get(d) || byDay.set(d, []).get(d)!).push(k); }
      const ds = [...byDay.keys()];
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const out: number[] = [];
      for (let b = 0; b < 300; b++) {
        const ks = Array.from({ length: ds.length }, () => byDay.get(ds[Math.floor(rnd() * ds.length)])!).flat();
        const x = score(s, ks).bal - score(ref, ks).bal;
        if (Number.isFinite(x)) out.push(x);
      }
      out.sort((a, b) => a - b);
      if (out.length) { row.lo = Math.round(100 * out[Math.floor(out.length * 0.05)]); row.hi = Math.round(100 * out[Math.floor(out.length * 0.95)]); }
    }
    return row;
  }).filter(r => Number.isFinite(r.value)).sort((a, b) => b.value - a.value);
  return {
    moments: keys.length, days, raster: o.raster, leadDay: o.leadDay, rows, ref, higherIsBetter: true,
    dropped: [
      ...dropped.map(d => ({ source: d.source, label: label(d.source), reason: `te weinig gezamenlijke momenten met de rest (${d.overlap})` })),
      ...[...notInRaster].map(s => ({ source: s, label: label(s), reason: `eigen stap ${steps.get(s)} uur past niet in dit raster` })),
      ...[...noVerdict].filter(s => !series.has(s) && !notInRaster.has(s)).map(s => ({ source: s, label: label(s), reason: 'geeft geen oordeel (onderdelen ontbreken, bv. alleen wind)' })),
      ...missingLead(docs, new Set([...series.keys(), ...noVerdict]), notInRaster, o.leadDay, label),
    ],
  };
}

/**
 * Dagoordelen (alleen bronnen die één oordeel per dag geven): per vooruitkijkdag, op dezelfde
 * dagen. Werkelijkheid per dag = minstens `minSlots` surfbare daglichtmomenten (om de 3 uur).
 */
export function fairDailyTable(docs: AuditForecastDoc[], rule: SurfRule, truthFn: TruthFn, o: { leadDay: number; minSlots?: number; labelOf?: (s: string) => string; minDays?: number }): FairTable {
  const labels = labelsOf(docs);
  const label = (s: string) => o.labelOf?.(s) ?? labels.get(s) ?? s;
  const minSlots = o.minSlots ?? 2;
  const series: Series<boolean> = new Map();
  const truthDay = new Map<string, boolean>();
  for (const d of docs) {
    if (!DAILY_SOURCES.has(d.source)) continue;
    const byDay = new Map<string, { ok: boolean[]; lead: number }>();
    for (const p of d.points || []) {
      if (!isDailyPoint(d.source, p) || leadDayOf(p.lead) !== o.leadDay) continue;
      const ok = forecastVerdict(d.source, p, rule).ok;
      if (ok === undefined) continue;
      const day = new Date(Date.parse(p.t)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
      const e = byDay.get(day) || { ok: [], lead: p.lead }; e.ok.push(ok); byDay.set(day, e);
    }
    for (const [day, e] of byDay) {
      // Eén oordeel per dag: de dag is "te surfen" als het oordeel dat zegt (alle punten dragen hetzelfde oordeel).
      const v = e.ok.filter(Boolean).length > e.ok.length / 2;
      const m = series.get(d.source) || series.set(d.source, new Map()).get(d.source)!;
      const cur = m.get(day);
      if (!cur || e.lead < cur.lead) m.set(day, { v, lead: e.lead, offset: 0 });
      if (!truthDay.has(day)) {
        const base = Date.parse(`${day}T00:00:00Z`);
        let yes = 0, known = 0;
        for (let h = 6; h <= 19; h += 3) { const tr = truthFn(base + h * 3600e3, d.source); if (tr !== undefined) { known++; if (tr) yes++; } }
        if (known >= 3) truthDay.set(day, yes >= minSlots);
      }
    }
  }
  // Dagen als sleutel: de tijdzone-omrekening van commonMoments past hier niet; eigen overlap.
  const srcs = [...series.keys()];
  const keys = srcs.length ? [...series.get(srcs[0])!.keys()].filter(k => truthDay.has(k) && srcs.every(s => series.get(s)!.has(k))) : [];
  const minDays = o.minDays ?? 8;
  const ok = keys.length >= minDays;
  const rows: FairRow[] = ok ? srcs.map(s => {
    let tp = 0, fn = 0, tn = 0, fp = 0;
    for (const k of keys) { const f = series.get(s)!.get(k)!.v, t = truthDay.get(k)!; if (t) { if (f) tp++; else fn++; } else { if (f) fp++; else tn++; } }
    const rec = tp + fn ? tp / (tp + fn) : NaN, spec = tn + fp ? tn / (tn + fp) : NaN;
    return { source: s, label: label(s), step: 24, value: Math.round(50 * (rec + spec)), caught: Math.round(100 * rec), rightNo: Math.round(100 * spec), saysYes: Math.round(100 * (tp + fp) / keys.length) };
  }).filter(r => Number.isFinite(r.value)).sort((a, b) => b.value - a.value) : [];
  return {
    moments: keys.length, days: keys.length, raster: 6, leadDay: o.leadDay, rows, higherIsBetter: true,
    dropped: ok ? [] : srcs.map(s => ({ source: s, label: label(s), reason: `${keys.length} gezamenlijke dagen (minimaal ${minDays})` })),
  };
}
