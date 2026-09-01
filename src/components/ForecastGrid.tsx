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

export function ForecastGrid({ forecast, onCellClick }: ForecastGridProps) {
  // Group by day
  const days = Array.from(new Set(forecast.map(f => format(parseISO(f.timestamp), 'yyyy-MM-dd'))));

  const getSuitabilityClasses = (height: number, period: number) => {
    if (height < 0.3) return 'text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100'; // Flat
    if (height > 1.8) return 'text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100 font-bold shadow-xs'; // Big
    if (height >= 0.6 && period >= 5) return 'text-emerald-900 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 font-bold shadow-xs'; // Good
    return 'text-sky-900 border-sky-200 bg-sky-50 hover:bg-sky-100'; // Average
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
                      getSuitabilityClasses(data.waveHeight, data.swellPeriod)
                    )}>
                      {/* Probability Badge */}
                      {probability > 0 && (
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
    </div>
  );
}

