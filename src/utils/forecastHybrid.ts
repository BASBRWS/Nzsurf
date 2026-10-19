// NzSurf hybride — kandidaat-opvolger van NzSurf, alleen in de Beta-audit.
//
// Vaste regels (vooraf vastgelegd, niet achteraf per dag gekozen):
//   golfhoogte    = gemiddelde van NzSurf mét biascorrectie en het NzSurf concept
//   golfperiode   = gemiddelde van NzSurf en concept (in de audit gelijkwaardig)
//   golfrichting  = NzSurf (het concept voorspelt die niet)
//   windsnelheid  = NzSurf (bewust niet gecorrigeerd: de meting op Europlatform waait
//                   harder dan aan de kust; corrigeren zou naar de wind op zee trekken)
//   windrichting  = concept
//
// De biascorrectie van NzSurf-golfhoogte gebruikt dezelfde kalibratie als het concept
// (meting ≈ a + b × verwachting per vooruitkijkklasse, krimp bij weinig data), met
// alleen metingen van vóór het ophaalmoment: geen kijken in de toekomst.

import { AuditForecastDoc, AuditObsDoc, AuditPoint } from './forecastAudit';
import { BLEND_DEFAULTS, learnSkill } from './forecastBlend';

export const HYBRID_SOURCE = 'nzsurf-hybride';
export const HYBRID_LABEL = 'NzSurf hybride';
export const HYBRID_RULES = 'golfhoogte = gem. NzSurf (biasgecorrigeerd) en concept · periode = gem. NzSurf en concept · windrichting = concept · golfrichting en windsnelheid = NzSurf';

const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

/** Conceptwaarde op tijdstip t: lineair tussen de omliggende punten (max. 3 u uit elkaar), richting via de korte boog. */
function conceptAt(points: AuditPoint[], t: number): { tp?: number; windDir?: number; hs?: number } | undefined {
  let lo: AuditPoint | undefined, hi: AuditPoint | undefined;
  for (const p of points) {
    const pt = Date.parse(p.t);
    if (pt <= t && (!lo || pt > Date.parse(lo.t))) lo = p;
    if (pt >= t && (!hi || pt < Date.parse(hi.t))) hi = p;
  }
  if (!lo || !hi) return undefined;
  const t0 = Date.parse(lo.t), t1 = Date.parse(hi.t);
  if (t1 - t0 > 3 * 3_600_000) return undefined;
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const lin = (a?: number, b?: number) => (typeof a === 'number' && typeof b === 'number' ? a + (b - a) * f : undefined);
  const dir = typeof lo.windDir === 'number' && typeof hi.windDir === 'number'
    ? (lo.windDir + angDiff(hi.windDir, lo.windDir) * f + 360) % 360 : undefined;
  return { tp: lin(lo.tp, hi.tp), hs: lin(lo.hs, hi.hs), windDir: dir };
}
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const bucketIndex = (lead: number) => {
  const i = BLEND_DEFAULTS.leadBuckets.findIndex(max => Math.max(lead, 0) < max);
  return i < 0 ? BLEND_DEFAULTS.leadBuckets.length - 1 : i;
};

export function buildHybridDocs(
  forecasts: AuditForecastDoc[], observations: AuditObsDoc[], conceptDocs: AuditForecastDoc[],
): AuditForecastDoc[] {
  const conceptByDay = new Map(conceptDocs.map(c => [c.runDate, c]));
  const r1 = (x?: number, d = 1) => (typeof x === 'number' ? r(x, d) : undefined);
  const out: AuditForecastDoc[] = [];
  for (const nz of forecasts) {
    if (nz.kind !== 'nzsurf' || !nz.points?.length) continue;
    const cDoc = conceptByDay.get(nz.runDate);
    // Ophaalmoment = het laatste van NzSurf en concept: de hybride gebruikt niets dat er toen nog niet was.
    const runAt = cDoc && Date.parse(cDoc.runAt) > Date.parse(nz.runAt) ? cDoc.runAt : nz.runAt;
    const asOf = Date.parse(nz.runAt) + 60_000;
    const skill = learnSkill(forecasts, observations, asOf, { sources: [nz.source], vars: ['hs'], exclude: {} });

    const points: AuditPoint[] = nz.points.filter(p => Date.parse(p.t) >= Date.parse(runAt) - 3_600_000).map(p => {
      const c = cDoc ? conceptAt(cDoc.points, Date.parse(p.t)) : undefined;
      const s = skill[`${nz.source}|hs|${bucketIndex(p.lead)}`];
      const hsCal = typeof p.hs === 'number' ? Math.max(0, s ? s.a + s.b * p.hs : p.hs) : undefined;
      const hs = typeof hsCal === 'number' && typeof c?.hs === 'number' ? (hsCal + c.hs) / 2 : hsCal ?? c?.hs;
      const q: AuditPoint = {
        t: p.t, lead: Math.round((Date.parse(p.t) - Date.parse(runAt)) / 3_600_000),
        hs: typeof hs === 'number' ? r(hs, 2) : undefined,
        tp: typeof c?.tp === 'number' && typeof p.tp === 'number' ? r(((c.tp + p.tp) / 2), 1) : r1(c?.tp) ?? p.tp,
        dir: p.dir,
        windKn: p.windKn,
        windDir: r1(c?.windDir, 0) ?? p.windDir,
        // Hoogte op de spot en kans volgen NzSurf, geschaald met dezelfde correctie.
        spotHs: typeof p.spotHs === 'number' && typeof p.hs === 'number' && p.hs > 0.05 && typeof hs === 'number' ? r(p.spotHs * hs / p.hs, 2) : p.spotHs,
        chance: p.chance, tide: p.tide,
      };
      return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as unknown as AuditPoint;
    });

    const d1 = skill[`${nz.source}|hs|0`];
    const corr = d1 ? `correctie golfhoogte dag 1: meting ≈ ${String(r(d1.a, 2)).replace('.', ',')} + ${String(r(d1.b, 2)).replace('.', ',')} × NzSurf (n=${d1.n})` : 'nog geen correctie (te weinig metingen)';
    out.push({
      runAt, runDate: nz.runDate, spotId: nz.spotId,
      source: HYBRID_SOURCE, label: HYBRID_LABEL, kind: 'model',
      note: `Regels: ${HYBRID_RULES}. ${corr}.`,
      points,
    });
  }
  return out;
}
