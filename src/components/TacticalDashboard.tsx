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
import { TodayChart } from './home/TodayChart';
import { BestMoments } from './home/BestMoments';
import { OtherSpotsNow } from './home/OtherSpotsNow';
import { pickNow, chanceOf, chanceLevel, nextGoodWindow, rawLine, reasonSentence, windowLabel, knotsToBft, windTypeNl } from '../utils/surfMoments';
import { degreesToCompass16, tideLevelLabel } from '../utils/spotKnowledge';
import { generateLocalSurfAdvice } from '../services/geminiService';

// Hero-foto in passende breedtes. Op de website via het eigen domein (server.ts,
// zelfde paden als de preload in index.html); in de APK direct van Unsplash.
const HERO_IMG = (w: number) => Capacitor.isNativePlatform()
  ? `https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=${w}&q=65`
  : `/img/hero-v1-${w}.webp`;

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
  onSelectSpot
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
    <div className="space-y-4 text-slate-800 select-none">

      {/* 1. HET ANTWOORD: kan ik nu surfen? (met de cijfers erbij) */}
      <div className="relative rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/20 min-h-[340px] flex flex-col justify-between p-4 sm:p-7 text-white">
        {/* <img> i.p.v. CSS-achtergrond: responsief formaat en vroeg ontdekt (LCP);
            index.html preloadt dezelfde srcset. */}
        <img
          src={HERO_IMG(960)}
          srcSet={`${HERO_IMG(640)} 640w, ${HERO_IMG(960)} 960w, ${HERO_IMG(1600)} 1600w`}
          sizes="(max-width: 1024px) 100vw, 1024px"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 z-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 40%' }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/45 via-black/10 to-black/40" />

        {/* Bovenrij: datum + snelkoppelingen naar AI-coach en sessievenster */}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="drop-shadow-md">
            <p className="text-sm sm:text-base font-bold capitalize text-white/95">{dateLine}</p>
            <button
              onClick={onOpenMap}
              className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 hover:bg-white text-slate-800 text-[11px] font-mono font-bold uppercase tracking-wider shadow-lg cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-cyan-700" /> {spot.name}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAICoach}
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white text-[11px] font-bold cursor-pointer"
              title="AI-coach"
            >
              <Sparkles className="w-4 h-4" /> AI-coach
            </button>
            <button
              onClick={onOpenSessionWindow}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white cursor-pointer"
              title="Sessievenster & meldingen"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Antwoordkaart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mt-5 bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-white/70 shadow-xl text-slate-900"
        >
          {nowItem && nowLevel && nowChance !== null ? (
            <>
              <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
                Nu ({format(nowDate, 'HH:mm')}) in {spot.name}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('w-3.5 h-3.5 rounded-full shrink-0', nowLevel.solid)} />
                <span className="text-2xl sm:text-3xl font-black tracking-tight">{nowLevel.label}</span>
                <span className={cn('text-lg font-mono font-black', nowLevel.text)}>{nowChance}%</span>
              </div>
              <p className="text-[12px] font-mono text-slate-700 mt-1.5">{rawLine(nowItem)}</p>
              <p className="text-sm text-slate-700 mt-1">{reasonSentence(spot, nowItem)}</p>
              {personal && (
                <p className="text-[12px] text-slate-600 mt-1.5">
                  Voor jou ({skillNl[user.skillLevel] || user.skillLevel}{personal.board ? `, ${personal.board}` : ''}): <strong>{personal.score}/10</strong>
                </p>
              )}
              {nextGood && (
                <button
                  onClick={() => handleHourSelect(nextGood.peak)}
                  className="mt-3 w-full flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-left cursor-pointer hover:bg-emerald-100"
                >
                  <span className="text-[12px] text-emerald-900">
                    <strong>Beter: {windowLabel(nextGood)}</strong>
                    <span className="block font-mono text-[11px] text-emerald-800">{rawLine(nextGood.peak)}</span>
                  </span>
                  <span className="text-xs font-mono font-black text-emerald-700 shrink-0">{nextGood.peakChance}% <ChevronRight className="w-3 h-3 inline" /></span>
                </button>
              )}
              {nowChance < 70 && !nextGood && (
                <p className="mt-3 text-[12px] text-slate-500">Geen beter moment in de verwachting voor deze spot. Kijk hieronder bij "Nu elders".</p>
              )}
            </>
          ) : forecastError && !isForecastLoading ? (
            <div className="text-sm text-slate-700">
              <p className="font-bold">Verwachting kon niet worden opgehaald.</p>
              <p className="text-[12px] text-slate-500 font-mono">De weerbron (Open-Meteo) reageert niet of is tijdelijk overbelast ({forecastError}).</p>
              {onRetryForecast && (
                <button onClick={onRetryForecast} className="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-900 text-white">Opnieuw proberen</button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Verwachting laden…</p>
          )}
          {forecastStaleAt && forecastError && !isForecastLoading && (
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span>Oudere verwachting van {new Date(forecastStaleAt).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} — ophalen mislukte.</span>
              {onRetryForecast && <button onClick={onRetryForecast} className="font-bold underline shrink-0">Opnieuw</button>}
            </div>
          )}
        </motion.div>
      </div>

      {/* 2. DE CIJFERS: per uur, nu, en het verloop van vandaag */}
      <div className="relative -mt-4 sm:-mt-6 z-20 bg-white/95 backdrop-blur-2xl rounded-t-[2.5rem] rounded-b-[2rem] border border-slate-200/90 shadow-[0_15px_40px_rgba(0,35,80,0.06)] p-4 sm:p-7 space-y-6">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto" />

        <TodayStrip spot={spot} forecast={forecasts} nowItem={nowItem} onSelectHour={handleHourSelect} />

        {/* Nu in cijfers */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button onClick={() => nowItem && handleHourSelect(nowItem)} className="text-left bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Golfhoogte</span>
              <Waves className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{fmt(spotWave)}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">m op de spot</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {fmt(seaWave)} m op zee · swell uit {nowItem ? degreesToCompass16(nowItem.swellDirection) : '—'}
            </p>
          </button>

          <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Wind</span>
              <Wind className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{knotsToBft(windKnots)}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">Bft</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {windKnots} kn uit {nowItem ? degreesToCompass16(nowItem.windDirection) : '—'} · {windTypeNl(nowItem?.windType) || '—'}
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">Periode</span>
              <Timer className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex items-baseline gap-1 my-2">
              <span className="text-2xl sm:text-4xl font-black text-slate-900">{Math.round(periodVal)}</span>
              <span className="text-xs font-mono text-slate-500 font-bold">s</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              {periodVal >= 8 ? 'Goede deining: meer kracht' : periodVal >= 6 ? 'Gemengd: deining + wind' : 'Korte windgolven'}
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
              {nextTurn ? `${nextTurn.isHigh ? 'Hoogwater' : 'Laagwater'} ${nextTurn.time}` : 'Geen kentering meer vandaag'} · water {waterTemp}°C
            </p>
          </div>
        </div>

        <TodayChart forecast={forecasts} />

        {/* 4. WEEK FORECAST SECTION WITH TOGGLE (7-DAY ANALYSIS) */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-600" />
                <h2 className="text-base sm:text-lg font-black font-tactical uppercase tracking-wider text-slate-900">
                  7-Dagen Voorspelling ({spot.name})
                </h2>
              </div>
              <p className="text-[11px] font-mono text-slate-500">
                Volledige analyse inclusief golfhoogte, wind, getijden en setup-matching
              </p>
            </div>

            {/* View Mode Toggle: Dagkaarten vs. Tabel Raster */}
            <div className="flex items-center p-1 rounded-xl bg-white border border-slate-200 self-start sm:self-center shrink-0">
              <button
                onClick={() => setForecastViewMode('cards')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer",
                  forecastViewMode === 'cards'
                    ? "bg-slate-900 text-white shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span>Dagkaarten</span>
              </button>
              <button
                onClick={() => setForecastViewMode('grid')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer",
                  forecastViewMode === 'grid'
                    ? "bg-slate-900 text-white shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
            </div>
          </div>

          {/* Forecast View Component */}
          <AnimatePresence mode="wait">
            {forecastViewMode === 'cards' ? (
              <motion.div
                key="cards"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <CompactDailyForecast
                  forecast={forecasts}
                  spot={spot}
                  user={user}
                  isLoggedIn={isLoggedIn}
                  onSelectForecastHour={handleHourSelect}
                  onOpenProfile={onOpenProfile}
                  focusDay={focusDay}
                />
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <ForecastGrid
                  forecast={forecasts}
                  onCellClick={handleHourSelect}
                  spot={spot}
                  onDayClick={(day) => { setFocusDay(day); setForecastViewMode('cards'); }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. SUGGESTIES: beste momenten en andere spots (met cijfers, zelf oordelen) */}
        <BestMoments spot={spot} forecast={forecasts} onSelectHour={handleHourSelect} />
        {allSpots && onSelectSpot && (
          <OtherSpotsNow spot={spot} spots={allSpots} currentChance={nowChance} onSelectSpot={onSelectSpot} />
        )}

      </div>

    </div>
  );
};


