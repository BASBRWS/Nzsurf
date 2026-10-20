// Beta: kans tegen werkelijkheid — drie kandidaten, één waarheid.
//
//   1. NzSurf nu        — de algemene kans zoals de app hem op dat moment gaf
//   2. Test (persoonlijk) — surfvenster uit het profiel (utils/surfProfile), op dezelfde NzSurf-data
//   3. NzSurf hybride   — de algemene kans, maar op de data van de hybride (sterkste bronnen)
//
// Waarheid: het webcamoordeel voor de boards van de gebruiker (beste board telt),
// los van elke voorspelling. Oudere metingen zonder oordeel: benadering uit wat de
// beelden wél los van de hoogte zeggen (surfers in het water, plat, closeout/rommelig),
// apart gemarkeerd. Bewust NIET uit de geschatte hoogte: dat zou dezelfde drempels
// toetsen als het surfvenster en de test bij voorbaat laten winnen.

import type { ForecastData, SurfSpot, UserProfile } from '../types';
import type { WebcamMeasurement, WebcamVerdict } from '../services/webcamMeasure';
import type { AuditForecastDoc, AuditPoint } from './forecastAudit';
import { computeSurfChance } from './spotKnowledge';
import { personalHours, surfWindow } from './surfProfile';
import { windQualityFor } from './windQuality';
import { HYBRID_SOURCE } from './forecastHybrid';

export type Truth = { y: number; label: string; source: 'oordeel' | 'achteraf' };
export interface TestRow {
  m: WebcamMeasurement;
  exact: boolean;           // volledig verwachtingsuur opgeslagen (anders wind/getij benaderd)
  nzsurf?: number; personal?: number; hybrid?: number;   // kansen 0–100
  truth?: Truth;
}

const Y: Record<WebcamVerdict, number> = { nee: 0, matig: 0.5, ja: 1 };
const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

/** Welke boardsoort(en) heeft de gebruiker? Via het drijfvermogen van elk board. */
export function userBoardClasses(user: UserProfile): ('longboard' | 'mid' | 'shortboard')[] {
  const boards = user.boards?.length ? user.boards : [];
  const cls = boards.map(b => surfWindow(user, b).floatClass).map(c => (c === 'veel' ? 'longboard' : c === 'gemiddeld' ? 'mid' : 'shortboard'));
  return [...new Set(cls.length ? cls : ['mid'])] as ('longboard' | 'mid' | 'shortboard')[];
}

export function truthFor(m: WebcamMeasurement, user: UserProfile): Truth | undefined {
  const r = m.result;
  if (!r || r.framesUsable === 0) return undefined;
  if (r.verdict) {
    const vals = userBoardClasses(user).map(c => r.verdict?.[c]).filter((v): v is WebcamVerdict => !!v);
    if (vals.length) {
      const best = vals.reduce((a, b) => (Y[b] > Y[a] ? b : a));
      return { y: Y[best], label: best, source: 'oordeel' };
    }
  }
  // Oudere metingen: alleen signalen die niet uit de hoogte komen.
  if (typeof r.surfers === 'number' && r.surfers >= 1) return { y: 1, label: `${r.surfers} surfer(s) in het water`, source: 'achteraf' };
  if (r.quality === 'plat') return { y: 0, label: 'plat', source: 'achteraf' };
  if (r.quality === 'closeout' || r.quality === 'rommelig') return { y: 0, label: `${r.quality}, niemand in het water`, source: 'achteraf' };
  return undefined;
}

/** NzSurf-uur van de cameraspot zoals opgeslagen bij de meting. */
function hourFromSnapshot(m: WebcamMeasurement, spot: SurfSpot): { f: ForecastData; exact: boolean } | undefined {
  const s = m.forecast;
  if (!s || typeof s.modelHs !== 'number' || typeof s.period !== 'number') return undefined;
  const exact = typeof s.windQuality === 'number';
  const wq = exact ? { windQuality: s.windQuality!, windType: undefined }
    : typeof s.windDir === 'number' && typeof s.windKn === 'number' ? windQualityFor(spot.coastlineAngle ?? 300, s.windDir, s.windKn) : { windQuality: 50, windType: undefined };
  const f = {
    timestamp: s.t, waveHeight: s.modelHs, spotWaveHeight: s.spotHs, swellPeriod: s.period, swellDirection: s.swellDir ?? 300,
    windSpeed: s.windKn ?? 0, windDirection: s.windDir ?? 0, windQuality: wq.windQuality, windType: wq.windType,
    tideFactor: s.tideFactor ?? 1, swellExposure: s.swellExposure,
  } as unknown as ForecastData;
  return { f, exact };
}

/** Punt op het dichtstbijzijnde uur (≤ 90 min) uit de laatste run vóór `at`. */
function pointAt(docs: AuditForecastDoc[], at: number): AuditPoint | undefined {
  const run = docs.filter(d => Date.parse(d.runAt) <= at).sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0];
  if (!run) return undefined;
  let best: AuditPoint | undefined, bd = Infinity;
  for (const p of run.points || []) { const d = Math.abs(Date.parse(p.t) - at); if (d < bd) { bd = d; best = p; } }
  return bd <= 90 * 60e3 ? best : undefined;
}

/**
 * Hybride-data voor de cameraspot: de hybride bestaat voor de auditspot (Ouddorp, 13 km).
 * Zijn verschil met NzSurf op dat uur (hoogte als factor, periode en windrichting als
 * verschuiving) is een zee-effect en wordt op de NzSurf-data van de cameraspot gelegd.
 */
function hybridHour(f: ForecastData, spot: SurfSpot, audit: AuditForecastDoc[], at: number): ForecastData | undefined {
  const nz = pointAt(audit.filter(d => d.kind === 'nzsurf'), at);
  const hy = pointAt(audit.filter(d => d.source === HYBRID_SOURCE), at);
  if (!nz || !hy || typeof nz.hs !== 'number' || typeof hy.hs !== 'number' || nz.hs < 0.05) return undefined;
  const k = hy.hs / nz.hs;
  const dTp = typeof hy.tp === 'number' && typeof nz.tp === 'number' ? hy.tp - nz.tp : 0;
  const dDir = typeof hy.windDir === 'number' && typeof nz.windDir === 'number' ? angDiff(hy.windDir, nz.windDir) : 0;
  const windDirection = ((f.windDirection + dDir) % 360 + 360) % 360;
  const wq = windQualityFor(spot.coastlineAngle ?? 300, windDirection, f.windSpeed);
  return {
    ...f, waveHeight: f.waveHeight * k, spotWaveHeight: typeof f.spotWaveHeight === 'number' ? f.spotWaveHeight * k : undefined,
    swellPeriod: Math.max(1, f.swellPeriod + dTp), windDirection, windQuality: wq.windQuality, windType: wq.windType, surfChance: undefined,
  };
}

export function buildTestRows(measurements: WebcamMeasurement[], user: UserProfile, spot: SurfSpot, audit: AuditForecastDoc[]): TestRow[] {
  return measurements.map(m => {
    const truth = truthFor(m, user);
    const h = hourFromSnapshot(m, spot);
    if (!h) return { m, exact: false, truth };
    const at = Date.parse(m.runAt);
    // Alle drie op exact dezelfde invoer. Bij nieuwe metingen (volledig uur bewaard) is dit
    // gelijk aan wat de app gaf; bij oudere met dezelfde benadering (getij neutraal) als de andere twee.
    const nzsurf = computeSurfChance(spot, h.f).chance;
    const personal = personalHours(spot, [h.f], user).hours[0]?.personal;
    const fh = hybridHour(h.f, spot, audit, at);
    const hybrid = fh ? computeSurfChance(spot, fh).chance : undefined;
    return { m, exact: h.exact, nzsurf, personal, hybrid, truth };
  });
}

export interface CandidateScore { key: 'nzsurf' | 'personal' | 'hybrid'; n: number; hit: number; brier: number; bias: number }

/** Alleen rijen waar alle drie een kans hebben én er een waarheid is: dezelfde momenten voor iedereen. */
export function scoreCandidates(rows: TestRow[], onlyJudged = false): { n: number; scores: CandidateScore[] } {
  const usable = rows.filter(r => r.truth && (!onlyJudged || r.truth.source === 'oordeel')
    && typeof r.nzsurf === 'number' && typeof r.personal === 'number' && typeof r.hybrid === 'number');
  const scores = (['nzsurf', 'personal', 'hybrid'] as const).map(key => {
    const ps = usable.map(r => ({ p: (r[key] as number) / 100, y: r.truth!.y }));
    const n = ps.length || 1;
    return {
      key, n: ps.length,
      hit: ps.filter(x => Math.abs(x.p - x.y) <= 0.5).length / n,       // juiste kant van 50%
      brier: ps.reduce((a, x) => a + (x.p - x.y) ** 2, 0) / n,           // lager = beter
      bias: ps.reduce((a, x) => a + (x.p - x.y), 0) / n,                  // + = te optimistisch
    };
  });
  return { n: usable.length, scores };
}
