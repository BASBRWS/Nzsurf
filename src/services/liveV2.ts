// NzSurf v2 live: de verwachting van NzSurf (v1) aangevuld met DWD, Météo-France en de
// windmodellen, gekalibreerd met wat de dagelijkse audit heeft geleerd (v2Calibration).
//
// Zelfde regels als de geteste v2 (utils/forecastV2.ts), laag 1:
//   golfhoogte   = DWD, Météo-France en NzSurf, elk gekalibreerd, gewogen naar 1/fout²;
//                  onder ±1 m de NzSurf-hoogte (0,8–1,2 m geleidelijk)
//   periode      = NzSurf
//   swellrichting= DWD, waar DWD ophoudt NzSurf
//   windsnelheid = per vooruitkijkklasse de bron met de kleinste fout na kalibratie
//   windrichting = Météo-France, KNMI, GFS en NzSurf, gewogen
// Daarna dezelfde strandvertaling en kans als v1 (spotKnowledge).
// Laag 2 (bijsturen met de laatste meting) zit nog niet live: die gaf in de audit 0,03 m.
//
// Veiligheid: geen kalibratie (of te oud), of de extra modellen niet bereikbaar → v1.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ForecastData, SurfSpot } from '../types';
import { fetchForecast, fetchWithRetry } from './weatherService';
import type { V2Calibration, V2Skill } from '../utils/forecastV2';
import { computeSurfChance, spotWaveHeight, swellExposure, withAreaDefaults } from '../utils/spotKnowledge';
import { windQualityFor } from '../utils/windQuality';

const MAX_AGE_MS = 4 * 86400e3;     // ouder dan 4 dagen: niet meer gebruiken
const MAX_DIST_KM = 60;            // kalibratie van een auditspot geldt tot zo ver
const WIND_MODELS: Record<string, string> = { gfs: 'gfs_seamless', knmi: 'knmi_seamless', dwd: 'icon_seamless', meteofrance: 'meteofrance_seamless', ecmwf: 'ecmwf_ifs025' };

let calCache: { t: number; cals: (V2Calibration & { lat: number; lng: number })[] } | null = null;
async function calibrations() {
  if (calCache && Date.now() - calCache.t < 30 * 60e3) return calCache.cals;
  const snap = await getDocs(collection(db, 'v2Calibration'));
  const cals = snap.docs.map(d => d.data() as V2Calibration & { lat: number; lng: number });
  // Alleen een gevulde uitkomst onthouden: een lege lijst kan vlak voor de eerste audit zijn.
  if (cals.length) calCache = { t: Date.now(), cals };
  return cals;
}

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, D = Math.PI / 180, dLat = (b.lat - a.lat) * D, dLng = (b.lng - a.lng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

function circMean(dirs: number[], w: number[]) {
  let sx = 0, sy = 0;
  dirs.forEach((d, i) => { sx += w[i] * Math.cos(d * Math.PI / 180); sy += w[i] * Math.sin(d * Math.PI / 180); });
  return ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360;
}

async function getJson(url: string) {
  const res = await fetchWithRetry(url, 2);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Waarde per ISO-tijdstip uit een Open-Meteo-reeks. */
function series(data: any, key: string): Map<string, number> {
  const out = new Map<string, number>();
  const t: string[] = data?.hourly?.time || [], v: (number | null)[] = data?.hourly?.[key] || [];
  t.forEach((ts, i) => { if (typeof v[i] === 'number') out.set(new Date(ts.endsWith('Z') ? ts : `${ts}Z`).toISOString(), v[i] as number); });
  return out;
}

export type Algo = 'v1' | 'v2';
export interface LiveResult { data: ForecastData[]; algo: Algo; note: string }

/** v1 + v2-kalibratie. Valt altijd terug op v1. */
export async function applyV2(inputSpot: SurfSpot, base: ForecastData[]): Promise<LiveResult> {
  const spot = withAreaDefaults(inputSpot);
  if (!base.length || spot.isAtlantic) return { data: base, algo: 'v1', note: 'v1 (buiten het gekalibreerde gebied)' };
  let cal: (V2Calibration & { lat: number; lng: number }) | undefined;
  let all: (V2Calibration & { lat: number; lng: number })[];
  try { all = await calibrations(); }
  catch (e) {
    const code = (e as { code?: string })?.code || '';
    return { data: base, algo: 'v1', note: `v1 (kalibratie niet leesbaar${code ? `: ${code}` : ''})` };
  }
  if (!all.length) return { data: base, algo: 'v1', note: 'v1 (nog geen v2-kalibratie in de database)' };
  const near = all.filter(c => typeof c.lat === 'number').map(c => ({ c, d: km(spot, c) })).filter(x => x.d <= MAX_DIST_KM).sort((a, b) => a.d - b.d);
  if (!near.length) return { data: base, algo: 'v1', note: `v1 (geen kalibratie binnen ${MAX_DIST_KM} km)` };
  cal = near.map(x => x.c).find(c => Date.now() - Date.parse(c.asOf) < MAX_AGE_MS);
  if (!cal) return { data: base, algo: 'v1', note: 'v1 (v2-kalibratie te oud)' };

  const { lat, lng } = spot;
  // GMT, zodat de tijden gelijk lopen met de ISO-tijdstempels van v1.
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=wave_height,wave_direction&models=ewam,meteofrance_wave&timezone=GMT&forecast_days=8`;
  const windModels = [...new Set(['meteofrance', 'knmi', 'gfs', ...cal.windPick].filter(s => WIND_MODELS[s]))];
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&models=${windModels.map(s => WIND_MODELS[s]).join(',')}&timezone=GMT&forecast_days=8`;
  let marine: any, weather: any;
  try { [marine, weather] = await Promise.all([getJson(marineUrl), getJson(weatherUrl)]); }
  catch { return { data: base, algo: 'v1', note: 'v1 (extra modellen niet bereikbaar)' }; }

  const hsDwd = series(marine, 'wave_height_ewam'), dirDwd = series(marine, 'wave_direction_ewam');
  const hsMf = series(marine, 'wave_height_meteofrance_wave');
  const windKn = Object.fromEntries(windModels.map(s => [s, series(weather, `wind_speed_10m_${WIND_MODELS[s]}`)]));
  const windDir = Object.fromEntries(windModels.map(s => [s, series(weather, `wind_direction_10m_${WIND_MODELS[s]}`)]));

  const now = Date.now();
  const bucketOf = (t: number) => { const lead = Math.max(0, (t - now) / 3600e3); const i = cal!.leadBuckets.findIndex(m => lead < m); return i < 0 ? cal!.leadBuckets.length - 1 : i; };
  const sk = (tab: Record<string, V2Skill[]>, s: string, b: number): V2Skill | undefined => tab[s]?.[b];

  const data = base.map(f => {
    const t = Date.parse(f.timestamp), iso = new Date(t).toISOString(), b = bucketOf(t);
    // Golfhoogte
    const members: { v: number; w: number }[] = [];
    const add = (s: string, raw: number | undefined) => {
      const k = sk(cal!.hs, s, b);
      if (typeof raw !== 'number' || !k) return;
      members.push({ v: Math.max(0, k.a + k.b * raw), w: 1 / Math.max(0.01, k.rmse ** 2) });
    };
    add('dwd', hsDwd.get(iso)); add('meteofrance', hsMf.get(iso)); add('nzsurf', f.waveHeight);
    let hs = members.length ? members.reduce((a, m) => a + m.v * m.w, 0) / members.reduce((a, m) => a + m.w, 0) : f.waveHeight;
    const w = clamp((f.waveHeight - 0.8) / 0.4, 0, 1);
    hs = r2((1 - w) * f.waveHeight + w * hs);

    // Swellrichting
    const swellDirection = dirDwd.get(iso) ?? f.swellDirection;

    // Windsnelheid: gekozen bron, gekalibreerd; NzSurf-wind is GFS
    const pick = cal!.windPick[b] || 'gfs';
    const rawW = pick === 'nzsurf' ? f.windSpeed : windKn[pick]?.get(iso) ?? (pick === 'gfs' ? f.windSpeed : undefined);
    const kw = sk(cal!.windKn, pick, b);
    const windSpeed = typeof rawW === 'number' && kw ? Math.max(0, Math.round(kw.a + kw.b * rawW)) : f.windSpeed;

    // Windrichting: gewogen gemiddelde van de bronnen (met hun vaste verschuiving)
    const dirs: number[] = [], ws: number[] = [];
    for (const s of ['meteofrance', 'knmi', 'gfs', 'nzsurf']) {
      const raw = s === 'nzsurf' ? f.windDirection : windDir[s]?.get(iso);
      const k = sk(cal!.windDir, s, b);
      if (typeof raw !== 'number' || !k) continue;
      dirs.push(((raw - k.a) % 360 + 360) % 360); ws.push(1 / Math.max(1, k.rmse ** 2));
    }
    const windDirection = dirs.length ? Math.round(circMean(dirs, ws)) : f.windDirection;

    // Strand en kans op de v2-zeewaarden
    const { windType, windQuality } = windQualityFor(spot.coastlineAngle, windDirection, windSpeed);
    const exp = swellExposure(spot, swellDirection);
    const item: ForecastData = {
      ...f, waveHeight: hs, swellDirection, windSpeed, windDirection, windType, windQuality,
      swellExposure: exp.exposure, swellNote: exp.note, spotWaveHeight: spotWaveHeight(spot, hs, exp.exposure),
    };
    item.surfChance = computeSurfChance(spot, item).chance;
    return item;
  });
  const age = Math.round((now - Date.parse(cal.asOf)) / 3600e3);
  return { data, algo: 'v2', note: `v2 · kalibratie ${cal.spotId === spot.id ? 'van deze spot' : `van ${cal.spotId}`}, ${age} u oud` };
}

/** De verwachting zoals de app hem toont: v2 waar mogelijk, anders v1. */
export async function fetchSpotForecast(spot: SurfSpot): Promise<ForecastData[]> {
  const base = await fetchForecast(spot);
  try { return (await applyV2(spot, base)).data; } catch { return base; }
}
export async function fetchSpotForecastWithAlgo(spot: SurfSpot): Promise<LiveResult> {
  const base = await fetchForecast(spot);
  try { return await applyV2(spot, base); } catch { return { data: base, algo: 'v1', note: 'v1 (v2 mislukte)' }; }
}
