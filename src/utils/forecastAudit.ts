// Rekenkern van de voorspellingsaudit: koppelt opgeslagen verwachtingen aan
// metingen en berekent per bron, onderdeel en vooruitkijktijd hoe goed het was.
// Puur (geen I/O), zodat de Beta-pagina en exports dezelfde cijfers gebruiken.

export interface AuditPoint {
  t: string; lead: number;
  hs?: number; tp?: number; dir?: number; windKn?: number; windDir?: number; gustKn?: number;
  spotHs?: number; chance?: number; tide?: number; surfMin?: number; surfMax?: number; rating?: string;
}
export interface AuditForecastDoc {
  runAt: string; runDate: string; spotId: string;
  source: string; label: string; kind: 'nzsurf' | 'model' | 'site';
  points: AuditPoint[]; note?: string;
}
export interface ObsPoint { t: string; hs?: number; tm02?: number; dir?: number; windKn?: number; windDir?: number; level?: number }
export interface AuditObsDoc { date: string; points: ObsPoint[]; stations?: string[]; source?: string }

export type AuditParam = 'hs' | 'tp' | 'dir' | 'windKn' | 'windDir';

export const PARAMS: { key: AuditParam; label: string; unit: string; obsKey: keyof ObsPoint; circular?: boolean; note?: string }[] = [
  { key: 'hs', label: 'Golfhoogte', unit: 'm', obsKey: 'hs' },
  { key: 'tp', label: 'Golfperiode', unit: 's', obsKey: 'tm02', note: 'gemeten: gemiddelde periode (Tm02)' },
  { key: 'dir', label: 'Golfrichting', unit: '°', obsKey: 'dir', circular: true },
  { key: 'windKn', label: 'Windsnelheid', unit: 'kn', obsKey: 'windKn' },
  { key: 'windDir', label: 'Windrichting', unit: '°', obsKey: 'windDir', circular: true },
];

export const LEAD_BUCKETS = [
  { key: 'd1', label: 'Dag 1 (0–24 u)', min: -1, max: 24 },
  { key: 'd2', label: 'Dag 2 (24–48 u)', min: 24, max: 48 },
  { key: 'd3', label: 'Dag 3 (48–72 u)', min: 48, max: 72 },
  { key: 'd4-5', label: 'Dag 4–5', min: 72, max: 120 },
  { key: 'd6-7', label: 'Dag 6–7', min: 120, max: 169 },
] as const;
export type LeadBucket = typeof LEAD_BUCKETS[number]['key'];

export const leadBucketOf = (lead: number): LeadBucket | null =>
  (LEAD_BUCKETS.find(b => lead >= b.min && lead < b.max)?.key as LeadBucket) ?? null;

export interface Pair {
  runDate: string; source: string; label: string; kind: string;
  t: string; lead: number; bucket: LeadBucket;
  param: AuditParam; fc: number; obs: number; err: number; // err = verwachting − meting
  obsWindKn?: number; obsHs?: number; // voor filters op omstandigheden
}

const circDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180; // −180..180

/** Koppelt elk voorspeld punt aan de meting op hetzelfde (hele) uur. */
export function buildPairs(forecasts: AuditForecastDoc[], observations: AuditObsDoc[]): Pair[] {
  const obsByHour = new Map<string, ObsPoint>();
  for (const d of observations) for (const p of d.points || []) obsByHour.set(p.t.slice(0, 13), p);
  const pairs: Pair[] = [];
  for (const doc of forecasts) {
    for (const p of doc.points || []) {
      const o = obsByHour.get(p.t.slice(0, 13));
      const bucket = leadBucketOf(p.lead);
      if (!o || !bucket) continue;
      for (const prm of PARAMS) {
        const fc = p[prm.key];
        const ob = o[prm.obsKey] as number | undefined;
        if (typeof fc !== 'number' || typeof ob !== 'number') continue;
        const err = prm.circular ? circDiff(fc, ob) : fc - ob;
        pairs.push({
          runDate: doc.runDate, source: doc.source, label: doc.label, kind: doc.kind,
          t: p.t, lead: p.lead, bucket, param: prm.key, fc, obs: ob, err: Math.round(err * 100) / 100,
          obsWindKn: o.windKn, obsHs: o.hs,
        });
      }
    }
  }
  return pairs;
}

export interface Score { source: string; label: string; kind: string; param: AuditParam; n: number; mae: number; bias: number; rmse: number }

/** Gemiddelde afwijking (MAE), systematische fout (bias) en RMSE per bron × onderdeel. */
export function scorePairs(pairs: Pair[]): Score[] {
  const groups = new Map<string, Pair[]>();
  for (const p of pairs) {
    const k = `${p.source}|${p.param}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const out: Score[] = [];
  for (const g of groups.values()) {
    const n = g.length;
    const mae = g.reduce((a, p) => a + Math.abs(p.err), 0) / n;
    const bias = g.reduce((a, p) => a + p.err, 0) / n;
    const rmse = Math.sqrt(g.reduce((a, p) => a + p.err * p.err, 0) / n);
    out.push({ source: g[0].source, label: g[0].label, kind: g[0].kind, param: g[0].param, n,
      mae: Math.round(mae * 100) / 100, bias: Math.round(bias * 100) / 100, rmse: Math.round(rmse * 100) / 100 });
  }
  return out.sort((a, b) => a.mae - b.mae);
}

/** Minimale steekproef voordat we een ranglijst serieus nemen. */
export const MIN_N = 20;

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Puntkomma als scheidingsteken: opent direct goed in Nederlandse Excel.
  return [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n');
}

// ── Spotkennis toetsen aan spotrapporten ────────────────────────────────────
// De boei op zee kan de vertaling naar de spot (demping, getij, kans) niet
// beoordelen. Spotrapporten wel: een foto van het strand (golfhoogte geschat
// door Gemini) en, sinds de beoordelingsvraag, het oordeel van de surfer zelf.

export type UserRating = 'no' | 'meh' | 'fair' | 'good';
export const RATING_LABELS: Record<UserRating, string> = { no: 'Werkt niet / flat', meh: 'Matig', fair: 'Redelijk', good: 'Goed' };
const RATING_WORKS: Record<UserRating, boolean> = { no: false, meh: false, fair: true, good: true };

export interface SpotReportLike {
  spotId: string; spotName: string; timestamp: string;
  forecastAtTime?: { waveHeight?: number; spotWaveHeight?: number; surfChance?: number } | null;
  analysis?: { waveHeight?: string; matchScore?: number; isMismatched?: boolean } | null;
  userRating?: UserRating;
}

/** "0.5-0.8m", "0,5–0,8 m", "1m", "flat" → meters (midden van een bereik). */
export function parseWaveEstimate(text?: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/,/g, '.');
  if (/\bflat\b|vlak/.test(t)) return 0;
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0])).filter(n => n < 10);
  if (!nums.length) return undefined;
  const v = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  return Math.round(v * 100) / 100;
}

export interface ReportRow {
  t: string; spotId: string; spotName: string;
  chance?: number; spotHs?: number; seaHs?: number; photoHs?: number;
  matchScore?: number; mismatch?: boolean; rating?: UserRating;
  breakfinder?: number; // breakfinder-score (0–100) voor hetzelfde uur, alleen Ouddorp
}

/** Breakfinder-score voor een tijdstip: uit de laatste ophaalronde vóór dat moment. */
function breakfinderAt(t: string, docs: AuditForecastDoc[]): number | undefined {
  const ms = Date.parse(t);
  const runs = docs.filter(d => d.source === 'breakfinder' && Date.parse(d.runAt) <= ms)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt));
  for (const d of runs) {
    const near = (d.points || [])
      .filter(p => typeof p.chance === 'number' && Math.abs(Date.parse(p.t) - ms) <= 90 * 60e3)
      .sort((a, b) => Math.abs(Date.parse(a.t) - ms) - Math.abs(Date.parse(b.t) - ms))[0];
    if (near) return near.chance;
  }
  return undefined;
}

export function reportRows(reports: SpotReportLike[], auditDocs: AuditForecastDoc[] = [], auditSpotId?: string): ReportRow[] {
  return reports.map(r => ({
    t: r.timestamp, spotId: r.spotId, spotName: r.spotName,
    chance: r.forecastAtTime?.surfChance,
    spotHs: r.forecastAtTime?.spotWaveHeight,
    seaHs: r.forecastAtTime?.waveHeight,
    photoHs: parseWaveEstimate(r.analysis?.waveHeight),
    matchScore: r.analysis?.matchScore,
    mismatch: r.analysis?.isMismatched,
    rating: r.userRating,
    breakfinder: auditSpotId && r.spotId === auditSpotId ? breakfinderAt(r.timestamp, auditDocs) : undefined,
  })).sort((a, b) => b.t.localeCompare(a.t));
}

export interface ReportSummary {
  wave: { n: number; maeSpot: number; maeSea: number } | null;   // hoogte op de spot vs op zee, beide t.o.v. de foto
  chance: { n: number; agree: number; byLevel: { level: string; n: number; works: number }[] } | null;
  breakfinder: { n: number; agree: number } | null;               // zelfde toets voor breakfinder
  mismatchRate: { n: number; pct: number } | null;
}

const LEVELS = [
  { min: 70, label: 'Goed (≥70%)' }, { min: 45, label: 'Redelijk (45–69%)' },
  { min: 20, label: 'Matig (20–44%)' }, { min: 0, label: 'Werkt niet (<20%)' },
];

export function summarizeReports(rows: ReportRow[]): ReportSummary {
  const w = rows.filter(r => typeof r.photoHs === 'number' && typeof r.spotHs === 'number' && typeof r.seaHs === 'number');
  const mae = (f: (r: ReportRow) => number) => Math.round(w.reduce((a, r) => a + Math.abs(f(r)), 0) / w.length * 100) / 100;

  const c = rows.filter(r => typeof r.chance === 'number' && r.rating);
  const b = rows.filter(r => typeof r.breakfinder === 'number' && r.rating);
  const m = rows.filter(r => typeof r.mismatch === 'boolean');
  const agreePct = (xs: ReportRow[], score: (r: ReportRow) => number) =>
    Math.round(xs.filter(r => (score(r) >= 45) === RATING_WORKS[r.rating!]).length / xs.length * 100);

  return {
    wave: w.length ? { n: w.length, maeSpot: mae(r => r.spotHs! - r.photoHs!), maeSea: mae(r => r.seaHs! - r.photoHs!) } : null,
    chance: c.length ? {
      n: c.length,
      agree: agreePct(c, r => r.chance!),
      byLevel: LEVELS.map((l, i) => {
        const inLevel = c.filter(r => r.chance! >= l.min && (i === 0 || r.chance! < LEVELS[i - 1].min));
        return { level: l.label, n: inLevel.length, works: inLevel.filter(r => RATING_WORKS[r.rating!]).length };
      }),
    } : null,
    breakfinder: b.length ? { n: b.length, agree: agreePct(b, r => r.breakfinder!) } : null,
    mismatchRate: m.length ? { n: m.length, pct: Math.round(m.filter(r => r.mismatch).length / m.length * 100) } : null,
  };
}

/** Minimaal aantal rapporten voordat we een conclusie tonen. */
export const MIN_REPORTS = 10;

// ── Weekoverzicht: wat voorspelde wie, per tijdstip ─────────────────────────
// Per tijdstip nemen we van elke bron de laatste verwachting die vóór dat moment
// (en vóór nu) gemaakt is; daaruit het punt dat het dichtst bij ligt (max 90 min,
// want NzSurf rekent in blokken op NL-tijd en de rest op UTC-uren).

const MATCH_MS = 90 * 60e3;

function pointValue(p: AuditPoint, param: AuditParam): number | undefined {
  const v = p[param];
  return typeof v === 'number' ? v : undefined;
}

/** Waarde van een bron voor tijdstip tMs (zie toelichting hierboven). */
export function forecastFor(docs: AuditForecastDoc[], source: string, tMs: number, nowMs: number, param: AuditParam): number | undefined {
  const cutoff = Math.min(tMs, nowMs);
  const doc = docs
    .filter(d => d.source === source && Date.parse(d.runAt) <= cutoff)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0];
  if (!doc) return undefined;
  let best: { v: number; dt: number } | null = null;
  for (const p of doc.points || []) {
    const v = pointValue(p, param);
    if (v === undefined) continue;
    const dt = Math.abs(Date.parse(p.t) - tMs);
    if (dt <= MATCH_MS && (!best || dt < best.dt)) best = { v, dt };
  }
  return best?.v;
}

export function observedAt(obs: AuditObsDoc[], tMs: number, param: AuditParam): number | undefined {
  const key = new Date(tMs).toISOString().slice(0, 13);
  const prm = PARAMS.find(p => p.key === param)!;
  for (const d of obs) for (const o of d.points || []) {
    if (o.t.slice(0, 13) === key) {
      const v = o[prm.obsKey];
      return typeof v === 'number' ? v : undefined;
    }
  }
  return undefined;
}

const absErr = (param: AuditParam, fc: number, ob: number) =>
  Math.abs(PARAMS.find(p => p.key === param)!.circular ? circDiff(fc, ob) : fc - ob);

export interface DaySources { source: string; label: string; kind: string }

export interface DayGrid {
  slots: number[];                                   // tijdstippen (ms)
  observed: (number | undefined)[];
  rows: (DaySources & { values: (number | undefined)[]; mae?: number; n: number })[];
  best: string[][];                                  // per tijdstip: bron(nen) die het dichtst bij zaten
}

/** Tijdstippen van een lokale dag (UTC-uren deelbaar door 3), alleen 05–22 u lokaal. */
export function daySlots(localDate: Date): number[] {
  const start = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()).getTime();
  const out: number[] = [];
  for (let ms = start; ms < start + 24 * 3600e3; ms += 3600e3) {
    const d = new Date(ms);
    if (d.getUTCHours() % 3 === 0 && d.getHours() >= 5 && d.getHours() <= 22) out.push(ms);
  }
  return out;
}

export function dayGrid(docs: AuditForecastDoc[], obs: AuditObsDoc[], sources: DaySources[], slots: number[], param: AuditParam, nowMs: number): DayGrid {
  const observed = slots.map(t => (t <= nowMs ? observedAt(obs, t, param) : undefined));
  const rows = sources.map(s => {
    const values = slots.map(t => forecastFor(docs, s.source, t, nowMs, param));
    const errs = values.flatMap((v, i) => (v !== undefined && observed[i] !== undefined ? [absErr(param, v, observed[i]!)] : []));
    return { ...s, values, n: errs.length, mae: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length * 100) / 100 : undefined };
  });
  const best = slots.map((_, i) => {
    const ob = observed[i];
    if (ob === undefined) return [];
    const scored = rows.flatMap(r => (r.values[i] !== undefined ? [{ s: r.source, e: absErr(param, r.values[i]!, ob) }] : []));
    if (!scored.length) return [];
    const min = Math.min(...scored.map(x => x.e));
    return scored.filter(x => x.e - min < 1e-9).map(x => x.s);
  });
  return { slots, observed, rows, best };
}

export interface WinnerRow extends DaySources { n: number; mae: number; wins: number }

/** Uitslag over een periode: gemiddelde afwijking en hoe vaak een bron het dichtst bij zat. */
export function periodWinners(docs: AuditForecastDoc[], obs: AuditObsDoc[], sources: DaySources[], fromMs: number, toMs: number, param: AuditParam, nowMs: number): WinnerRow[] {
  const slots: number[] = [];
  for (let t = Math.ceil(fromMs / (3 * 3600e3)) * 3 * 3600e3; t <= Math.min(toMs, nowMs); t += 3 * 3600e3) slots.push(t);
  const g = dayGrid(docs, obs, sources, slots, param, nowMs);
  const wins = new Map<string, number>();
  g.best.forEach(b => b.forEach(s => wins.set(s, (wins.get(s) || 0) + 1)));
  return g.rows
    .filter(r => r.n > 0)
    .map(r => ({ source: r.source, label: r.label, kind: r.kind, n: r.n, mae: r.mae!, wins: wins.get(r.source) || 0 }))
    .sort((a, b) => a.mae - b.mae);
}
