import React from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { ArrowUp } from 'lucide-react';
import { ForecastData, SurfSpot } from '../../types';
import { cn } from '../../lib/utils';
import { chanceOf, chanceLevel, knotsToBft } from '../../utils/surfMoments';
import { degreesToCompass16 } from '../../utils/spotKnowledge';

interface TodayStripProps {
  spot: SurfSpot;
  forecast: ForecastData[];
  nowItem: ForecastData | null;
  onSelectHour: (f: ForecastData) => void;
}

const tidePhase = (level?: number) =>
  level === undefined ? '' : level < 0.2 ? 'laag' : level > 0.8 ? 'hoog' : 'mid';

/**
 * Vandaag per (3-)uur: kanskleur plus de ruwe cijfers (hoogte, periode, wind, getij),
 * zodat je zelf ziet wanneer en waarom het beter wordt.
 */
export function TodayStrip({ spot, forecast, nowItem, onSelectHour }: TodayStripProps) {
  const now = new Date();
  const daylight = (f: ForecastData) => { const h = parseISO(f.timestamp).getHours(); return h >= 6 && h <= 21; };
  let items = forecast.filter(f => daylight(f) && isSameDay(parseISO(f.timestamp), now)
    && parseISO(f.timestamp).getTime() + 3 * 3600e3 > now.getTime());
  let title = 'Vandaag per uur';
  if (items.length < 3) {
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    items = forecast.filter(f => daylight(f) && isSameDay(parseISO(f.timestamp), tomorrow));
    title = 'Morgen per uur';
  }
  if (!items.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">{title}</h3>
        <span className="text-[10px] font-mono text-slate-500">tik voor details</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {items.map(f => {
          const chance = chanceOf(spot, f);
          const lvl = chanceLevel(chance);
          const isNow = nowItem?.timestamp === f.timestamp;
          const h = (f.spotWaveHeight ?? f.waveHeight).toFixed(1).replace('.', ',');
          return (
            <button
              key={f.timestamp}
              onClick={() => onSelectHour(f)}
              className={cn(
                'shrink-0 w-[84px] rounded-2xl border bg-white text-left overflow-hidden transition-all hover:shadow-md cursor-pointer',
                isNow ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-slate-200'
              )}
            >
              <div className={cn('h-1.5', lvl.solid)} />
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-black text-slate-900">{isNow ? 'Nu' : format(parseISO(f.timestamp), 'HH:mm')}</span>
                  <span className={cn('text-[10px] font-mono font-bold', lvl.text)}>{chance}%</span>
                </div>
                <div className="text-lg font-black text-slate-900 leading-none">{h}<span className="text-[10px] font-mono text-slate-500 ml-0.5">m</span></div>
                <div className="text-[10px] font-mono text-slate-600">{Math.round(f.swellPeriod)} s</div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-700">
                  <ArrowUp className="w-3 h-3 text-cyan-700 shrink-0" style={{ transform: `rotate(${f.windDirection + 180}deg)` }} />
                  <span>{degreesToCompass16(f.windDirection)} {knotsToBft(f.windSpeed)}</span>
                </div>
                {f.tideLevel !== undefined && (
                  <div className="text-[10px] font-mono text-blue-700">
                    {f.tideTrend === 'rising' ? '↑' : f.tideTrend === 'falling' ? '↓' : '•'} {tidePhase(f.tideLevel)}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
