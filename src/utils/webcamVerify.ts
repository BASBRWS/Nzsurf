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
import type { AuditForecastDoc, AuditObsDoc, ObsPoint } from './forecastAudit';
import { powerKw } from './forecastAudit';

export interface WebcamRow {
  m: WebcamMeasurement;
  beach?: number;            // webcam: golf aan het strand (m)
  nzSpot?: number;           // NzSurf: verwacht op de spot (m)
  buoy?: ObsPoint; buoyMaasgeul?: boolean;
  total?: number;            // webcam ÷ NzSurf-spot
  sea?: number;              // boei ÷ model op zee
  beachFactor?: number;      // (webcam ÷ boei) ÷ (NzSurf-spot ÷ model)
  beachOverBuoy?: number;    // webcam ÷ boei
  nzPower?: number;          // golfkracht volgens NzSurf (model op zee, kW/m)
  buoyPower?: number;        // golfkracht uit de boei (Hm0, Tm02; kW/m)
}

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function webcamRow(m: WebcamMeasurement, buoy?: { p: ObsPoint; maasgeul: boolean } | null): WebcamRow {
  const usable = m.result.framesUsable > 0 && ok(m.result.waveFaceM);
  const beach = usable ? m.result.waveFaceM : undefined;
  const nzSpot = m.forecast?.spotHs;
  const model = m.forecast?.modelHs;
  const b = buoy?.p.hs;
  const row: WebcamRow = { m, beach, nzSpot, buoy: buoy?.p, buoyMaasgeul: buoy?.maasgeul,
    nzPower: powerKw(model, m.forecast?.period), buoyPower: powerKw(buoy?.p.hs, buoy?.p.tm02) };
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
  // Oudere metingen kunnen dezelfde plek twee keer bevatten (eigen spot + catalogus).
  const seen: SpotForecastSnap[] = [];
  for (const s of nearby) if (!seen.some(x => Math.abs(x.distKm - s.distKm) < 0.3 && x.name.replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === s.name.replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase())) seen.push(s);
  return seen.map(snap => {
    const nz = snap.spotHs;
    if (!ok(nz)) return { snap, basis: 'geen' as const };
    if (ok(seaFactor)) return { snap, nz, corrected: Math.round(nz * seaFactor * 100) / 100, basis: 'zee' as const };
    if (ok(totalFactor)) return { snap, nz, corrected: Math.round(nz * totalFactor * 100) / 100, basis: 'totaal' as const };
    return { snap, nz, basis: 'geen' as const };
  }).sort((a, b) => a.snap.distKm - b.snap.distKm);
}

/** Dichtstbijzijnde boeimeting (binnen 45 min) en of die van Maasgeul 2 komt. */
export function buoyAt(t: string, observations: AuditObsDoc[]): { p: ObsPoint; maasgeul: boolean } | null {
  const ms = Date.parse(t);
  let best: { p: ObsPoint; maasgeul: boolean; d: number } | null = null;
  for (const doc of observations) {
    const maasgeul = (doc.stations || []).some(s => /^Hm0@maasgeul/i.test(s));
    for (const p of doc.points) {
      if (typeof p.hs !== 'number') continue;
      const d = Math.abs(Date.parse(p.t) - ms);
      if (d <= 45 * 60e3 && (!best || d < best.d)) best = { p, maasgeul, d };
    }
  }
  return best ? { p: best.p, maasgeul: best.maasgeul } : null;
}

// ── Surfline en surfnerd op de Maasvlakte (strandhoogte) ────────────────────

/** Strandhoogte volgens een site op tijdstip `at`: laatste run vóór `at`, dichtstbijzijnde uur (≤ 90 min). */
export function siteHeightAt(docs: AuditForecastDoc[], source: string, at: number): number | undefined {
  const run = docs.filter(d => d.source === source && Date.parse(d.runAt) <= at)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0];
  if (!run) return undefined;
  let best: AuditForecastDoc['points'][number] | undefined, bd = Infinity;
  for (const p of run.points || []) { const d = Math.abs(Date.parse(p.t) - at); if (d < bd) { bd = d; best = p; } }
  if (!best || bd > 90 * 60e3) return undefined;
  // Surfline: brekerhoogte (min–max) → midden; anders de golfhoogte die de site toont.
  if (typeof best.surfMin === 'number' && typeof best.surfMax === 'number') return Math.round((best.surfMin + best.surfMax) / 2 * 100) / 100;
  return typeof best.hs === 'number' ? best.hs : undefined;
}

/** Verwachte hoogte op de spot (spotHs) volgens een bron op tijdstip `at`: laatste run vóór `at`, dichtstbijzijnde uur (≤ 90 min). */
export function spotHeightAt(docs: AuditForecastDoc[], source: string, at: number): number | undefined {
  const run = docs.filter(d => d.source === source && Date.parse(d.runAt) <= at)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0];
  if (!run) return undefined;
  let best: AuditForecastDoc['points'][number] | undefined, bd = Infinity;
  for (const p of run.points || []) { const d = Math.abs(Date.parse(p.t) - at); if (d < bd) { bd = d; best = p; } }
  return best && bd <= 90 * 60e3 && typeof best.spotHs === 'number' ? best.spotHs : undefined;
}

/** Gemiddelde afwijking van een reeks voorspellingen t.o.v. de webcam (alleen waar beide er zijn). */
export function maeVsWebcam(pairs: { fc?: number; cam?: number }[]): { n: number; mae?: number; bias?: number } {
  const ok = pairs.filter(p => typeof p.fc === 'number' && typeof p.cam === 'number') as { fc: number; cam: number }[];
  if (!ok.length) return { n: 0 };
  return { n: ok.length, mae: ok.reduce((a, p) => a + Math.abs(p.fc - p.cam), 0) / ok.length, bias: ok.reduce((a, p) => a + p.fc - p.cam, 0) / ok.length };
}
