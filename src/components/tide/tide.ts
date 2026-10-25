// Getijdeninstrument: gedeelde kleuren en tekenhulpjes voor de lijnen.
import { parseISO } from 'date-fns';
import type { ForecastData } from '../../types';

export const TIDE = {
  paper: '#efe9dd', sand: '#f7f3eb', ink: '#12292b', sea: '#2d6466',
  foam: '#cfded8', mist: '#8aa3a0', sun: '#d97a24',
};
/** Vanaf deze kans licht het moment op. */
export const GOOD = 65;
export const OK = 45;

export const chanceColor = (c: number) => (c >= GOOD ? TIDE.sun : c >= OK ? TIDE.ink : TIDE.mist);

/** Vloeiende lijn door punten (Catmull-Rom → Bézier), zonder overschot onder de basislijn. */
export function smoothPath(pts: [number, number][], minY?: number, maxY?: number): string {
  if (!pts.length) return '';
  const clampY = (y: number) => (maxY !== undefined ? Math.min(maxY, minY !== undefined ? Math.max(minY, y) : y) : y);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 1 / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, clampY(p1[1] + (p2[1] - p0[1]) * t)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, clampY(p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Uren (lokaal, decimaal) van een verwachtingsblok. */
export const hourOf = (f: ForecastData) => { const d = parseISO(f.timestamp); return d.getHours() + d.getMinutes() / 60; };

/** Tijdvakken (in uren) waar de kans ≥ drempel is, met lineaire snijpunten. */
export function windowsAbove(xs: number[], cs: number[], thr = GOOD): [number, number][] {
  const out: [number, number][] = [];
  let from: number | null = null;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[i + 1];
    if (a >= thr && from === null) from = xs[i];
    if (from !== null && (b === undefined || b < thr)) {
      const end = b === undefined ? xs[i] : xs[i] + (xs[i + 1] - xs[i]) * (a - thr) / (a - b);
      out.push([from, end]); from = null;
    } else if (a < thr && b !== undefined && b >= thr) {
      from = xs[i] + (xs[i + 1] - xs[i]) * (thr - a) / (b - a);
    }
  }
  return out;
}

import { useEffect, useRef, useState } from 'react';
/** Breedte van een element (voor SVG's die de schermbreedte volgen). */
export function useWidth<T extends HTMLElement>(fallback = 340) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** De lijn van één dag: alleen daglicht, met aan beide kanten een zachte aanloop naar 0. */
export function dayProfile(items: ForecastData[], chance: (f: ForecastData) => number) {
  const day = items.filter(f => f.isDaylight !== false && hourOf(f) >= 6 && hourOf(f) <= 21)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!day.length) return { hours: [] as number[], chances: [] as number[], tide: [] as (number | undefined)[] };
  const hours = day.map(hourOf), chances = day.map(chance), tide = day.map(f => f.tideLevel);
  const first = hours[0], last = hours[hours.length - 1];
  if (first > 6) { hours.unshift(Math.max(6, first - 1.5)); chances.unshift(0); tide.unshift(undefined); }
  if (last < 21) { hours.push(Math.min(21, last + 1.5)); chances.push(0); tide.push(undefined); }
  return { hours, chances, tide };
}
