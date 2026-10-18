// Webcam Maasvlakte tegen NzSurf: hoe goed klopt de verwachte golf aan het strand,
// en welk deel van de afwijking mag je doortrekken naar spots in de buurt?
//
// Opsplitsing (met de boei Maasgeul 2, vlak voor de Maasvlakte):
//   webcam / NzSurf-spot  = (boei / model op zee) × (webcam / boei) / (NzSurf-spot / model)
//                         =      zee-factor      ×        strand-factor
// - zee-factor: hoe ver het golfmodel op zee ernaast zit. Spots binnen ~20 km krijgen
//   dezelfde swell, dus deze factor mag naar de buurspots.
// - strand-factor: hoe ver NzSurf's vertaling zee → strand ernaast zit op déze spot.
//   Die is spotgebonden (ligging, zandbanken, pieren) en mag NIET naar andere spots.
// Zonder boeiwaarde is alleen de totale factor bekend: dan is doortrekken een indicatie.

import type { WebcamMeasurement, SpotForecastSnap } from '../services/webcamMeasure';
import type { ObsPoint } from './forecastAudit';

export interface WebcamRow {
  m: WebcamMeasurement;
  beach?: number;            // webcam: golf aan het strand (m)
  nzSpot?: number;           // NzSurf: verwacht op de spot (m)
  buoy?: ObsPoint; buoyMaasgeul?: boolean;
  total?: number;            // webcam ÷ NzSurf-spot
  sea?: number;              // boei ÷ model op zee
  beachFactor?: number;      // (webcam ÷ boei) ÷ (NzSurf-spot ÷ model)
  beachOverBuoy?: number;    // webcam ÷ boei
}

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function webcamRow(m: WebcamMeasurement, buoy?: { p: ObsPoint; maasgeul: boolean } | null): WebcamRow {
  const usable = m.result.framesUsable > 0 && ok(m.result.waveFaceM);
  const beach = usable ? m.result.waveFaceM : undefined;
  const nzSpot = m.forecast?.spotHs;
  const model = m.forecast?.modelHs;
  const b = buoy?.p.hs;
  const row: WebcamRow = { m, beach, nzSpot, buoy: buoy?.p, buoyMaasgeul: buoy?.maasgeul };
  if (ok(beach) && ok(nzSpot) && nzSpot > 0.05) row.total = beach / nzSpot;
  if (ok(b) && ok(model) && model > 0.05) row.sea = b / model;
  if (ok(beach) && ok(b) && b > 0.05) row.beachOverBuoy = beach / b;
  if (ok(row.beachOverBuoy) && ok(nzSpot) && ok(model) && model > 0.05 && nzSpot > 0.02) row.beachFactor = row.beachOverBuoy / (nzSpot / model);
  return row;
}

export const median = (xs: number[]) => {
  const s = xs.filter(ok).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export interface WebcamSummary {
  n: number;                 // metingen met webcam én NzSurf-spot
  mae?: number; bias?: number; // NzSurf-spot − webcam (m)
  total?: number; sea?: number; beachFactor?: number; beachOverBuoy?: number;
  nSea: number;
}

export function summarizeWebcam(rows: WebcamRow[]): WebcamSummary {
  const both = rows.filter(r => ok(r.beach) && ok(r.nzSpot));
  const errs = both.map(r => r.nzSpot! - r.beach!);
  const withSea = rows.filter(r => ok(r.sea));
  return {
    n: both.length,
    mae: errs.length ? errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length : undefined,
    bias: errs.length ? errs.reduce((a, e) => a + e, 0) / errs.length : undefined,
    total: median(rows.map(r => r.total!)),
    sea: median(withSea.map(r => r.sea!)),
    beachFactor: median(rows.map(r => r.beachFactor!)),
    beachOverBuoy: median(rows.map(r => r.beachOverBuoy!)),
    nSea: withSea.length,
  };
}

export interface NearbyEstimate {
  snap: SpotForecastSnap;
  nz?: number;               // NzSurf-verwachting op de spot
  corrected?: number;        // na correctie
  basis: 'zee' | 'totaal' | 'geen';
}

/**
 * Doortrekken naar spots in de buurt. Met een zee-factor (uit boei-metingen)
 * alleen die; anders de totale factor, gemarkeerd als indicatie.
 */
export function nearbyEstimates(nearby: SpotForecastSnap[] = [], seaFactor?: number, totalFactor?: number): NearbyEstimate[] {
  return nearby.map(snap => {
    const nz = snap.spotHs;
    if (!ok(nz)) return { snap, basis: 'geen' as const };
    if (ok(seaFactor)) return { snap, nz, corrected: Math.round(nz * seaFactor * 100) / 100, basis: 'zee' as const };
    if (ok(totalFactor)) return { snap, nz, corrected: Math.round(nz * totalFactor * 100) / 100, basis: 'totaal' as const };
    return { snap, nz, basis: 'geen' as const };
  }).sort((a, b) => a.snap.distKm - b.snap.distKm);
}
