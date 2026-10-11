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
