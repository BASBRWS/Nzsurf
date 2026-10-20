// Persoonlijke surfkans (Beta): wanneer is het surfbaar voor déze surfer, met zijn boards?
//
// De algemene kans (computeSurfChance) gebruikt één maatlat voor iedereen. Hier bepaalt
// het profiel het venster: niveau (max. hoogte, tolerantie voor aanlandige wind),
// gewicht en board (drijfvermogen → vanaf welke hoogte het loont, welke hoogte ideaal is).
// Per uur rekenen we met elk board uit de quiver en nemen het beste: je kiest zelf
// het board dat bij de dag past.
//
// Hoogtes zijn de NzSurf-hoogte op de spot (spotWaveHeight), dezelfde schaal als de
// algemene kans, zodat de twee direct te vergelijken zijn.

import type { Board, ForecastData, SkillLevel, SurfSpot, UserProfile } from '../types';
import { assessTide, computeSurfChance, spotWaveHeight, swellExposure } from './spotKnowledge';

export interface SurfWindow {
  board: Board;
  floatClass: 'veel' | 'gemiddeld' | 'weinig';  // drijfvermogen t.o.v. gewicht
  litersPerKg: number;
  minH: number;        // hieronder werkt het niet (m op de spot)
  idealMin: number;    // vanaf hier ideaal
  idealMax: number;    // tot hier ideaal
  maxH: number;        // boven deze hoogte wordt het te veel voor dit niveau
  minPeriod: number;   // onder deze periode te weinig kracht voor dit board
  onshoreTolerance: number; // 0–1: hoeveel van de kans blijft over bij slechte wind
  why: string[];
}

const SKILL_MAX: Record<SkillLevel, number> = { beginner: 1.0, intermediate: 1.8, advanced: 2.6, pro: 3.5 };
const SKILL_ONSHORE: Record<SkillLevel, number> = { beginner: 0.6, intermediate: 0.45, advanced: 0.4, pro: 0.35 };
const SKILL_LABEL: Record<SkillLevel, string> = { beginner: 'beginner', intermediate: 'gemiddeld niveau', advanced: 'gevorderd', pro: 'pro' };
// De algemene kans rekent met deze tolerantie (0,35 + 0,65 × windkwaliteit).
const GENERIC_ONSHORE = 0.35;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Surfvenster voor één board, afgeleid uit niveau en gewicht. */
export function surfWindow(user: UserProfile, board: Board): SurfWindow {
  const skill: SkillLevel = user.skillLevel || 'intermediate';
  const weight = user.weight > 0 ? user.weight : 75;
  const vol = board.volume || 35;
  const lpk = vol / weight;
  const floaty = board.type === 'longboard' || board.type === 'softtop' || lpk >= 0.75;
  const mid = !floaty && (board.type === 'funboard' || board.type === 'hybrid' || board.type === 'fish' || lpk >= 0.5);
  const floatClass = floaty ? 'veel' : mid ? 'gemiddeld' : 'weinig';

  // Drijfvermogen bepaalt de onderkant en het ideale bereik.
  const base = floaty ? { minH: 0.25, idealMin: 0.4, idealMax: 1.0, minPeriod: 4 }
    : mid ? { minH: 0.35, idealMin: 0.55, idealMax: 1.4, minPeriod: 5 }
    : { minH: 0.5, idealMin: 0.8, idealMax: 1.8, minPeriod: 6 };
  // Niveau bepaalt de bovenkant.
  const maxH = Math.min(SKILL_MAX[skill], floaty ? Math.max(1.6, SKILL_MAX[skill] * 0.8) : SKILL_MAX[skill]);
  const idealMax = Math.min(base.idealMax, maxH * 0.8);
  const why = [
    `${board.name || board.type}: ${vol} L bij ${weight} kg = ${lpk.toFixed(2).replace('.', ',')} L/kg → ${floatClass} drijfvermogen`,
    `ideaal ${base.idealMin.toFixed(1).replace('.', ',')}–${idealMax.toFixed(1).replace('.', ',')} m, werkt vanaf ${base.minH.toFixed(2).replace('.', ',')} m, periode vanaf ${base.minPeriod} s`,
    `${SKILL_LABEL[skill]}: tot ~${maxH.toFixed(1).replace('.', ',')} m; aanlandige wind ${SKILL_ONSHORE[skill] >= 0.55 ? 'minder erg' : SKILL_ONSHORE[skill] >= 0.45 ? 'telt mee' : 'telt zwaar'}`,
  ];
  return { board, floatClass, litersPerKg: lpk, ...base, idealMax: Math.max(idealMax, base.idealMin + 0.1), maxH, onshoreTolerance: SKILL_ONSHORE[skill], why };
}

function sizeFit(h: number, w: SurfWindow): number {
  if (h < w.minH * 0.7) return 0.03;
  if (h < w.minH) return lerp(0.03, 0.3, (h - w.minH * 0.7) / (w.minH * 0.3));
  if (h < w.idealMin) return lerp(0.3, 1, (h - w.minH) / (w.idealMin - w.minH));
  if (h <= w.idealMax) return 1;
  if (h <= w.maxH) return lerp(1, 0.5, (h - w.idealMax) / (w.maxH - w.idealMax || 1));
  return Math.max(0.05, lerp(0.5, 0.05, (h - w.maxH) / 0.6)); // te groot voor dit niveau
}
function periodFit(p: number, w: SurfWindow): number {
  if (p >= w.minPeriod + 2) return 1;
  if (p >= w.minPeriod) return 0.9;
  if (p >= w.minPeriod - 1.5) return 0.75;
  return 0.6;
}

export interface PersonalHour {
  t: string;
  spotH: number; period: number; windKn: number; windType?: string;
  generic: number;           // algemene NzSurf-kans
  personal: number;          // beste board uit de quiver
  bestBoard?: string;
  limit?: string;            // wat het meest beperkt
}

/** Per uur: algemene kans en persoonlijke kans (beste board). */
export function personalHours(spot: SurfSpot, hours: ForecastData[], user: UserProfile): { windows: SurfWindow[]; hours: PersonalHour[] } {
  const boards = user.boards?.length ? user.boards : [{ id: 'x', name: 'board', type: 'shortboard', volume: 35, length: '' } as Board];
  const windows = boards.map(b => surfWindow(user, b));
  const out = hours.map(f => {
    const gen = computeSurfChance(spot, f);
    const exp = f.swellExposure ?? swellExposure(spot, f.swellDirection).exposure;
    const h = f.spotWaveHeight ?? spotWaveHeight(spot, f.waveHeight, exp);
    const tide = f.tideFactor ?? assessTide(spot, f.tideLevel, f.tideTrend, f.swellPeriod, f.swellDirection).factor;
    const windQ = typeof f.windQuality === 'number' ? f.windQuality : 50;
    let best = { c: -1, board: '', limit: '' };
    for (const w of windows) {
      const s = sizeFit(h, w), p = periodFit(f.swellPeriod, w);
      const wind = w.onshoreTolerance + (1 - w.onshoreTolerance) * windQ / 100;
      const c = Math.round(Math.min(100, Math.max(0, 100 * s * p * wind * tide)));
      if (c > best.c) {
        const parts: [string, number][] = [['hoogte', s], ['periode', p], ['wind', wind], ['getij', tide]];
        const worst = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
        const limit = worst[1] >= 0.9 ? '' : worst[0] === 'hoogte' ? (h < w.idealMin ? 'te klein' : 'te groot') : worst[0];
        best = { c, board: w.board.name || w.board.type, limit };
      }
    }
    return {
      t: f.timestamp, spotH: r2(h), period: f.swellPeriod, windKn: f.windSpeed, windType: f.windType,
      generic: gen.chance, personal: best.c, bestBoard: best.board, limit: best.limit || undefined,
    };
  });
  return { windows, hours: out };
}

export const GENERIC_WINDOW_TEXT = `Algemene kans: één maatlat voor iedereen — te klein onder 0,3 m, ideaal 0,5–2,0 m, minder boven 3 m; aanlandige wind houdt ${Math.round(GENERIC_ONSHORE * 100)}% over.`;
