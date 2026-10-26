import React, { useEffect, useMemo, useState } from 'react';
import type { ForecastData, SurfSpot, UserProfile } from '../../types';
import { SPOT_CATALOG, toSurfSpot } from '../../data/spotCatalog';
import { fetchSpotForecast } from '../../services/liveV2';
import { withAreaDefaults } from '../../utils/spotKnowledge';
import { chanceOf } from '../../utils/surfMoments';
import { personalHours } from '../../utils/surfProfile';
import { planDays } from '../home/AnswerCard';
import { OK, TIDE, chanceColor, useWidth } from './tide';

/**
 * De kust als één lijn van noord naar zuid, met de spots op hun echte plek.
 * Per spot het beste moment van vandaag; waar het werkt, licht een punt op.
 */
interface Props {
  spot: SurfSpot;
  forecast: ForecastData[];       // van de gekozen spot (al geladen)
  spots: SurfSpot[];              // eigen spots
  user: UserProfile;
  isLoggedIn: boolean;
  onSelectSpot: (id: string) => void;
  onOpenMap: () => void;
}

const RADIUS_KM = 45, MAX_SPOTS = 8;

// Vereenvoudigde kustlijn Zuid-Holland en Zeeland (lat, lng), noord → zuid:
// Scheveningen, Hoek van Holland, de Maasmond met de Maasvlakte, Voorne, de
// Haringvlietdam, Goeree, de Brouwersdam, Schouwen en Walcheren. Benadering; voor herkenning.
const COASTLINE: [number, number][] = [
  [52.16, 4.33], [52.13, 4.29], [52.105, 4.262], [52.085, 4.238], [52.065, 4.212], [52.035, 4.168], [52.005, 4.133], [51.986, 4.112],
  [51.983, 4.098], [51.992, 4.055], [51.987, 4.052], [51.983, 4.025], [51.985, 3.993], [51.972, 3.968], [51.955, 3.964], [51.94, 3.970],
  [51.929, 3.979], [51.915, 3.996], [51.905, 4.022], [51.899, 4.048], [51.886, 4.060], [51.873, 4.056], [51.858, 4.046], [51.846, 4.041],
  [51.832, 4.030], [51.836, 4.000], [51.843, 3.958], [51.836, 3.925], [51.826, 3.887], [51.810, 3.861], [51.790, 3.853], [51.768, 3.858],
  [51.748, 3.842], [51.733, 3.822], [51.734, 3.770], [51.722, 3.712], [51.693, 3.690], [51.655, 3.688], [51.625, 3.676], [51.592, 3.600],
  [51.566, 3.497], [51.532, 3.446], [51.500, 3.478],
];
const cache = new Map<string, { t: number; data: ForecastData[] }>();
const TTL = 30 * 60e3;
const km = (a: SurfSpot, b: SurfSpot) => {
  const R = 6371, D = Math.PI / 180, dLat = (b.lat - a.lat) * D, dLng = (b.lng - a.lng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

interface Row { spot: SurfSpot; dist: number; best?: number; from?: Date; to?: Date; status: 'laden' | 'ok' | 'fout' }

export const CoastView: React.FC<Props> = ({ spot, forecast, spots, user, isLoggedIn, onSelectSpot, onOpenMap }) => {
  const personal = isLoggedIn && (user.boards?.length ?? 0) > 0;
  const candidates = useMemo(() => {
    const all = new Map<string, SurfSpot>();
    [...SPOT_CATALOG.map(toSurfSpot), ...spots].forEach(s => { if (typeof s?.lat === 'number' && typeof s.lng === 'number') all.set(s.id, withAreaDefaults(s)); });
    const me = withAreaDefaults(spot);
    const near = [...all.values()].filter(s => s.id !== spot.id && !!s.isAtlantic === !!me.isAtlantic && km(spot, s) <= RADIUS_KM)
      .sort((a, b) => km(spot, a) - km(spot, b));
    const kept: SurfSpot[] = [me];
    for (const s of near) { if (kept.length >= MAX_SPOTS) break; if (!kept.some(k => km(k, s) < 1.5)) kept.push(s); }
    return kept;
  }, [spot, spots]);

  const score = (s: SurfSpot, data: ForecastData[]) => {
    const ph = personal ? new Map(personalHours(s, data, user).hours.map(h => [h.t, h.personal])) : null;
    const ch = (f: ForecastData) => ph?.get(f.timestamp) ?? chanceOf(s, f);
    const today = planDays(data, ch, () => undefined, f => chanceOf(s, f), new Date(), 1)[0];
    return today?.peak ? { best: today.peakChance, from: today.start, to: today.end } : {};
  };

  const [rows, setRows] = useState<Row[]>([]);
  const key = candidates.map(c => c.id).join(',');
  useEffect(() => {
    let cancelled = false;
    setRows(candidates.map(s => ({ spot: s, dist: km(spot, s), status: s.id === spot.id && forecast.length ? 'ok' : 'laden', ...(s.id === spot.id && forecast.length ? score(s, forecast) : {}) })));
    candidates.filter(s => s.id !== spot.id).forEach(async s => {
      try {
        const hit = cache.get(s.id);
        const data = hit && Date.now() - hit.t < TTL ? hit.data : await fetchSpotForecast(s);
        cache.set(s.id, { t: Date.now(), data });
        if (!cancelled) setRows(rs => rs.map(r => (r.spot.id === s.id ? { ...r, status: 'ok', ...score(s, data) } : r)));
      } catch {
        if (!cancelled) setRows(rs => rs.map(r => (r.spot.id === s.id ? { ...r, status: 'fout' } : r)));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, forecast, personal]);

  const [ref, width] = useWidth<HTMLDivElement>();
  const H = Math.max(380, rows.length * 58 + 30);
  const mapW = Math.round(width * 0.42);

  // Echte kaart, vereenvoudigd: noorden boven, juiste verhoudingen. Sea links, land rechts.
  const geo = useMemo(() => {
    if (!rows.length) return null;
    const lats = rows.map(r => r.spot.lat), lngs = rows.map(r => r.spot.lng);
    const minLat = Math.min(...lats) - 0.03, maxLat = Math.max(...lats) + 0.03;
    const minLng = Math.min(...lngs) - 0.06, maxLng = Math.max(...lngs) + 0.05;
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    // Breedte bepaalt de schaal; noord-zuid mag tot 2,2× gerekt worden zodat de namen ernaast passen.
    const scX = mapW / ((maxLng - minLng) * kx);
    const scY = Math.min(scX * 2.2, Math.max(scX, (H - 8) / (maxLat - minLat)));
    const offY = Math.max(0, (H - (maxLat - minLat) * scY) / 2);
    return {
      x: (lng: number) => (lng - minLng) * kx * scX,
      y: (lat: number) => offY + (maxLat - lat) * scY,
      minLat, maxLat,
    };
  }, [rows, mapW, H]);

  const sorted = [...rows].sort((a, b) => b.spot.lat - a.spot.lat);
  const pts = geo ? sorted.map(r => [geo.x(r.spot.lng), geo.y(r.spot.lat)] as [number, number]) : [];
  const coastRaw = geo ? COASTLINE.map(([la, ln]) => [geo.x(ln), geo.y(la)] as [number, number]) : [];
  // Recht doortrekken naar boven en onder buiten beeld, zodat het land overal rechts van de kust ligt.
  const coastPts = coastRaw.length ? [[coastRaw[0][0], -1000] as [number, number], ...coastRaw, [coastRaw[coastRaw.length - 1][0], H + 1000] as [number, number]] : [];
  const toD = (ps: [number, number][]) => ps.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const coastD = coastPts.length ? toD(coastPts) : '';
  const coastLineD = coastRaw.length ? toD(coastRaw) : '';
  // Land = rechts van de kustlijn (tot ver buiten beeld).
  const landD = coastPts.length ? `${coastD} L${width + 400},${H + 1000} L${width + 400},-1000 Z` : '';
  // Labels rechts, minimaal 52 px uit elkaar.
  const labelY: number[] = [];
  pts.forEach(([, py], i) => { labelY[i] = Math.max(py, i ? labelY[i - 1] + 52 : 18); });
  const overflow = (labelY[labelY.length - 1] ?? 0) - (H - 20);
  if (overflow > 0) for (let i = labelY.length - 1; i >= 0; i--) { labelY[i] -= overflow; if (i && labelY[i] - labelY[i - 1] >= 52) break; }
  const lx = mapW + 18;
  const maxChars = Math.max(10, Math.floor((width - lx - 50) / 7.6));

  // Kleinere spots die dicht op elkaar liggen: labels krijgen ruimte, de punten blijven op hun plek.
  const best = rows.filter(r => typeof r.best === 'number').sort((a, b) => b.best! - a.best!)[0];

  return (
    <div className="px-1 pt-2 text-[color:var(--tide-ink)]">
      <div className="flex items-center justify-between gap-3">
        <span className="tide-mono text-[11px] text-[color:var(--tide-sea)]">vandaag · beste moment {personal ? '· voor jou' : ''}</span>
        <button onClick={onOpenMap} className="min-h-[44px] text-[15px] underline underline-offset-4 cursor-pointer">Kaart</button>
      </div>
      <h2 className="mt-4 text-[54px] leading-none">Langs de kust</h2>
      <span className="tide-mono block mt-3 text-[11px] text-[color:var(--tide-sea)]">binnen {RADIUS_KM} km van {spot.name}</span>
      {best && typeof best.best === 'number' && best.best >= OK && (
        <p className="mt-2 text-[16px] text-[color:var(--tide-sea)]">Vandaag het best: <b className="text-[color:var(--tide-ink)]">{best.spot.name}</b>{best.from && best.to ? `, ${best.from.toTimeString().slice(0, 5)}–${best.to.toTimeString().slice(0, 5)}` : ''}.</p>
      )}

      <div ref={ref} className="mt-6">
        {geo && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Spots langs de kust met hun kans vandaag">
            <defs><clipPath id="coastclip"><rect x={0} y={0} width={width} height={H} /></clipPath></defs>
            <g clipPath="url(#coastclip)">
              {Array.from({ length: Math.floor(H / 8) }, (_, i) => 4 + i * 8).map(yy => (
                <line key={yy} x1={0} x2={mapW + 40} y1={yy} y2={yy} stroke={TIDE.foam} strokeWidth={1} />
              ))}
              <path d={landD} fill={TIDE.paper} />
              <path d={coastLineD} fill="none" stroke={TIDE.ink} strokeWidth={1.3} strokeLinejoin="round" />
            </g>
            <text x={2} y={14} fontFamily="DM Mono" fontSize={10} letterSpacing={2} fill={TIDE.sea}>NOORDZEE</text>
            {sorted.map((r, i) => {
              const [px, py] = pts[i], ly = labelY[i], b = r.best;
              const good = typeof b === 'number' && b >= OK, ok = good;
              return (
                <g key={r.spot.id} onClick={() => onSelectSpot(r.spot.id)} style={{ cursor: 'pointer' }} role="button" aria-label={`${r.spot.name}: ${typeof b === 'number' ? `${b}%` : r.status === 'fout' ? 'geen gegevens' : 'laden'}`}>
                  <rect x={0} y={ly - 26} width={width} height={52} fill="transparent" />
                  {good && <circle cx={px} cy={py} r={15} fill={TIDE.sun} opacity={0.18} />}
                  <circle cx={px} cy={py} r={good ? 7 : 5} fill={good ? TIDE.sun : ok ? TIDE.sand : TIDE.foam} stroke={good ? TIDE.sun : TIDE.ink} strokeWidth={good ? 0 : 1.2} />
                  <polyline points={`${px + 9},${py} ${lx - 14},${ly} ${lx - 6},${ly}`} fill="none" stroke={TIDE.ink} strokeWidth={0.7} opacity={0.35} strokeDasharray="1 4" />
                  <text x={lx} y={ly - 2} fontFamily="Instrument Sans" fontSize={15} fontWeight={r.spot.id === spot.id || good ? 700 : 400} fill={TIDE.ink}>
                    {r.spot.name.length > maxChars ? r.spot.name.slice(0, maxChars - 1) + '…' : r.spot.name}
                  </text>
                  <text x={lx} y={ly + 16} fontFamily="DM Mono" fontSize={10} letterSpacing={1.2} fill={TIDE.mist}>
                    {r.spot.id === spot.id ? 'JOUW SPOT' : `${Math.round(r.dist)} KM`}{r.from && r.to && ok ? ` · ${r.from.toTimeString().slice(0, 2)}–${r.to.toTimeString().slice(0, 2)} U` : ''}
                  </text>
                  <text x={width - 2} y={ly + 9} textAnchor="end" fontFamily="Instrument Sans" fontWeight={500} letterSpacing={-0.8} fontSize={22} fill={typeof b === 'number' ? chanceColor(b) : TIDE.mist}>
                    {typeof b === 'number' ? `${b}%` : r.status === 'fout' ? '–' : '…'}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <p className="mt-4 border-t border-[color:var(--tide-line)] pt-3 text-[15px] text-[color:var(--tide-sea)]">Tik een spot om die te bekijken. De kaart staat onder "Kaart".</p>
    </div>
  );
};
