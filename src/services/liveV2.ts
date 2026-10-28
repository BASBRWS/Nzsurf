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
import { fetchForecast } from './weatherService';
import { withAreaDefaults } from '../utils/spotKnowledge';
import { applyV2WithCal, pickCalibration, type Cal, type LiveResult } from './v2Core';

export type { Algo, LiveResult } from './v2Core';

let calCache: { t: number; cals: Cal[] } | null = null;
async function calibrations() {
  if (calCache && Date.now() - calCache.t < 30 * 60e3) return calCache.cals;
  const snap = await getDocs(collection(db, 'v2Calibration'));
  const cals = snap.docs.map(d => d.data() as Cal);
  // Alleen een gevulde uitkomst onthouden: een lege lijst kan vlak voor de eerste audit zijn.
  if (cals.length) calCache = { t: Date.now(), cals };
  return cals;
}

/** v1 + v2-kalibratie. Valt altijd terug op v1. */
export async function applyV2(inputSpot: SurfSpot, base: ForecastData[]): Promise<LiveResult> {
  const spot = withAreaDefaults(inputSpot);
  if (!base.length || spot.isAtlantic) return { data: base, algo: 'v1', note: 'v1 (buiten het gekalibreerde gebied)' };
  let all: Cal[];
  try { all = await calibrations(); }
  catch (e) {
    const code = (e as { code?: string })?.code || '';
    return { data: base, algo: 'v1', note: `v1 (kalibratie niet leesbaar${code ? `: ${code}` : ''})` };
  }
  const { cal, note } = pickCalibration(spot, all);
  if (!cal) return { data: base, algo: 'v1', note: note! };
  return applyV2WithCal(spot, base, cal);
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
