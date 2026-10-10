import React from 'react';
import { ForecastData, SurfSpot } from '../types';
import { computeSurfChance } from '../utils/spotKnowledge';
import { format, parseISO, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { Wind, Waves, Navigation, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun, CloudFog } from 'lucide-react';

interface ForecastGridProps {
  forecast: ForecastData[];
  onCellClick: (data: ForecastData) => void;
  spot?: SurfSpot; // nodig om de kans te berekenen als die niet in de data zit
}

// Kleur = kans dat de spot werkt (hoogte op de spot, swellrichting, periode, wind
// én getijvenster) — dezelfde "kans" als in het detailvenster en de AI.
const CHANCE_LEVELS = [
  { min: 70, label: 'Goed', cls: 'text-emerald-900 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 font-bold shadow-xs', dot: 'bg-emerald-400' },
  { min: 45, label: 'Redelijk', cls: 'text-sky-900 border-sky-200 bg-sky-50 hover:bg-sky-100', dot: 'bg-sky-400' },
  { min: 20, label: 'Matig', cls: 'text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100', dot: 'bg-amber-400' },
  { min: 0, label: 'Werkt niet / flat', cls: 'text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100', dot: 'bg-slate-300' },
];

const getWeatherIcon = (code?: number) => {
  if (code === undefined) return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />;

  switch (code) {
    case 0:
      return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />;
    case 1:
    case 2:
      return <CloudSun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />;
    case 3:
      return <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
    case 45:
    case 48:
      return <CloudFog className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />;
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" />;
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return <CloudSnow className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />;
    default:
      return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />;
  }
};

export function ForecastGrid({ forecast, onCellClick, spot }: ForecastGridProps) {
  // Group by day
  const days = Array.from(new Set(forecast.map(f => format(parseISO(f.timestamp), 'yyyy-MM-dd'))));

  const getChanceLevel = (chance: number) => CHANCE_LEVELS.find(l => chance >= l.min) || CHANCE_LEVELS[CHANCE_LEVELS.length - 1];

  const calculateScores = (data: ForecastData) => {
    // 1. Confidence (Reliability of data)
    let confidence = 95;
    const forecastDate = parseISO(data.timestamp);
    const now = new Date();
    const daysOut = Math.floor((forecastDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
    
    confidence -= (daysOut * 8); // Data consistency drops over time
    if (data.windSpeed > 30) confidence -= 10; // Stormy weather is harder to predict
    
    // 2. Kans dat de spot werkt: uit de verwachting (weatherService), anders hier berekend.
    const probability = data.surfChance ?? (spot ? computeSurfChance(spot, data).chance : 0);

    const finalConfidence = Math.min(98, Math.max(30, confidence));
    const finalProb = Math.min(100, Math.max(0, Math.round(probability)));

    return { confidence: finalConfidence, probability: finalProb };
  };

  const hoursToShow = [9, 12, 15, 18, 21];

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 bg-white/95 rounded-3xl border border-slate-200 p-3 sm:p-5 shadow-[0_8px_30px_rgba(0,40,90,0.06)]">
      <table className="w-full text-left border-collapse min-w-[380px] sm:min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-3 sm:py-4 px-2 sm:px-4 font-mono text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-bold w-[50px] sm:w-[90px] sticky left-0 bg-white/95 z-20 border-r border-slate-200">
              Dag
            </th>
            {hoursToShow.map((hour) => (
              <th key={hour} className="py-3 sm:py-4 px-1 sm:px-2 font-mono text-[10px] sm:text-xs uppercase tracking-widest text-slate-600 font-bold text-center">
                {hour}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((day) => (
            <tr key={day} className="group hover:bg-slate-50/50 transition-colors">
              <td className="py-3 sm:py-4 px-2 sm:px-4 align-middle sticky left-0 bg-white/95 z-10 border-r border-slate-200">
                <div className="flex flex-col leading-none">
                  <span className="capitalize text-xs sm:text-sm font-black font-tactical text-slate-900 group-hover:text-cyan-700 transition-colors">
                    {format(parseISO(day), 'EEEE', { locale: nl }).slice(0, 2)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                    {format(parseISO(day), 'd/MM')}
                  </span>
                </div>
              </td>
              {hoursToShow.map((hour) => {
                const data = forecast.find(f => {
                  const d = parseISO(f.timestamp);
                  return isSameDay(d, parseISO(day)) && d.getHours() === hour;
                });

                if (!data) return <td key={hour} className="p-1 opacity-30 text-center text-[10px] font-mono text-slate-400">---</td>;

                const { confidence, probability } = calculateScores(data);

                return (
                  <td 
                    key={hour} 
                    className="p-1 sm:p-2 group/cell"
                    onClick={() => onCellClick(data)}
                  >
                    <div className={cn(
                      "flex flex-col gap-1 sm:gap-2 p-1.5 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all cursor-pointer h-full justify-center group-hover/cell:scale-105 group-hover/cell:shadow-md group-hover/cell:z-10 relative overflow-hidden",
                      getChanceLevel(probability).cls
                    )}>
                      {/* Probability Badge */}
                      {(data.surfChance !== undefined || spot) && (
                        <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
                          <span className="text-[7px] sm:text-[9px] font-mono font-bold bg-white/80 px-1 rounded border border-current/20 text-current">
                            {probability}%
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col items-center leading-none">
                        <span className="text-xs sm:text-2xl font-black font-tactical tracking-tight text-slate-900">
                          {data.waveHeight.toFixed(1)}<span className="text-[7px] sm:text-[10px] ml-0.5 font-mono text-slate-500 uppercase font-normal">m</span>
                        </span>
                        <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                          <Waves className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          <span className="text-[8px] sm:text-[10px] font-mono font-bold">{data.swellPeriod}s</span>
                        </div>
                      </div>

                      <div className="flex-col items-center gap-0.5 py-0.5 border-t border-slate-200/60 hidden sm:flex">
                        <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] font-mono text-slate-600">
                          <span>{data.airTemp}°C</span>
                          {data.uvIndex !== undefined && data.uvIndex >= 1 && (
                            <span className="text-amber-700 font-bold">☀️ UV {data.uvIndex}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-center gap-1 sm:gap-2 pt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-mono font-bold uppercase bg-white/80 px-1 sm:px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                          <Wind className="w-2 h-2 sm:w-3 sm:h-3 text-slate-500" />
                          <span>{Math.round(data.windSpeed)}</span>
                        </div>
                        <div 
                          className="flex items-center justify-center w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-slate-100 text-slate-700 transition-transform duration-700 shrink-0"
                          style={{ transform: `rotate(${data.windDirection}deg)` }}
                        >
                          <Navigation className="w-2 h-2 sm:w-3 sm:h-3 fill-current text-cyan-600" />
                        </div>
                      </div>

                      {/* Confidence Bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] sm:h-[3px] bg-slate-200/80">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            confidence > 80 ? "bg-emerald-500" : confidence > 60 ? "bg-cyan-500" : "bg-orange-500"
                          )}
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legenda: kleur en % = kans dat de spot werkt (niet alleen golfhoogte) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 mt-1 border-t border-slate-100 text-[9px] sm:text-[10px] font-mono text-slate-500">
        <span className="font-bold uppercase tracking-wider">Kans dat de spot werkt:</span>
        {CHANCE_LEVELS.map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={cn('inline-block w-2 h-2 rounded-full', l.dot)} />
            {l.label}{l.min > 0 ? ` (≥${l.min}%)` : ''}
          </span>
        ))}
        <span className="text-slate-400">• golfhoogte, swellrichting, periode, wind en getij</span>
      </div>
    </div>
  );
}

