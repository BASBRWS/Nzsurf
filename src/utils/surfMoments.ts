import { parseISO, format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ForecastData, SurfSpot } from '../types';
import { computeSurfChance, degreesToCompass16, tideLevelLabel } from './spotKnowledge';

/**
 * Hulpfuncties voor de beginpagina: "kan ik nu surfen?" en "wanneer wel?".
 * Puur (geen I/O). Altijd met de ruwe cijfers erbij, zodat de gebruiker zelf kan
 * oordelen; de kans is een hulpmiddel, geen eindoordeel.
 */

// Zelfde niveaus als de weektabel (ForecastGrid).
export const CHANCE_LEVELS = [
  { min: 70, key: 'good', label: 'Goed', cls: 'text-emerald-900 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 font-bold shadow-xs', dot: 'bg-emerald-400', solid: 'bg-emerald-500', text: 'text-emerald-700' },
  { min: 45, key: 'fair', label: 'Redelijk', cls: 'text-sky-900 border-sky-200 bg-sky-50 hover:bg-sky-100', dot: 'bg-sky-400', solid: 'bg-sky-500', text: 'text-sky-700' },
  { min: 20, key: 'meh', label: 'Matig', cls: 'text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100', dot: 'bg-amber-400', solid: 'bg-amber-500', text: 'text-amber-700' },
  { min: 0, key: 'no', label: 'Werkt niet', cls: 'text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100', dot: 'bg-slate-300', solid: 'bg-slate-400', text: 'text-slate-600' },
] as const;

export type ChanceLevel = typeof CHANCE_LEVELS[number];

export function chanceLevel(chance: number): ChanceLevel {
  return CHANCE_LEVELS.find(l => chance >= l.min) || CHANCE_LEVELS[CHANCE_LEVELS.length - 1];
}

export function chanceOf(spot: SurfSpot, f: ForecastData): number {
  return f.surfChance ?? computeSurfChance(spot, f).chance;
}

export function knotsToBft(knots: number): number {
  const t = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
  const i = t.findIndex(v => knots <= v);
  return i === -1 ? 12 : i;
}

const WIND_TYPE_NL: Record<string, string> = {
  'offshore': 'aflandig',
  'side-offshore': 'zij-aflandig',
  'cross-shore': 'zijwind',
  'side-onshore': 'zij-aanlandig',
  'onshore': 'aanlandig',
};
export const windTypeNl = (t?: string) => (t ? WIND_TYPE_NL[t] || t : '');

/** Korte regel met de ruwe cijfers: "1,4 m · 6 s · WNW 6 Bft (24 kn) aanlandig · hoogwater, afgaand" */
export function rawLine(f: ForecastData): string {
  const h = (f.spotWaveHeight ?? f.waveHeight).toFixed(1).replace('.', ',');
  const parts = [
    `${h} m`,
    `${Math.round(f.swellPeriod)} s`,
    `${degreesToCompass16(f.windDirection)} ${knotsToBft(f.windSpeed)} Bft (${Math.round(f.windSpeed)} kn) ${windTypeNl(f.windType)}`.trim(),
  ];
  if (f.tideLevel !== undefined) parts.push(tideLevelLabel(f.tideLevel, f.tideTrend));
  return parts.join(' · ');
}

/** Het verwachtingsblok dat het dichtst bij "nu" ligt (de reeks begint om 00:00). */
export function pickNow(forecast: ForecastData[], now: Date = new Date()): ForecastData | null {
  if (!forecast.length) return null;
  let best = forecast[0];
  let bestDiff = Infinity;
  for (const f of forecast) {
    const diff = Math.abs(parseISO(f.timestamp).getTime() - now.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = f; }
  }
  return best;
}

/** Eén zin waarom het (niet) werkt, in gewone taal. */
export function reasonSentence(spot: SurfSpot, f: ForecastData): string {
  const c = computeSurfChance(spot, f);
  const h = c.spotWave.toFixed(1).replace('.', ',');
  if (c.reasons.includes('ongunstige swellrichting')) return `De swell komt uit het ${degreesToCompass16(f.swellDirection)}; daarvan komt op ${spot.name} weinig aan (~${h} m).`;
  if (c.spotWave < 0.3) return `Te klein: ongeveer ${h} m op de spot.`;
  const bits: string[] = [];
  if (c.reasons.includes('ongunstige wind')) bits.push(`${Math.round(f.windSpeed)} kn ${windTypeNl(f.windType)} wind maakt het rommelig`);
  // Alleen de eerste letter klein: plaatsnamen in de notitie houden hun hoofdletter.
  if (c.reasons.includes('ongunstig getij')) bits.push(f.tideNote ? f.tideNote.replace(/\.$/, '').replace(/^./, ch => ch.toLowerCase()) : 'het getij werkt niet mee');
  if (c.reasons.includes('korte periode')) bits.push(`korte periode (${Math.round(f.swellPeriod)} s), weinig kracht`);
  if (bits.length) return `${h} m golf, maar ${bits.join(' en ')}.`;
  return c.chance >= 70
    ? `${h} m met ${windTypeNl(f.windType) || 'rustige'} wind: alles valt samen.`
    : `${h} m, ${Math.round(f.swellPeriod)} s en ${windTypeNl(f.windType) || 'matige'} wind: berijdbaar.`;
}

export interface SurfWindow {
  start: Date;
  end: Date;
  peak: ForecastData;
  peakChance: number;
  items: ForecastData[];
}

const STEP_MS = 3 * 3600 * 1000; // de verwachting is per 3 uur

/**
 * Aaneengesloten daglichtblokken vanaf nu met kans >= minChance.
 * Gesorteerd op hoogste piekkans (beste eerst).
 */
export function findWindows(spot: SurfSpot, forecast: ForecastData[], now: Date = new Date(), minChance = 45): SurfWindow[] {
  const items = forecast
    .filter(f => {
      const h = parseISO(f.timestamp).getHours();
      return f.isDaylight && h >= 6 && h < 21 && parseISO(f.timestamp).getTime() + STEP_MS > now.getTime();
    })
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());
  const windows: SurfWindow[] = [];
  let cur: ForecastData[] = [];
  const flush = () => {
    if (!cur.length) return;
    const chances = cur.map(f => chanceOf(spot, f));
    const peakIdx = chances.indexOf(Math.max(...chances));
    const start = parseISO(cur[0].timestamp);
    const lastStart = parseISO(cur[cur.length - 1].timestamp);
    // Eind: blok + 3 uur, maar niet over de dag heen (max 21:00).
    const dayEnd = new Date(lastStart); dayEnd.setHours(21, 0, 0, 0);
    const end = new Date(Math.min(lastStart.getTime() + STEP_MS, dayEnd.getTime()));
    windows.push({ start, end, peak: cur[peakIdx], peakChance: chances[peakIdx], items: cur });
    cur = [];
  };
  for (const f of items) {
    const ok = chanceOf(spot, f) >= minChance;
    const prev = cur[cur.length - 1];
    const contiguous = prev && isSameDay(parseISO(prev.timestamp), parseISO(f.timestamp))
      && parseISO(f.timestamp).getTime() - parseISO(prev.timestamp).getTime() <= STEP_MS;
    if (ok && (cur.length === 0 || contiguous)) cur.push(f);
    else { flush(); if (ok) cur.push(f); }
  }
  flush();
  return windows.sort((a, b) => b.peakChance - a.peakChance);
}

/** Eerstvolgende goede (>=70%) of anders redelijke (>=45%) moment na nu. */
export function nextGoodWindow(spot: SurfSpot, forecast: ForecastData[], now: Date = new Date()): SurfWindow | null {
  for (const min of [70, 45]) {
    const w = findWindows(spot, forecast, now, min)
      .filter(x => x.start.getTime() > now.getTime() + 30 * 60 * 1000)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    if (w) return w;
  }
  return null;
}

/** "vandaag 15:00–18:00", "morgen 09:00–12:00" of "di 14 okt 09:00–12:00". */
export function windowLabel(w: { start: Date; end: Date }, now: Date = new Date()): string {
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const day = isSameDay(w.start, now) ? 'vandaag' : isSameDay(w.start, tomorrow) ? 'morgen' : format(w.start, 'EEEE d MMM', { locale: nl });
  return `${day} ${format(w.start, 'HH:mm')}–${format(w.end, 'HH:mm')}`;
}
