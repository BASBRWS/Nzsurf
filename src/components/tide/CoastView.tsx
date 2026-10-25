import React, { useEffect, useMemo, useState } from 'react';
import type { ForecastData, SurfSpot, UserProfile } from '../../types';
import { SPOT_CATALOG, toSurfSpot } from '../../data/spotCatalog';
import { fetchForecast } from '../../services/weatherService';
import { withAreaDefaults } from '../../utils/spotKnowledge';
import { chanceOf } from '../../utils/surfMoments';
import { personalHours } from '../../utils/surfProfile';
import { planDays } from '../home/AnswerCard';
import { OK, TIDE, chanceColor, smoothPath, useWidth } from './tide';

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
        const data = hit && Date.now() - hit.t < TTL ? hit.data : await fetchForecast(s);
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
  const H = Math.max(420, rows.length * 66 + 40);
  const coastW = Math.min(150, width * 0.38);

  // Schematische projectie: noorden boven, de spots over de volle hoogte; oost-west
  // apart geschaald zodat de vorm van de kust leesbaar blijft (niet op schaal).
  const geo = useMemo(() => {
    if (!rows.length) return null;
    const lats = rows.map(r => r.spot.lat), lngs = rows.map(r => r.spot.lng);
    const maxLat = Math.max(...lats), latSpan = Math.max(0.02, maxLat - Math.min(...lats));
    const minLng = Math.min(...lngs), lngSpan = Math.max(0.02, Math.max(...lngs) - minLng);
    const padY = 34, padX = 26;
    return {
      x: (lng: number) => padX + ((lng - minLng) / lngSpan) * (coastW - 2 * padX),
      y: (lat: number) => padY + ((maxLat - lat) / latSpan) * (H - 2 * padY),
    };
  }, [rows, coastW, H]);

  const sorted = [...rows].sort((a, b) => b.spot.lat - a.spot.lat);
  const pts = geo ? sorted.map(r => [geo.x(r.spot.lng), geo.y(r.spot.lat)] as [number, number]) : [];
  // Kustlijn: door de spots, iets verlengd boven en onder.
  const coast = pts.length >= 2 ? [[pts[0][0] + 4, Math.max(4, pts[0][1] - 26)] as [number, number], ...pts, [pts[pts.length - 1][0] - 4, Math.min(H - 4, pts[pts.length - 1][1] + 26)] as [number, number]] : pts;
  const coastX = (yy: number) => {
    for (let i = 0; i < coast.length - 1; i++) { const [a, b] = [coast[i], coast[i + 1]]; if (yy >= a[1] && yy <= b[1]) return a[0] + (b[0] - a[0]) * ((yy - a[1]) / Math.max(1, b[1] - a[1])); }
    return coast[0]?.[0] ?? 0;
  };
  // Labels rechts, minimaal 54 px uit elkaar.
  const labelY: number[] = [];
  pts.forEach(([, py], i) => { labelY[i] = Math.max(py, i ? labelY[i - 1] + 54 : 18); });
  const overflow = (labelY[labelY.length - 1] ?? 0) - (H - 20);
  if (overflow > 0) for (let i = labelY.length - 1; i >= 0; i--) { labelY[i] -= overflow; if (i && labelY[i] - labelY[i - 1] >= 54) break; }

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
            {Array.from({ length: Math.floor(H / 9) }, (_, i) => 6 + i * 9).map(yy => (
              <line key={yy} x1={0} x2={Math.max(0, coastX(yy) - 12)} y1={yy} y2={yy} stroke={TIDE.foam} strokeWidth={1} />
            ))}
            <text x={2} y={16} fontFamily="DM Mono" fontSize={10} letterSpacing={2} fill={TIDE.sea}>NOORDZEE</text>
            {coast.length >= 2 && <path d={smoothPath(coast)} fill="none" stroke={TIDE.ink} strokeWidth={1.4} />}
            {sorted.map((r, i) => {
              const [px, py] = pts[i], ly = labelY[i], b = r.best;
              const good = typeof b === 'number' && b >= 65, ok = typeof b === 'number' && b >= OK;
              const lx = coastW + 22;
              return (
                <g key={r.spot.id} onClick={() => onSelectSpot(r.spot.id)} style={{ cursor: 'pointer' }} role="button" aria-label={`${r.spot.name}: ${typeof b === 'number' ? `${b}%` : r.status === 'fout' ? 'geen gegevens' : 'laden'}`}>
                  <rect x={0} y={ly - 26} width={width} height={52} fill="transparent" />
                  {good && <circle cx={px} cy={py} r={15} fill={TIDE.sun} opacity={0.18} />}
                  <circle cx={px} cy={py} r={good ? 7 : 5} fill={good ? TIDE.sun : ok ? TIDE.sand : TIDE.foam} stroke={good ? TIDE.sun : TIDE.ink} strokeWidth={good ? 0 : 1.2} />
                  <polyline points={`${px + 12},${py} ${lx - 18},${ly} ${lx - 8},${ly}`} fill="none" stroke={TIDE.ink} strokeWidth={0.7} opacity={0.35} strokeDasharray="1 4" />
                  <text x={lx} y={ly - 2} fontFamily="Instrument Sans" fontSize={16} fontWeight={r.spot.id === spot.id || good ? 700 : 400} fill={TIDE.ink}>
                    {r.spot.name.length > 20 ? r.spot.name.slice(0, 19) + '…' : r.spot.name}
                  </text>
                  <text x={lx} y={ly + 16} fontFamily="DM Mono" fontSize={10} letterSpacing={1.2} fill={TIDE.mist}>
                    {r.spot.id === spot.id ? 'JOUW SPOT' : `${Math.round(r.dist)} KM`}{r.from && r.to && ok ? ` · ${r.from.toTimeString().slice(0, 2)}–${r.to.toTimeString().slice(0, 2)} U` : ''}
                  </text>
                  <text x={width - 2} y={ly + 9} textAnchor="end" fontFamily="Instrument Serif" fontSize={28} fill={typeof b === 'number' ? chanceColor(b) : TIDE.mist}>
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
