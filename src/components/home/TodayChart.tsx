import React from 'react';
import { parseISO, isSameDay } from 'date-fns';
import { ForecastData } from '../../types';

interface TodayChartProps {
  forecast: ForecastData[];
}

/** Echte grafiek van vandaag: golfhoogte op de spot (lijn) en getij (vlak). */
export function TodayChart({ forecast }: TodayChartProps) {
  const now = new Date();
  const items = forecast.filter(f => isSameDay(parseISO(f.timestamp), now));
  if (items.length < 2) return null;

  const W = 320, H = 110, padL = 26, padR = 8, padT = 8, padB = 18;
  const x = (f: ForecastData) => {
    const d = parseISO(f.timestamp);
    return padL + ((d.getHours() + d.getMinutes() / 60) / 24) * (W - padL - padR);
  };
  const waves = items.map(f => f.spotWaveHeight ?? f.waveHeight);
  const maxWave = Math.max(1, Math.ceil(Math.max(...waves) * 2) / 2);
  const yWave = (v: number) => padT + (1 - v / maxWave) * (H - padT - padB);
  const tides = items.map(f => f.tideHeight ?? 0);
  const tMin = Math.min(...tides), tMax = Math.max(...tides);
  const yTide = (v: number) => padT + (1 - (tMax - tMin > 0.05 ? (v - tMin) / (tMax - tMin) : 0.5)) * (H - padT - padB) * 0.9 + (H - padT - padB) * 0.1;

  const wavePath = items.map((f, i) => `${i ? 'L' : 'M'} ${x(f).toFixed(1)} ${yWave(waves[i]).toFixed(1)}`).join(' ');
  const tidePath = `M ${x(items[0]).toFixed(1)} ${H - padB} ` +
    items.map((f, i) => `L ${x(f).toFixed(1)} ${yTide(tides[i]).toFixed(1)}`).join(' ') +
    ` L ${x(items[items.length - 1]).toFixed(1)} ${H - padB} Z`;
  const nowX = padL + ((now.getHours() + now.getMinutes() / 60) / 24) * (W - padL - padR);

  return (
    <div className="bg-slate-50/90 rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Vandaag: golf & getij</h3>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-600" />golf op de spot</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-blue-200 rounded-sm" />getij</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Golfhoogte en getij vandaag">
        {[0, maxWave / 2, maxWave].map(v => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yWave(v)} y2={yWave(v)} stroke="#E2E8F0" strokeDasharray="3 3" />
            <text x={padL - 4} y={yWave(v) + 3} textAnchor="end" fontSize="8" fill="#64748B" fontFamily="monospace">{v.toFixed(1)}m</text>
          </g>
        ))}
        <path d={tidePath} fill="#BFDBFE" opacity="0.7" />
        <path d={wavePath} fill="none" stroke="#0284C7" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {items.map((f, i) => <circle key={f.timestamp} cx={x(f)} cy={yWave(waves[i])} r="2.5" fill="#fff" stroke="#0284C7" strokeWidth="1.5" />)}
        <line x1={nowX} x2={nowX} y1={padT} y2={H - padB} stroke="#EF4444" strokeWidth="1" strokeDasharray="3 2" />
        <text x={nowX} y={padT + 6} textAnchor="middle" fontSize="8" fill="#EF4444" fontFamily="monospace">nu</text>
        {[0, 6, 12, 18, 24].map(hh => (
          <text key={hh} x={padL + (hh / 24) * (W - padL - padR)} y={H - 4} textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="monospace">
            {String(hh % 24).padStart(2, '0')}:00
          </text>
        ))}
      </svg>
    </div>
  );
}
