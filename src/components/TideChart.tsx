import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, parseISO, isSameDay } from 'date-fns';
import { ForecastData } from '../types';

interface TideChartProps {
  forecast: ForecastData[];
  selectedTimestamp: string;
}

export function TideChart({ forecast, selectedTimestamp }: TideChartProps) {
  // Filter data to only show the selected day (00:00 to 23:59)
  const selectedDate = parseISO(selectedTimestamp);
  const data = forecast
    .filter(f => isSameDay(parseISO(f.timestamp), selectedDate))
    .map(f => ({
      time: format(parseISO(f.timestamp), 'HH:mm'),
      timestamp: f.timestamp,
      height: f.tideHeight || 0
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (data.length === 0) return null;

  const selectedTimeStr = format(selectedDate, 'HH:mm');

  return (
    <div className="h-32 w-full mt-4">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        📈 Getij Verloop (NAP)
      </h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorTide" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="time" 
            tick={{ fontSize: 9 }} 
            interval={2} 
            axisLine={false} 
            tickLine={false} 
          />
          <YAxis 
            domain={['dataMin - 0.2', 'dataMax + 0.2']} 
            tick={{ fontSize: 8 }} 
            axisLine={false} 
            tickLine={false} 
          />
          <Tooltip 
            contentStyle={{ fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ fontWeight: 'bold' }}
          />
          <Area 
            type="monotone" 
            dataKey="height" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorTide)" 
            strokeWidth={2}
          />
          <ReferenceLine x={selectedTimeStr} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: selectedTimeStr, fontSize: 8, fill: '#ef4444' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
