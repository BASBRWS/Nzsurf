import React from 'react';
import { ForecastData } from '../types';
import { format, parseISO, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { Wind, Waves, Navigation, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun, CloudFog } from 'lucide-react';

interface ForecastGridProps {
  forecast: ForecastData[];
  onCellClick: (data: ForecastData) => void;
}

const getWeatherIcon = (code?: number) => {
  if (code === undefined) return <Sun className="w-4 h-4 sm:w-5 sm:h-5 opacity-40" />;

  switch (code) {
    case 0:
      return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />;
    case 1:
    case 2:
      return <CloudSun className="w-4 h-4 sm:w-5 sm:h-5 text-sand-200" />;
    case 3:
      return <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-sand-300" />;
    case 45:
    case 48:
      return <CloudFog className="w-4 h-4 sm:w-5 sm:h-5 text-sand-400" />;
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
      return <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-marine-400" />;
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return <CloudSnow className="w-4 h-4 sm:w-5 sm:h-5 text-blue-100" />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />;
    default:
      return <Sun className="w-4 h-4 sm:w-5 sm:h-5 opacity-40" />;
  }
};

export function ForecastGrid({ forecast, onCellClick }: ForecastGridProps) {
  // Group by day
  const days = Array.from(new Set(forecast.map(f => format(parseISO(f.timestamp), 'yyyy-MM-dd'))));

  const getSuitabilityClasses = (height: number, period: number) => {
    if (height < 0.3) return 'text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5'; // Flat
    if (height > 1.8) return 'text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10 font-bold'; // Big
    if (height >= 0.6 && period >= 5) return 'text-emerald-800 dark:text-accent border-emerald-300 dark:border-accent/20 bg-emerald-50 dark:bg-accent/5 hover:bg-emerald-100 dark:hover:bg-accent/10 font-bold'; // Good
    return 'text-sky-800 dark:text-marine-300 border-sky-200 dark:border-marine-500/20 bg-sky-50 dark:bg-marine-500/5 hover:bg-sky-100 dark:hover:bg-marine-500/10'; // Average
  };

  const calculateScores = (data: ForecastData) => {
    // 1. Confidence (Reliability of data)
    let confidence = 95;
    const forecastDate = parseISO(data.timestamp);
    const now = new Date();
    const daysOut = Math.floor((forecastDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
    
    confidence -= (daysOut * 8); // Data consistency drops over time
    if (data.windSpeed > 30) confidence -= 10; // Stormy weather is harder to predict
    
    // 2. Probability (Surf Chance - Likelihood of "Good" session)
    let probability = 0;
    
    // Height weight
    if (data.waveHeight >= 0.5 && data.waveHeight <= 2.5) probability += 40;
    else if (data.waveHeight > 2.5) probability += 20;

    // Period weight
    if (data.swellPeriod >= 9) probability += 30;
    else if (data.swellPeriod >= 6) probability += 15;

    // Wind weight
    if (data.windType?.includes('offshore')) probability += 30;
    else if (data.windType?.includes('side-offshore')) probability += 20;
    else if (data.windType?.includes('onshore')) probability -= 10;

    const finalConfidence = Math.min(98, Math.max(30, confidence));
    const finalProb = Math.min(100, Math.max(0, probability));

    return { confidence: finalConfidence, probability: finalProb };
  };

  const hoursToShow = [9, 12, 15, 18, 21];

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="w-full text-left border-collapse min-w-[380px] sm:min-w-[700px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 sm:py-6 px-1.5 sm:px-4 font-mono text-[9px] sm:text-[11px] uppercase tracking-widest opacity-70 w-[45px] sm:w-[80px] sticky left-0 forecast-sticky-col z-20 border-r border-white/10">Tijd</th>
            {hoursToShow.map((hour) => (
              <th key={hour} className="py-2 sm:py-6 px-1 sm:px-2 font-mono text-[9px] sm:text-[11px] uppercase tracking-widest opacity-60 text-center">
                {hour}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day} className="border-b border-white/10 last:border-0 group">
              <td className="py-2 sm:py-6 px-1.5 sm:px-4 align-middle sticky left-0 forecast-sticky-col z-10 border-r border-white/10 shadow-[2px_0_8px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col leading-none">
                  <span className="capitalize text-[10px] sm:text-xs font-black group-hover:text-accent transition-colors">
                    {format(parseISO(day), 'EEEE', { locale: nl }).slice(0, 2)}
                  </span>
                  <span className="text-[7px] sm:text-[9px] font-mono font-bold opacity-60 uppercase tracking-tighter mt-0.5">
                    {format(parseISO(day), 'd/MM')}
                  </span>
                </div>
              </td>
              {hoursToShow.map((hour) => {
                const data = forecast.find(f => {
                  const d = parseISO(f.timestamp);
                  return isSameDay(d, parseISO(day)) && d.getHours() === hour;
                });

                if (!data) return <td key={hour} className="p-1 opacity-20 text-center text-[8px] font-mono">---</td>;

                const { confidence, probability } = calculateScores(data);

                return (
                  <td 
                    key={hour} 
                    className="p-0.5 sm:p-2 group/cell"
                    onClick={() => onCellClick(data)}
                  >
                    <div className={cn(
                      "flex flex-col gap-0.5 sm:gap-2 p-1 sm:p-4 rounded-md sm:rounded-2xl border transition-all cursor-pointer h-full justify-center group-hover/cell:scale-105 group-hover/cell:shadow-2xl group-hover/cell:z-10 relative overflow-hidden",
                      getSuitabilityClasses(data.waveHeight, data.swellPeriod)
                    )}>
                      {/* Probability Badge */}
                      {probability > 0 && (
                        <div className="absolute top-0.5 right-0.5 sm:top-2 sm:right-2">
                          <span className="text-[5px] sm:text-[8px] font-mono font-bold bg-black/20 px-1 rounded-sm text-current">
                            {probability}%
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col items-center leading-none">
                        <span className="text-[10px] sm:text-2xl font-black tracking-tighter">
                          {data.waveHeight}<span className="text-[5px] sm:text-[10px] ml-0.5 font-mono opacity-50 uppercase font-normal">m</span>
                        </span>
                        <div className="flex items-center gap-0.5 mt-0.5 opacity-60">
                          <Waves className="w-1.5 h-1.5 sm:w-3 sm:h-3" />
                          <span className="text-[5px] sm:text-[10px] font-mono">{data.swellPeriod}s</span>
                        </div>
                      </div>

                      <div className="flex-col items-center gap-0.5 py-0.5 border-t border-current/5 sm:border-current/10 hidden sm:flex">
                        <div className="flex items-center gap-1.5 text-[6px] sm:text-[9px] font-mono opacity-60">
                          <span>{data.airTemp}°</span>
                          {data.uvIndex !== undefined && data.uvIndex >= 1 && (
                            <span className="text-amber-400/90 font-medium">☀️ UV {data.uvIndex}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-center gap-0.5 sm:gap-2 pt-0.5 sm:pt-2 border-t border-current/5 sm:border-current/10">
                        <div className="flex items-center gap-0.5 text-[5px] sm:text-[9px] font-mono uppercase bg-black/10 px-0.5 sm:px-1.5 py-0.2 sm:py-0.5 rounded-sm sm:rounded-md">
                          <Wind className="w-1.5 h-1.5 sm:w-3 sm:h-3 opacity-60" />
                          <span>{Math.round(data.windSpeed)}</span>
                        </div>
                        <div 
                          className="flex items-center justify-center w-2.5 h-2.5 sm:w-5 sm:h-5 rounded-full bg-black/10 sm:bg-black/20 text-current transition-transform duration-700 shrink-0"
                          style={{ transform: `rotate(${data.windDirection}deg)` }}
                        >
                          <Navigation className="w-1.5 h-1.5 sm:w-3 sm:h-3 fill-current" />
                        </div>
                      </div>

                      {/* Confidence Bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-[1.5px] sm:h-[3px] bg-black/10">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            confidence > 80 ? "bg-emerald-500" : confidence > 60 ? "bg-accent" : "bg-orange-500"
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
    </div>
  );
}
