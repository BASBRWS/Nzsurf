import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine
} from 'recharts';
import { format, parseISO, isSameDay } from 'date-fns';
import { ForecastData } from '../types';

interface DetailedChartsProps {
  forecast: ForecastData[];
  selectedTimestamp: string;
}

export function DetailedCharts({ forecast, selectedTimestamp }: DetailedChartsProps) {
  const selectedDate = parseISO(selectedTimestamp);
  const dayData = forecast
    .filter(f => isSameDay(parseISO(f.timestamp), selectedDate))
    .map(f => ({
      time: format(parseISO(f.timestamp), 'HH:mm'),
      timestamp: f.timestamp,
      height: f.waveHeight,
      period: f.swellPeriod,
      windSpeed: f.windSpeed,
      windGust: Math.round(f.windSpeed * 1.3),
      tide: f.tideHeight || 0,
      rain: f.precipitation || 0
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (dayData.length === 0) return null;

  const selectedTimeStr = format(selectedDate, 'HH:mm');

  return (
    <div className="space-y-8 mt-6">
      {/* GOLVEN GRAFIEK */}
      <div className="glass p-6 rounded-3xl border border-white/10 shadow-sm">
        <h4 className="text-xs font-bold text-marine-400 uppercase tracking-widest mb-6 flex items-center justify-between">
          <span>Golven Verloop</span>
          <span className="text-[10px] font-medium opacity-70">Hoogte (m)</span>
        </h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dayData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWave" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} interval={2} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 'dataMax + 0.5']} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  fontSize: '12px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.3)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="height" 
                stroke="#3b82f6" 
                fillOpacity={1} 
                fill="url(#colorWave)" 
                strokeWidth={3}
                name="Hoogte"
              />
              <ReferenceLine x={selectedTimeStr} stroke="#f97316" strokeDasharray="4 4" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* WIND GRAFIEK */}
      <div className="glass p-6 rounded-3xl border border-white/10 shadow-sm">
        <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center justify-between">
          <span>Wind Snelheid</span>
          <span className="text-[10px] font-medium opacity-70">Knopen (kn)</span>
        </h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dayData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWind" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} interval={2} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 'dataMax + 5']} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  fontSize: '12px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  backgroundColor: '#0f172a',
                  color: '#fff'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="windSpeed" 
                stroke="#f97316" 
                fillOpacity={1} 
                fill="url(#colorWind)" 
                strokeWidth={3}
                name="Snelheid"
              />
              <ReferenceLine x={selectedTimeStr} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NEERSLAG GRAFIEK */}
      <div className="glass p-6 rounded-3xl border border-white/10 shadow-sm">
        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-6 flex items-center justify-between">
          <span>Neerslag</span>
          <span className="text-[10px] font-medium opacity-70">Millimeter (mm)</span>
        </h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dayData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} interval={2} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 'dataMax + 1']} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  fontSize: '12px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  backgroundColor: '#0f172a',
                  color: '#fff'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="rain" 
                stroke="#8b5cf6" 
                fillOpacity={1} 
                fill="url(#colorRain)" 
                strokeWidth={3}
                name="Neerslag"
              />
              <ReferenceLine x={selectedTimeStr} stroke="#f97316" strokeDasharray="4 4" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GETIJ GRAFIEK */}
      <div className="glass p-6 rounded-3xl border border-white/10 shadow-sm">
        <h4 className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-6 flex items-center justify-between">
          <span>Waterstand</span>
          <span className="text-[10px] font-medium opacity-70">Hoogte (m)</span>
        </h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dayData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTide" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} interval={2} axisLine={false} tickLine={false} />
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  fontSize: '12px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  backgroundColor: '#0f172a',
                  color: '#fff'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="tide" 
                stroke="#38bdf8" 
                fillOpacity={1} 
                fill="url(#colorTide)" 
                strokeWidth={3}
                name="Waterstand"
              />
              <ReferenceLine x={selectedTimeStr} stroke="#f97316" strokeDasharray="4 4" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
