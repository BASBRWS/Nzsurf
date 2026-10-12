import { AuditForecastDoc, AuditObsDoc, AuditPoint, ObsPoint } from './forecastAudit';
import { angleDiff } from './spotKnowledge';
import { knotsToBft } from './surfMoments';

/**
 * "Is er te surfen?" — voorspellers vergeleken op het oordeel, niet alleen op
 * losse getallen. Puur (geen I/O): het Beta-scherm, de exports en tests gebruiken
 * dezelfde regels.
 *
 * - Eigen oordeel waar een voorspeller dat geeft: NzSurf (kans), breakfinder (score),
 *   Surfline (rating). De anderen krijgen het oordeel van de gedeelde regel op hun
 *   eigen cijfers (gemarkeerd als afgeleid).
 * - Werkelijkheid: dezelfde gedeelde regel op de metingen van Rijkswaterstaat (zee,
 *   niet het strand). Spotrapporten blijven de echte toets op het strand.
 * - De regel staat open en is in het scherm aan te passen.
 */

export interface SurfRule {
  minWave: number;      // m, golfhoogte
  minPeriod: number;    // s, (piek)periode
  maxOnshoreKn: number; // kn, max wind als die aanlandig is
  maxOtherKn: number;   // kn, max wind bij zij- of aflandige wind
}
export const DEFAULT_RULE: SurfRule = { minWave: 0.6, minPeriod: 5, maxOnshoreKn: 16, maxOtherKn: 25 };

/** Ouddorp: het strand kijkt naar 300° (WNW). */
export const COAST_ANGLE = 300;
/** Boei meet de gemiddelde periode (Tm02); ×1,25 ≈ piekperiode zoals voorspellers die geven. */
export const TM02_TO_TP = 1.25;

export type WindAngle = 'aflandig' | 'zijwind' | 'aanlandig';
export const windAngle = (windFromDeg: number, coast = COAST_ANGLE): WindAngle => {
  const d = angleDiff(windFromDeg, (coast + 180) % 360);
  return d <= 60 ? 'aflandig' : d >= 120 ? 'aanlandig' : 'zijwind';
};

interface Vars { hs?: number; tp?: number; dir?: number; windKn?: number; windDir?: number }

/** De gedeelde regel. Zonder golfhoogte geen oordeel; ontbrekende periode of wind wordt niet afgestraft. */
export function ruleVerdict(v: Vars, rule: SurfRule): boolean | undefined {
  if (typeof v.hs !== 'number') return undefined;
  if (v.hs < rule.minWave) return false;
  if (typeof v.tp === 'number' && v.tp < rule.minPeriod) return false;
  if (typeof v.windKn === 'number') {
    const onshore = typeof v.windDir === 'number' && windAngle(v.windDir) === 'aanlandig';
    if (v.windKn > (onshore ? rule.maxOnshoreKn : rule.maxOtherKn)) return false;
  }
  return true;
}

const SURFLINE_ORDER = ['FLAT', 'VERY_POOR', 'POOR', 'POOR_TO_FAIR', 'FAIR', 'FAIR_TO_GOOD', 'GOOD', 'VERY_GOOD', 'GOOD_TO_EPIC', 'EPIC'];

/** Bronnen die zelf een oordeel geven. */
export const OWN_VERDICT_SOURCES = new Set(['nzsurf', 'breakfinder', 'surfline']);

/** Oordeel van een voorspeller voor één punt; `own` = eigen oordeel van de voorspeller. */
export function forecastVerdict(source: string, p: AuditPoint, rule: SurfRule): { ok?: boolean; own: boolean } {
  if ((source === 'nzsurf' || source === 'breakfinder') && typeof p.chance === 'number') return { ok: p.chance >= 45, own: true };
  if (source === 'surfline' && p.rating) {
    const i = SURFLINE_ORDER.indexOf(p.rating);
    if (i >= 0) return { ok: i >= SURFLINE_ORDER.indexOf('POOR_TO_FAIR'), own: true };
  }
  return { ok: ruleVerdict(p, rule), own: false };
}

/** Werkelijkheid uit de metingen. */
export function observedVars(o: ObsPoint): Vars {
  return { hs: o.hs, tp: typeof o.tm02 === 'number' ? o.tm02 * TM02_TO_TP : undefined, dir: o.dir, windKn: o.windKn, windDir: o.windDir };
}
export const observedVerdict = (o: ObsPoint, rule: SurfRule) => ruleVerdict(observedVars(o), rule);

// ── Onderdelen: wanneer telt een voorspelling als "goed"? ───────────────────

export const COMPONENTS = [
  { key: 'total', label: 'Te surfen?', rule: 'zelfde oordeel als de werkelijkheid' },
  { key: 'hs', label: 'Golf', rule: '≤ 0,25 m of ≤ 25% verschil' },
  { key: 'tp', label: 'Periode', rule: '≤ 1,5 s (gemeten Tm02 × 1,25)' },
  { key: 'dir', label: 'Swellrichting', rule: '≤ 30°' },
  { key: 'wind', label: 'Windkracht', rule: '≤ 1 Bft verschil' },
  { key: 'windDir', label: 'Windrichting', rule: '≤ 30°' },
  { key: 'angle', label: 'Windhoek', rule: 'zelfde: aflandig / zij / aanlandig' },
] as const;
export type ComponentKey = typeof COMPONENTS[number]['key'];

export function componentHits(source: string, p: AuditPoint, o: ObsPoint, rule: SurfRule): Partial<Record<ComponentKey, boolean>> {
  const ov = observedVars(o);
  const out: Partial<Record<ComponentKey, boolean>> = {};
  const fv = forecastVerdict(source, p, rule).ok;
  const tv = ruleVerdict(ov, rule);
  if (fv !== undefined && tv !== undefined) out.total = fv === tv;
  if (typeof p.hs === 'number' && typeof ov.hs === 'number') out.hs = Math.abs(p.hs - ov.hs) <= Math.max(0.25, 0.25 * ov.hs);
  if (typeof p.tp === 'number' && typeof ov.tp === 'number') out.tp = Math.abs(p.tp - ov.tp) <= 1.5;
  if (typeof p.dir === 'number' && typeof ov.dir === 'number') out.dir = angleDiff(p.dir, ov.dir) <= 30;
  if (typeof p.windKn === 'number' && typeof ov.windKn === 'number') out.wind = Math.abs(knotsToBft(p.windKn) - knotsToBft(ov.windKn)) <= 1;
  if (typeof p.windDir === 'number' && typeof ov.windDir === 'number') {
    out.windDir = angleDiff(p.windDir, ov.windDir) <= 30;
    out.angle = windAngle(p.windDir) === windAngle(ov.windDir);
  }
  return out;
}

// ── Hulpjes voor tijd ───────────────────────────────────────────────────────

/** Daglichtuur (lokaal 07–20 u): alleen dan is "te surfen?" een zinnige vraag. */
export const isDaytime = (tMs: number) => { const h = new Date(tMs).getHours(); return h >= 7 && h <= 20; };
/** Vooruitkijkdag: 1 = binnen 24 uur, 2 = 24–48 uur, … */
export const leadDay = (leadHours: number) => Math.max(1, Math.ceil(Math.max(leadHours, 0.01) / 24));

export function obsIndex(obs: AuditObsDoc[]): Map<string, ObsPoint> {
  const m = new Map<string, ObsPoint>();
  for (const d of obs) for (const o of d.points || []) m.set(o.t.slice(0, 13), o);
  return m;
}
const hourKey = (tMs: number) => new Date(tMs).toISOString().slice(0, 13);

/** Tijdstippen (UTC-uren deelbaar door 3) overdag op een lokale dag. */
export function daySlots(localDate: Date): number[] {
  const start = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()).getTime();
  const out: number[] = [];
  for (let ms = start; ms < start + 24 * 3600e3; ms += 3600e3) {
    if (new Date(ms).getUTCHours() % 3 === 0 && isDaytime(ms)) out.push(ms);
  }
  return out;
}

/**
 * Het punt van een voorspeller voor tijdstip tMs: uit de laatste verwachting die vóór
 * dat moment (en vóór nu) gemaakt is, het dichtstbijzijnde punt (max 90 min; NzSurf
 * rekent in blokken op NL-tijd, de rest op UTC-uren).
 */
export function pointFor(docs: AuditForecastDoc[], source: string, tMs: number, nowMs: number): AuditPoint | undefined {
  const cutoff = Math.min(tMs, nowMs);
  const doc = docs.filter(d => d.source === source && Date.parse(d.runAt) <= cutoff)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0];
  if (!doc) return undefined;
  let best: AuditPoint | undefined;
  let bestDt = 90 * 60e3 + 1;
  for (const p of doc.points || []) {
    const dt = Math.abs(Date.parse(p.t) - tMs);
    if (dt < bestDt) { best = p; bestDt = dt; }
  }
  return best;
}

// ── Tabel 1: wat voorspelt iedereen de komende dagen ────────────────────────

export interface OutlookCell { ok: number; total: number; own: boolean }

/** Per bron en per dag: hoeveel daglichttijdstippen "te surfen" volgens de laatste verwachting. */
export function outlook(docs: AuditForecastDoc[], sources: string[], days: Date[], nowMs: number, rule: SurfRule): Record<string, (OutlookCell | null)[]> {
  const out: Record<string, (OutlookCell | null)[]> = {};
  for (const s of sources) {
    out[s] = days.map(day => {
      let ok = 0, total = 0, own = false;
      for (const t of daySlots(day)) {
        const p = pointFor(docs, s, t, nowMs); // laatste verwachting tot nu (of tot dat tijdstip)
        if (!p) continue;
        const v = forecastVerdict(s, p, rule);
        if (v.ok === undefined) continue;
        total++; if (v.ok) ok++; own = own || v.own;
      }
      return total ? { ok, total, own } : null;
    });
  }
  return out;
}

// ── Tabel 4: score per onderdeel, per vooruitkijkdag, en stabiliteit ────────

export interface ScoreRow { source: string; n: Partial<Record<ComponentKey, number>>; hit: Partial<Record<ComponentKey, number>> }

/** Alle verwachtingen (elke ophaaldag) tegen de metingen; optioneel alleen één vooruitkijkdag. */
export function componentScores(docs: AuditForecastDoc[], obs: AuditObsDoc[], rule: SurfRule, onlyLeadDay?: number): Map<string, ScoreRow> {
  const idx = obsIndex(obs);
  const rows = new Map<string, ScoreRow>();
  for (const d of docs) {
    for (const p of d.points || []) {
      const t = Date.parse(p.t);
      if (!isDaytime(t) || p.lead < 0) continue;
      if (onlyLeadDay && leadDay(p.lead) !== onlyLeadDay) continue;
      const o = idx.get(hourKey(t));
      if (!o) continue;
      const row = rows.get(d.source) || { source: d.source, n: {}, hit: {} };
      for (const [k, ok] of Object.entries(componentHits(d.source, p, o, rule)) as [ComponentKey, boolean][]) {
        row.n[k] = (row.n[k] || 0) + 1;
        if (ok) row.hit[k] = (row.hit[k] || 0) + 1;
      }
      rows.set(d.source, row);
    }
  }
  return rows;
}

export interface StabilityRow {
  source: string;
  byLead: { day: number; n: number; pct: number }[]; // % juist "te surfen?" per vooruitkijkdag
  flipPct: number | null;   // % van de keren dat het oordeel omsloeg tussen opeenvolgende dagen
  daysAhead: number | null; // gem. aantal dagen vooraf dat het oordeel juist was én niet meer veranderde
  targets: number;          // aantal beoordeelde tijdstippen
}

/** Hoe vroeg wist een voorspeller het, en bleef het oordeel staan? (dag 1–maxDay) */
export function stability(docs: AuditForecastDoc[], obs: AuditObsDoc[], sources: string[], rule: SurfRule, maxDay = 5): StabilityRow[] {
  const idx = obsIndex(obs);
  return sources.map(source => {
    // tijdstip → (vooruitkijkdag → oordeel van de laatste ophaalronde op die dag)
    const byTarget = new Map<string, Map<number, { run: number; ok: boolean }>>();
    for (const d of docs.filter(x => x.source === source)) {
      const run = Date.parse(d.runAt);
      for (const p of d.points || []) {
        const t = Date.parse(p.t);
        if (!isDaytime(t) || p.lead < 0) continue;
        const day = leadDay(p.lead);
        if (day > maxDay) continue;
        const v = forecastVerdict(source, p, rule).ok;
        if (v === undefined) continue;
        const key = hourKey(t);
        const m = byTarget.get(key) || new Map();
        const prev = m.get(day);
        if (!prev || run > prev.run) m.set(day, { run, ok: v });
        byTarget.set(key, m);
      }
    }
    const leadHits = new Map<number, { n: number; ok: number }>();
    let flips = 0, transitions = 0, aheadSum = 0, targets = 0;
    for (const [key, m] of byTarget) {
      const o = idx.get(key);
      const truth = o ? observedVerdict(o, rule) : undefined;
      const days = [...m.keys()].sort((a, b) => b - a); // ver vooruit → dichtbij
      for (let i = 1; i < days.length; i++) { transitions++; if (m.get(days[i])!.ok !== m.get(days[i - 1])!.ok) flips++; }
      if (truth === undefined) continue;
      targets++;
      for (const day of days) {
        const h = leadHits.get(day) || { n: 0, ok: 0 };
        h.n++; if (m.get(day)!.ok === truth) h.ok++;
        leadHits.set(day, h);
      }
      // Vanaf welke dag was het juist en bleef het juist tot dag 1?
      let ahead = 0;
      for (const day of [...days].reverse()) { // dag 1, 2, 3, …
        if (day !== ahead + 1 || m.get(day)!.ok !== truth) break;
        ahead = day;
      }
      aheadSum += ahead;
    }
    return {
      source,
      byLead: [...leadHits.entries()].sort((a, b) => a[0] - b[0]).map(([day, h]) => ({ day, n: h.n, pct: Math.round(h.ok / h.n * 100) })),
      flipPct: transitions ? Math.round(flips / transitions * 100) : null,
      daysAhead: targets ? Math.round(aheadSum / targets * 10) / 10 : null,
      targets,
    };
  });
}
