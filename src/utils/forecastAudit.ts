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

/**
 * Natuurkundig mogelijke meetwaarden. Rijkswaterstaat markeert ontbrekende
 * metingen met codes als 99999 (cm) en 9999 (s); een uurgemiddelde met zo'n
 * code erin geeft onzin (bv. 334 m golf). Waarden daarbuiten tellen niet mee.
 */
export const OBS_LIMITS: Record<Exclude<keyof ObsPoint, 't'>, [number, number]> = {
  hs: [0, 15], tm02: [0.5, 25], dir: [0, 360], windKn: [0, 90], windDir: [0, 360], level: [-5, 6],
};
export function plausibleObs<T extends Partial<ObsPoint>>(p: T): T {
  const out: any = { ...p };
  for (const [k, [lo, hi]] of Object.entries(OBS_LIMITS)) {
    const v = out[k];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) delete out[k];
  }
  return out;
}
/** Metingen zonder onmogelijke waarden (oude opgeslagen data wordt zo ook gefilterd). */
export function cleanObservations(docs: AuditObsDoc[]): AuditObsDoc[] {
  return docs.map(d => ({ ...d, points: (d.points || []).map(plausibleObs) }));
}

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
