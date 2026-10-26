import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { ForecastData, SurfSpot } from '../../types';
import { cn } from '../../lib/utils';
import { fetchSpotForecast } from '../../services/liveV2';
import { chanceOf, chanceLevel, pickNow, rawLine } from '../../utils/surfMoments';
import { withAreaDefaults } from '../../utils/spotKnowledge';

interface OtherSpotsNowProps {
  spot: SurfSpot;
  spots: SurfSpot[];
  currentChance: number | null;
  onSelectSpot: (spotId: string) => void;
}

// Verwachtingen van andere spots 30 minuten bewaren (scheelt aanvragen bij heen-en-weer klikken).
const cache = new Map<string, { t: number; data: ForecastData[] }>();
const TTL = 30 * 60 * 1000;

const distanceKm = (a: SurfSpot, b: SurfSpot) => {
  const R = 6371, D = Math.PI / 180;
  const dLat = (b.lat - a.lat) * D, dLng = (b.lng - a.lng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** "Nu elders": spots in de buurt met hun kans en ruwe cijfers op dit moment. */
export function OtherSpotsNow({ spot, spots, currentChance, onSelectSpot }: OtherSpotsNowProps) {
  const candidates = spots
    .map(withAreaDefaults)
    .filter(s => s.id !== spot.id && !!s.isAtlantic === !!withAreaDefaults(spot).isAtlantic
      && typeof s.lat === 'number' && typeof s.lng === 'number' && distanceKm(spot, s) <= 150)
    .sort((a, b) => distanceKm(spot, a) - distanceKm(spot, b))
    .slice(0, 5);

  const [rows, setRows] = useState<{ spot: SurfSpot; now: ForecastData; chance: number }[] | null>(null);
  const key = candidates.map(c => c.id).join(',');

  useEffect(() => {
    if (!candidates.length) { setRows([]); return; }
    let cancelled = false;
    setRows(null);
    // Pas na de eerste weergave ophalen, zodat dit de hoofdverwachting niet vertraagt.
    const timer = setTimeout(async () => {
      const results = await Promise.allSettled(candidates.map(async s => {
        const hit = cache.get(s.id);
        const data = hit && Date.now() - hit.t < TTL ? hit.data : await fetchSpotForecast(s);
        cache.set(s.id, { t: Date.now(), data });
        const now = pickNow(data);
        if (!now) throw new Error('geen data');
        return { spot: s, now, chance: chanceOf(s, now) };
      }));
      if (cancelled) return;
      setRows(results
        .filter((r): r is PromiseFulfilledResult<{ spot: SurfSpot; now: ForecastData; chance: number }> => r.status === 'fulfilled')
        .map(r => r.value)
        .sort((a, b) => b.chance - a.chance));
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id, key]);

  if (!candidates.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Nu elders</h3>
        <p className="text-[11px] font-mono text-slate-500">Spots binnen 150 km, nu. Tik om over te schakelen.</p>
      </div>
      {rows === null ? (
        <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Verwachtingen ophalen…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">Geen gegevens beschikbaar voor andere spots.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => {
            const lvl = chanceLevel(r.chance);
            const better = currentChance !== null && r.chance >= currentChance + 15;
            return (
              <li key={r.spot.id}>
                <button
                  onClick={() => onSelectSpot(r.spot.id)}
                  className="w-full text-left rounded-xl border border-slate-200 hover:border-cyan-400 p-3 flex items-center gap-3 cursor-pointer transition-colors"
                >
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', lvl.solid)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">{r.spot.name}</span>
                      {better && <span className="text-[9px] font-mono font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 rounded">beter</span>}
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 truncate">{rawLine(r.now)}</div>
                  </div>
                  <span className={cn('text-xs font-mono font-black shrink-0', lvl.text)}>{r.chance}%</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
