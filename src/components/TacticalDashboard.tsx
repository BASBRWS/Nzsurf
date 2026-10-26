import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Waves, 
  Wind, 
  Clock, 
  Timer, 
  TrendingUp, 
  Sparkles, 
  ChevronRight, 
  Info, 
  ArrowUpRight, 
  ArrowDownRight, 
  Droplets,
  Calendar,
  Compass,
  LayoutGrid,
  List,
  Bell,
  MapPin,
  ChevronDown
} from 'lucide-react';
import { SurfSpot, ForecastData, UserProfile } from '../types';
import { CompactDailyForecast } from './CompactDailyForecast';
import { ForecastGrid } from './ForecastGrid';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { Capacitor } from '@capacitor/core';
import { TodayStrip } from './home/TodayStrip';
import { TodayInstrument } from './tide/TodayInstrument';
import { TodayChart } from './home/TodayChart';
import { BestMoments } from './home/BestMoments';
import { pickNow, chanceOf, chanceLevel, nextGoodWindow, rawLine, reasonSentence, windowLabel, knotsToBft, windTypeNl } from '../utils/surfMoments';
import { degreesToCompass16, tideLevelLabel } from '../utils/spotKnowledge';
import { generateLocalSurfAdvice } from '../services/geminiService';

interface TacticalDashboardProps {
  spot: SurfSpot;
  currentForecast?: ForecastData | null;
  forecasts: ForecastData[];
  user: UserProfile;
  isLoggedIn?: boolean;
  onSelectForecastHour?: (data: ForecastData) => void;
  onOpenSessionWindow?: () => void;
  onOpenAICoach?: () => void;
  onOpenMap?: () => void;
  onOpenProfile?: () => void;
  allSpots?: SurfSpot[];
  onSelectSpot?: (spotId: string) => void;
  isForecastLoading?: boolean;
  /** Foutmelding als het ophalen mislukte (ook als er een oudere verwachting getoond wordt). */
  forecastError?: string | null;
  /** Tijdstip van de getoonde oudere verwachting, als die uit de cache komt. */
  forecastStaleAt?: string | null;
  onRetryForecast?: () => void;
  onOpenWeek?: () => void;
  algoNote?: string;
}

export const TacticalDashboard: React.FC<TacticalDashboardProps> = ({
  spot,
  currentForecast,
  forecasts,
  user,
  isLoggedIn = false,
  onSelectForecastHour,
  onOpenSessionWindow,
  onOpenAICoach,
  onOpenMap,
  onOpenProfile,
  allSpots,
  isForecastLoading = false,
  forecastError = null,
  forecastStaleAt = null,
  onRetryForecast,
  onSelectSpot,
  onOpenWeek,
  algoNote
}) => {
  // Standaard de tabel (weekoverzicht); dagkaarten pas na een klik.
  const [forecastViewMode, setForecastViewMode] = useState<'cards' | 'grid'>('grid');
  const [focusDay, setFocusDay] = useState<string | null>(null);

  // "Nu" = het verwachtingsblok dat het dichtst bij de huidige tijd ligt
  // (forecasts[0] is 00:00 van vandaag, niet nu).
  const nowItem = useMemo(() => pickNow(forecasts) || currentForecast || null, [forecasts, currentForecast]);
  const nowChance = nowItem ? chanceOf(spot, nowItem) : null;
  const nowLevel = nowChance !== null ? chanceLevel(nowChance) : null;
  const nextGood = useMemo(() => {
    if (!nowItem || nowChance === null || nowChance >= 70) return null;
    return nextGoodWindow(spot, forecasts);
  }, [spot, forecasts, nowItem, nowChance]);

  // Persoonlijk oordeel (alleen ingelogd): zelfde offline motor als de AI-fallback.
  const personal = useMemo(() => {
    if (!isLoggedIn || !nowItem) return null;
    try {
      const adv = generateLocalSurfAdvice(user, spot, nowItem);
      const board = user.boards?.find(b => b.id === adv.recommendedBoardId);
      return { score: adv.score, board: board?.name };
    } catch { return null; }
  }, [isLoggedIn, user, spot, nowItem]);

  const skillNl: Record<string, string> = { beginner: 'beginner', intermediate: 'gevorderd', advanced: 'ervaren', pro: 'pro' };

  const seaWave = nowItem?.waveHeight ?? 0;
  const spotWave = nowItem ? (nowItem.spotWaveHeight ?? nowItem.waveHeight) : 0;
  const windKnots = nowItem ? Math.round(nowItem.windSpeed) : 0;
  const periodVal = nowItem?.swellPeriod ?? 0;
  const waterTemp = nowItem?.waterTemp ?? 0;
  const nextTurn = useMemo(() => {
    if (!nowItem?.dayTideTurns?.length) return null;
    const hhmm = format(new Date(), 'HH:mm');
    return nowItem.dayTideTurns.find(t => t.time > hhmm) || null;
  }, [nowItem]);
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');

  const nowDate = nowItem ? parseISO(nowItem.timestamp) : new Date();
  const dateLine = format(new Date(), 'EEEE d MMMM', { locale: nl });

  const handleHourSelect = (data: ForecastData) => {
    if (onSelectForecastHour) {
      onSelectForecastHour(data);
    }
  };

  return (
    <div className="space-y-6 text-slate-800 select-none">

      {/* 1. HET ANTWOORD: één woord, het tijdvak, en de dag als lijn */}
      <TodayInstrument
        spot={spot} forecasts={forecasts} user={user} isLoggedIn={isLoggedIn}
        isLoading={isForecastLoading} error={forecastError} staleAt={forecastStaleAt} onRetry={onRetryForecast}
        onSelectHour={handleHourSelect} onOpenAICoach={onOpenAICoach} onOpenSessionWindow={onOpenSessionWindow}
        onOpenProfile={onOpenProfile} algoNote={algoNote}
      />

      {/* 2. ALLE CIJFERS VAN VANDAAG: één tik dieper */}
      <details className="group border-t border-[color:var(--tide-line)]">
        <summary className="list-none flex items-center justify-between min-h-[56px] px-1 cursor-pointer text-[17px]">
          <span>Alle cijfers van vandaag</span>
          <ChevronDown className="w-5 h-5 transition-transform group-open:rotate-180" />
        </summary>
      <div className="relative bg-white rounded-3xl border border-slate-200 p-4 sm:p-7 space-y-6">

        <TodayStrip spot={spot} forecast={forecasts} nowItem={nowItem} onSelectHour={handleHourSelect} />

        {/* Nu in cijfers */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button onClick={() => nowItem && handleHourSelect(nowItem)} className="text-left bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Golfhoogte</span>
              <Waves className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{nowItem ? fmt(spotWave) : '—'}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">m op de spot</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {nowItem ? fmt(seaWave) : '—'} m op zee · swell uit {nowItem ? degreesToCompass16(nowItem.swellDirection) : '—'}
            </p>
          </button>

          <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Wind</span>
              <Wind className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{nowItem ? knotsToBft(windKnots) : '—'}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">Bft</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {nowItem ? windKnots : '—'} kn uit {nowItem ? degreesToCompass16(nowItem.windDirection) : '—'} · {windTypeNl(nowItem?.windType) || '—'}
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Periode</span>
              <Timer className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{nowItem ? Math.round(periodVal) : '—'}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">s</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {!nowItem ? 'Nog geen verwachting' : periodVal >= 8 ? 'Goede deining: meer kracht' : periodVal >= 6 ? 'Gemengd: deining + wind' : 'Korte windgolven'}
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Getij</span>
              <Droplets className="w-4 h-4 text-blue-600" />
            </div>
            <div className="my-2">
              <span className="text-lg sm:text-2xl font-black text-slate-900 capitalize">
                {nowItem?.tideLevel !== undefined ? tideLevelLabel(nowItem.tideLevel, nowItem.tideTrend) : '—'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {nextTurn ? `${nextTurn.isHigh ? 'Hoogwater' : 'Laagwater'} ${nextTurn.time}` : 'Geen kentering meer vandaag'} · water {nowItem ? `${waterTemp}°C` : '—'}
            </p>
          </div>
        </div>

        <TodayChart forecast={forecasts} />

        <BestMoments spot={spot} forecast={forecasts} onSelectHour={handleHourSelect} />
      </div>
      </details>

      {onOpenWeek && (
        <button onClick={onOpenWeek} className="w-full flex items-center justify-between min-h-[56px] px-1 border-t border-b border-[color:var(--tide-line)] text-[17px] cursor-pointer">
          <span>De week</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

    </div>
  );
};


