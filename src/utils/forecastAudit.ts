// Rekenkern van de voorspellingsaudit: koppelt opgeslagen verwachtingen aan
// metingen en berekent per bron, onderdeel en vooruitkijktijd hoe goed het was.
// Puur (geen I/O), zodat de Beta-pagina en exports dezelfde cijfers gebruiken.

export interface AuditPoint {
  t: string; lead: number;
  hs?: number; tp?: number; dir?: number; windKn?: number; windDir?: number; gustKn?: number;
  spotHs?: number; chance?: number; tide?: number; surfMin?: number; surfMax?: number; rating?: string;
  energyKj?: number; // eigen energiewaarde van de site (Surfline/surfnerd, kJ) — andere grootheid dan kW/m
  why?: { s: number; p: number; w: number; t: number }; // NzSurf: factoren van de kans (grootte, periode, wind, getij)
}
export interface AuditForecastDoc {
  runAt: string; runDate: string; spotId: string;
  source: string; label: string; kind: 'nzsurf' | 'model' | 'site';
  points: AuditPoint[]; note?: string;
  algoVersion?: string; calibrationAsOf?: string; // live v2: welke regels en welke kalibratie
}
export interface ObsPoint { t: string; hs?: number; tm02?: number; dir?: number; windKn?: number; windDir?: number; level?: number }
export interface AuditObsDoc { date: string; points: ObsPoint[]; stations?: string[]; source?: string; windAt10m?: boolean }

export type AuditParam = 'hs' | 'tp' | 'tpPeak' | 'dir' | 'windKn' | 'windDir' | 'power';

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
/**
 * Wind gemeten op een hoog meetpunt op zee (Lichteiland Goeree, Europlatform: ±30 m)
 * waait harder dan op 10 m, de hoogte waarop alle modellen hun wind geven. Omrekenen
 * met het windprofiel boven zee (machtswet, exponent 0,11): (10/30)^0,11 ≈ 0,89.
 */
export const WIND_10M_FACTOR = 0.89;
const HIGH_WIND_STATION = /^WINDSHD@.*(lichteiland|europlatform)/i;

export function cleanObservations(docs: AuditObsDoc[]): AuditObsDoc[] {
  return docs.map(d => {
    const points = (d.points || []).map(plausibleObs);
    // Eén keer omrekenen (de functie wordt soms twee keer op dezelfde data gebruikt).
    if (d.windAt10m || !(d.stations || []).some(s => HIGH_WIND_STATION.test(s))) return { ...d, points };
    return {
      ...d, windAt10m: true,
      points: points.map(p => (typeof p.windKn === 'number' ? { ...p, windKn: Math.round(p.windKn * WIND_10M_FACTOR * 100) / 100 } : p)),
    };
  });
}

/**
 * Spots waar de golfrichting niet eerlijk te toetsen is: het rekenpunt ligt dicht onder de
 * kust (Maasvlakte, bij de reddingspost), waar de modellen de golven naar het strand laten
 * draaien, terwijl de boei op open zee meet. Alle modellen zitten daar ±45° naast.
 */
export const DIR_UNRELIABLE_SPOTS = new Set(['maasvlakte']);
/** Verwachtingen zoals de audit ze toetst: zonder golfrichting waar die niet te vergelijken is. */
export function auditView(docs: AuditForecastDoc[], spotId: string): AuditForecastDoc[] {
  if (!DIR_UNRELIABLE_SPOTS.has(spotId)) return docs;
  return docs.map(d => ({ ...d, points: (d.points || []).map(p => { const { dir: _d, ...rest } = p; return rest as AuditPoint; }) }));
}

// ── Soort golfperiode per bron ────────────────────────────────────────────────
// De boei meet de gemiddelde periode (Tm02). De modellen via Open-Meteo (wave_period) en
// NzSurf geven ook een gemiddelde periode; die vergelijken we rechtstreeks met Tm02.
// Sites geven een piek- of swellperiode (Surfline: dominante swell). Die is niet hetzelfde;
// we vergelijken ze apart en alleen indicatief met Tm02 × 1,25 (gangbare verhouding Tp/Tm02).
export const MEAN_PERIOD_SOURCES = new Set(['nzsurf', 'nzsurf-v2', 'nzsurf-v2-live', 'nzsurf-concept', 'nzsurf-hybride', 'dwd', 'meteofrance', 'ecmwf', 'gfs', 'openmeteo']);
export const periodKind = (source: string): 'mean' | 'peak' => (MEAN_PERIOD_SOURCES.has(source) ? 'mean' : 'peak');
/** Gemeten Tm02 → piekperiode (benadering, alleen voor de indicatieve vergelijking en de surfregel). */
export const TM02_TO_TP = 1.25;

/** Bronnen die in de ranglijsten niet als aparte stem tellen (kopie van andere bronnen). */
export const NOT_RANKED_SOURCES = new Set(['openmeteo']);

export const PARAMS: { key: AuditParam; label: string; unit: string; obsKey: keyof ObsPoint; circular?: boolean; note?: string }[] = [
  { key: 'hs', label: 'Golfhoogte', unit: 'm', obsKey: 'hs' },
  { key: 'tp', label: 'Golfperiode', unit: 's', obsKey: 'tm02', note: 'gemiddelde periode: modellen en NzSurf tegen de gemeten Tm02' },
  { key: 'tpPeak', label: 'Piek-/swellperiode (indicatief)', unit: 's', obsKey: 'tm02', note: 'sites met een piek- of swellperiode, tegen Tm02 × 1,25 (benadering)' },
  { key: 'dir', label: 'Golfrichting', unit: '°', obsKey: 'dir', circular: true },
  { key: 'windKn', label: 'Windsnelheid', unit: 'kn', obsKey: 'windKn' },
  { key: 'windDir', label: 'Windrichting', unit: '°', obsKey: 'windDir', circular: true },
  { key: 'power', label: 'Golfkracht', unit: 'kW/m', obsKey: 'hs', note: 'berekend uit hoogte en gemiddelde periode: 0,49 × Hs² × 1,2 × Tm (alleen bronnen met een gemiddelde periode)' },
];

// ── Golfkracht ───────────────────────────────────────────────────────────────
// Energiestroom per meter golfkam (diep water): P = ρg²/(64π) · Hs² · Te ≈ 0,49 · Hs² · Te  [kW/m].
// Te (energieperiode) ≈ 1,2 × gemiddelde periode (Tm02) bij een gewone windzee/swell-mix.
// De modellen in de audit geven een gemiddelde periode (Open-Meteo wave_period, ≈ Tm02);
// we rekenen dus overal met dezelfde omrekening, zodat de vergelijking eerlijk is.
export const TE_PER_TM = 1.2;
export const waveFluxKw = (hs: number, te: number) => Math.round(0.49 * hs * hs * te * 10) / 10;
export const powerKw = (hs?: number, period?: number) =>
  typeof hs === 'number' && typeof period === 'number' && hs >= 0 && period > 0 ? waveFluxKw(hs, TE_PER_TM * period) : undefined;

export const LEAD_BUCKETS = [
  // Alleen echte vooruitverwachtingen: punten op of vóór het ophaalmoment tellen niet mee.
  { key: 'd1', label: 'Dag 1 (0–24 u)', min: 0.01, max: 24 },
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
      if (NOT_RANKED_SOURCES.has(doc.source)) continue;
      const pk = periodKind(doc.source);
      for (const prm of PARAMS) {
        // Periode: gemiddelde-periodebronnen tegen Tm02, piekbronnen apart tegen Tm02 × 1,25.
        if (prm.key === 'tp' && pk !== 'mean') continue;
        if (prm.key === 'tpPeak' && pk !== 'peak') continue;
        if (prm.key === 'power' && pk !== 'mean') continue;
        const fc = prm.key === 'power' ? powerKw(p.hs, p.tp) : prm.key === 'tpPeak' ? p.tp : p[prm.key];
        const ob = prm.key === 'power' ? powerKw(o.hs, o.tm02)
          : prm.key === 'tpPeak' ? (typeof o.tm02 === 'number' ? Math.round(o.tm02 * TM02_TO_TP * 10) / 10 : undefined)
          : o[prm.obsKey] as number | undefined;
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
/** Voor een rang in de eerlijke vergelijking: zoveel verschillende meeturen en dagen. */
export const MIN_HOURS = 40, MIN_DAYS = 5;

// ── Eerlijke vergelijking: op dezelfde uren als NzSurf ──────────────────────
//
// Elke bron dekt andere uren (Surfline alleen als de app open stond, Wompy één waarde
// per dag, Secret Swell alleen na een upload). Een ranglijst over verschillende uren
// vergelijkt deels het weer. Daarom: per bron alleen de uren (en vooruitkijkklasse)
// (in hetzelfde 3-uursvak) waarop ook NzSurf een verwachting had; per vak eerst middelen over de ophaalrondes en uren
// (één stem per meetuur). Het verschil met NzSurf op die uren is de maatstaf; de getoonde
// "afwijking" = NzSurf over al zijn uren + dat verschil, zodat alle getallen op dezelfde
// schaal staan. Onzekerheid: 90%-interval met bootstrap per dag (dagen trekken met
// teruglegging, want uren binnen een dag hangen samen).

export interface FairScore extends Score {
  hours: number;     // verschillende meeturen gemeen met NzSurf
  days: number;      // verschillende dagen
  delta: number;     // gem. |fout| bron − NzSurf op dezelfde uren (negatief = beter)
  lo: number; hi: number; // 90%-interval van delta
  ranked: boolean;   // genoeg data voor een rang
  mean: boolean;     // vergeleken met NzSurf (anders: eigen uren, geen referentie)
}

/**
 * Tijdvak van 3 uur (UTC) voor het koppelen van bronnen: NzSurf rekent in blokken op
 * NL-tijd (bv. 02:00 UTC), de modellen op UTC-uren deelbaar door 3 (03:00). Afronden op het
 * dichtstbijzijnde 3-uursvak koppelt die aan elkaar (max. 1,5 uur verschil).
 */
export function slotKey(t: string | number): string {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return new Date(Math.round(ms / (3 * 3600e3)) * 3 * 3600e3).toISOString().slice(0, 13);
}

function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function fairScores(pairs: Pair[], param: AuditParam, ref = 'nzsurf', boot = 400): FairScore[] {
  const ps = pairs.filter(p => p.param === param);
  // per bron: sleutel (uur + klasse) → gemiddelde |fout| en fout over de ophaalrondes
  const per = new Map<string, Map<string, { a: number; e: number; n: number; day: string }>>();
  const meta = new Map<string, { label: string; kind: string }>();
  for (const p of ps) {
    const key = `${slotKey(p.t)}|${p.bucket}`;
    if (!per.has(p.source)) per.set(p.source, new Map());
    const m = per.get(p.source)!;
    const c = m.get(key) || { a: 0, e: 0, n: 0, day: p.t.slice(0, 10) };
    c.a += Math.abs(p.err); c.e += p.err; c.n++; m.set(key, c);
    meta.set(p.source, { label: p.label, kind: p.kind });
  }
  const refMap = per.get(ref);
  const avg = (m: Map<string, { a: number; e: number; n: number }>) => {
    let a = 0, e = 0, n = 0; for (const c of m.values()) { a += c.a / c.n; e += c.e / c.n; n++; } return { mae: n ? a / n : 0, bias: n ? e / n : 0, n };
  };
  const refAll = refMap ? avg(refMap) : null;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const out: FairScore[] = [];
  for (const [src, m] of per) {
    const all = avg(m);
    const rmse = Math.sqrt([...m.values()].reduce((s, c) => s + (c.e / c.n) ** 2, 0) / (m.size || 1));
    const base = { source: src, label: meta.get(src)!.label, kind: meta.get(src)!.kind, param, rmse: r2(rmse) };
    if (!refMap || !refAll) {
      const days = new Set([...m.values()].map(c => c.day)).size;
      out.push({ ...base, n: m.size, mae: r2(all.mae), bias: r2(all.bias), hours: m.size, days, delta: 0, lo: 0, hi: 0, ranked: m.size >= MIN_HOURS && days >= MIN_DAYS, mean: false });
      continue;
    }
    // Gemeenschappelijke uren
    const rows: { d: number; eb: number; day: string }[] = [];
    for (const [k, c] of m) {
      const r = refMap.get(k); if (!r) continue;
      rows.push({ d: c.a / c.n - r.a / r.n, eb: c.e / c.n - r.e / r.n, day: c.day });
    }
    const hours = new Set([...m.keys()].filter(k => refMap.has(k)).map(k => k.split('|')[0])).size;
    const byDay = new Map<string, number[]>();
    for (const r of rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day)!.push(r.d); }
    const days = byDay.size;
    const delta = rows.length ? rows.reduce((s, r) => s + r.d, 0) / rows.length : 0;
    const dBias = rows.length ? rows.reduce((s, r) => s + r.eb, 0) / rows.length : 0;
    let lo = delta, hi = delta;
    if (src !== ref && days >= 2) {
      const dayList = [...byDay.values()], rnd = seeded(src.length * 7919 + param.length), sims: number[] = [];
      for (let b = 0; b < boot; b++) {
        let s = 0, n = 0;
        for (let i = 0; i < dayList.length; i++) { const dl = dayList[Math.floor(rnd() * dayList.length)]; for (const v of dl) { s += v; n++; } }
        sims.push(n ? s / n : 0);
      }
      sims.sort((a, b) => a - b);
      lo = sims[Math.floor(boot * 0.05)]; hi = sims[Math.floor(boot * 0.95)];
    }
    out.push({
      ...base, n: hours, hours, days, mean: true,
      mae: r2(refAll.mae + delta), bias: r2(refAll.bias + dBias),
      delta: r2(delta), lo: r2(lo), hi: r2(hi),
      ranked: src === ref ? true : hours >= MIN_HOURS && days >= MIN_DAYS,
    });
  }
  return out.sort((a, b) => Number(b.ranked) - Number(a.ranked) || a.mae - b.mae);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    // Getallen met decimale komma: anders leest Nederlandse Excel 0.27 als tekst of datum.
    const s = v === undefined || v === null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
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

// ── Eigen energiewaarde van sites (kJ) ──────────────────────────────────────
// Surfline en surfnerd geven "energy" in kJ: een andere grootheid dan kW/m (en hun
// formule is niet openbaar). Eerlijke toets: volgt hun getal de gemeten golfkracht?
// → correlatie (r) en de vaste omrekenfactor (mediaan gemeten kW/m ÷ hun kJ).

export interface EnergyScore {
  source: string; label: string; n: number;
  rKj: number;            // correlatie hun kJ ↔ gemeten kW/m
  rCalc?: number;         // ter vergelijking: correlatie kracht uit hun eigen Hs/T ↔ gemeten
  kwPerKj: number;        // mediaan gemeten kW/m per kJ
  mae: number;            // gem. afwijking (kW/m) na die vaste omrekening
}

const pearson = (xs: number[], ys: number[]) => {
  const n = xs.length; if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};

export function energyScores(forecasts: AuditForecastDoc[], observations: AuditObsDoc[], minN = MIN_N): EnergyScore[] {
  const obsByHour = new Map<string, ObsPoint>();
  for (const d of observations) for (const p of d.points || []) obsByHour.set(p.t.slice(0, 13), p);
  const by = new Map<string, { label: string; kj: number[]; obs: number[]; calc: number[]; calcObs: number[] }>();
  for (const doc of forecasts) {
    for (const p of doc.points || []) {
      if (typeof p.energyKj !== 'number' || !leadBucketOf(p.lead)) continue;
      const o = obsByHour.get(p.t.slice(0, 13));
      const ob = o ? powerKw(o.hs, o.tm02) : undefined;
      if (ob === undefined) continue;
      const g = by.get(doc.source) ?? { label: doc.label, kj: [], obs: [], calc: [], calcObs: [] };
      g.kj.push(p.energyKj); g.obs.push(ob);
      const c = powerKw(p.hs, p.tp);
      if (c !== undefined) { g.calc.push(c); g.calcObs.push(ob); }
      by.set(doc.source, g);
    }
  }
  const out: EnergyScore[] = [];
  for (const [source, g] of by) {
    if (g.kj.length < minN) continue;
    const ratios = g.kj.map((k, i) => (k > 0 ? g.obs[i] / k : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
    const f = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0;
    const mae = g.kj.reduce((a, k, i) => a + Math.abs(k * f - g.obs[i]), 0) / g.kj.length;
    const rCalc = pearson(g.calc, g.calcObs);
    out.push({ source, label: g.label, n: g.kj.length, rKj: pearson(g.kj, g.obs), rCalc: Number.isFinite(rCalc) ? rCalc : undefined, kwPerKj: f, mae });
  }
  return out.sort((a, b) => b.rKj - a.rKj);
}
