import React, { useMemo } from 'react';
import { Waves, Wind, Timer, Activity, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ForecastData, SurfAdvice, SurfSpot } from '../types';

/**
 * Surf-report-blok in de stijl van een moderne weer-app: een weer-hero met
 * sessiescore + grote golfhoogte, en daaronder metrictegels (golfhoogte, wind
 * in Bft, golfperiode en getij). Gevoed door de bestaande forecast-data.
 *
 * Het blok is bewust licht/clean gestyled met eigen kleuren, zodat het los
 * staat van het donkere hoofdthema van de app.
 */

// Windsnelheid (knopen) -> Beaufort.
function knotsToBeaufort(knots: number): number {
  const grens = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
  let bft = 0;
  for (const g of grens) if (knots >= g) bft++;
  return bft;
}

// Graden -> kompasrichting (NL).
function degToCompass(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

function ratingFor(score: number): { label: string; color: string; ring: string } {
  if (score >= 8) return { label: 'EPIC', color: '#0f9d58', ring: '#0f9d58' };
  if (score >= 6) return { label: 'GOED', color: '#1a73e8', ring: '#1a73e8' };
  if (score >= 4) return { label: 'MATIG', color: '#f59e0b', ring: '#f59e0b' };
  return { label: 'SLECHT', color: '#ef5350', ring: '#ef5350' };
}

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const r = 30;
  const c = 2 * Math.PI * r;
  const { label, color, ring } = ratingFor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[76px] h-[76px]">
        <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
          <circle
            cx="38" cy="38" r={r} fill="none" stroke={ring} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black text-white tabular-nums">{score.toFixed(1)}</span>
        </div>
      </div>
      <span
        className="text-[10px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-md text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </div>
  );
}

function Tile({
  icon, label, value, unit, sub, accent = '#1a73e8', children,
}: {
  icon: React.ReactNode; label: string; value?: string; unit?: string; sub?: string;
  accent?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgba(30,64,120,0.08)] border border-slate-100 flex flex-col justify-between min-h-[112px]">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="grid place-items-center w-6 h-6 rounded-lg" style={{ backgroundColor: `${accent}1a`, color: accent }}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {children ?? (
        <div className="mt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-slate-800 tabular-nums leading-none">{value}</span>
            {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
          </div>
          {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
        </div>
      )}
    </div>
  );
}

// Decoratieve getij-sinus met markering van de huidige stand.
function TideSpark({ tide }: { tide?: number }) {
  const w = 150, h = 44;
  const path = useMemo(() => {
    let d = '';
    for (let x = 0; x <= w; x += 6) {
      const y = h / 2 - Math.sin((x / w) * Math.PI * 2) * (h / 2 - 5);
      d += (x === 0 ? 'M' : 'L') + x + ' ' + y.toFixed(1) + ' ';
    }
    return d.trim();
  }, []);
  // huidige stand: fase op basis van het uur van de dag
  const phase = ((new Date().getHours() % 12) / 12);
  const cx = phase * w;
  const cy = h / 2 - Math.sin(phase * Math.PI * 2) * (h / 2 - 5);
  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11">
        <path d={path} fill="none" stroke="#1a73e8" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        <circle cx={cx} cy={cy} r="4.5" fill="#1a73e8" />
      </svg>
      {typeof tide === 'number' && (
        <div className="text-[11px] text-slate-400 mt-0.5">Nu ± {tide.toFixed(1)} m</div>
      )}
    </div>
  );
}

export function SurfReportCard({
  spot, forecast, advice, onDetails,
}: {
  spot: SurfSpot | undefined;
  forecast: ForecastData | null;
  advice: SurfAdvice | null;
  onDetails?: () => void;
}) {
  const now = new Date();
  const day = format(now, 'EEEE', { locale: nl }).toUpperCase();
  const date = format(now, 'd MMM', { locale: nl }).toUpperCase();
  const score = advice?.score ?? 0;

  const waveHeight = forecast?.waveHeight ?? 0;
  const period = forecast?.swellPeriod ?? 0;
  const windKnots = forecast?.windSpeed ?? 0;
  const bft = knotsToBeaufort(windKnots);
  const windDir = degToCompass(forecast?.windDirection ?? 0);
  const swellDir = degToCompass(forecast?.swellDirection ?? 0);
  const tide = forecast?.tideHeight;

  return (
    <div className="rounded-[2rem] overflow-hidden shadow-[0_12px_40px_rgba(30,64,120,0.18)]">
      {/* Weer-hero */}
      <div className="relative px-5 pt-5 pb-8 bg-gradient-to-br from-[#2a7de1] via-[#1a73e8] to-[#0b4aa2] text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #fff 0, transparent 40%)' }} />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-2xl font-black leading-tight tracking-tight">{day}</div>
            <div className="text-white/70 text-sm font-semibold">{date}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] bg-white/15 rounded-full px-2.5 py-1 font-semibold">
              <Waves className="w-3.5 h-3.5" /> {spot?.name ?? 'Spot'}
            </div>
          </div>
          <ScoreGauge score={score} />
        </div>
        <div className="relative mt-5 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Golfhoogte</div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black tabular-nums">{waveHeight.toFixed(1)}</span>
              <span className="text-xl font-bold text-white/80">m</span>
            </div>
            <div className="text-[12px] text-white/70 mt-0.5">Swell uit {swellDir} · {period.toFixed(0)}s</div>
          </div>
          {onDetails && (
            <button
              onClick={onDetails}
              className="inline-flex items-center gap-1 text-[12px] font-bold bg-white text-[#1a73e8] rounded-full pl-3 pr-2 py-1.5 shadow-md active:scale-95 transition"
            >
              Details <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Metrictegels */}
      <div className="bg-[#eef4fb] p-3">
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={<Waves className="w-3.5 h-3.5" />} label="Golfhoogte"
            value={waveHeight.toFixed(1)} unit="m" sub={`Swell uit ${swellDir}`} />
          <Tile icon={<Wind className="w-3.5 h-3.5" />} label="Wind"
            value={`${bft}`} unit="Bft" sub={`${windDir} · ${Math.round(windKnots)} kn`} accent="#0f9d58" />
          <Tile icon={<Timer className="w-3.5 h-3.5" />} label="Golfperiode"
            value={period.toFixed(0)} unit="s" sub={period >= 8 ? 'Krachtige swell' : 'Korte periode'} accent="#7c4dff" />
          <Tile icon={<Activity className="w-3.5 h-3.5" />} label="Getij" accent="#00acc1">
            <TideSpark tide={tide} />
          </Tile>
        </div>
      </div>
    </div>
  );
}
