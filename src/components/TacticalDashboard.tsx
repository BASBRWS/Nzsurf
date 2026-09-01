import React, { useState } from 'react';
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
  onOpenProfile
}) => {
  const [forecastViewMode, setForecastViewMode] = useState<'cards' | 'grid'>('cards');
  const [selectedEnergyHourIndex, setSelectedEnergyHourIndex] = useState<number>(2);

  const waveHeightVal = currentForecast?.waveHeight ?? (forecasts[0]?.waveHeight ?? 1.3);
  const windKnots = currentForecast?.windSpeed ? Math.round(currentForecast.windSpeed) : (forecasts[0]?.windSpeed ? Math.round(forecasts[0].windSpeed) : 25);
  const periodVal = currentForecast?.swellPeriod ?? (forecasts[0]?.swellPeriod ?? 5.3);
  const waterTemp = currentForecast?.waterTemp ?? (forecasts[0]?.waterTemp ?? 18);

  // Convert knots to Beaufort scale
  const getBft = (knots: number) => {
    if (knots < 1) return '0';
    if (knots <= 3) return '1';
    if (knots <= 6) return '2';
    if (knots <= 10) return '3';
    if (knots <= 16) return '4';
    if (knots <= 21) return '5';
    if (knots <= 27) return '6';
    if (knots <= 33) return '7';
    if (knots <= 40) return '8';
    return '9+';
  };

  const windBft = getBft(windKnots);
  const windBftRange = windKnots > 15 ? `4-${windBft} Bft` : `${windBft} Bft`;

  // Dynamic Date strings (e.g. MAANDAG / 31 AUG)
  const todayDate = currentForecast?.timestamp ? parseISO(currentForecast.timestamp) : new Date();
  const dayNameUpper = format(todayDate, 'EEEE', { locale: nl }).toUpperCase();
  const dayMonthUpper = format(todayDate, 'd MMM', { locale: nl }).toUpperCase();

  // Surf Score Calculation
  const calculateScore = (data?: ForecastData | null) => {
    if (!data) return { score: 4.7, tag: 'POOR', color: 'orange' };
    let sc = 5.0;
    if (data.waveHeight >= 0.7 && data.waveHeight <= 2.2) sc += 2.0;
    else if (data.waveHeight >= 0.4) sc += 1.0;
    else if (data.waveHeight < 0.3) sc -= 2.5;

    if (data.swellPeriod >= 8) sc += 1.5;
    else if (data.swellPeriod >= 6) sc += 0.5;

    if (data.windType === 'offshore') sc += 2.0;
    else if (data.windType === 'side-offshore') sc += 1.0;
    else if (data.windType === 'onshore' && data.windSpeed > 18) sc -= 2.0;

    const final = Math.max(1, Math.min(10, Math.round(sc * 10) / 10));
    let tag = 'POOR';
    let color = 'orange';
    if (final >= 7.8) { tag = 'EPIC'; color = 'amber'; }
    else if (final >= 6.5) { tag = 'GOOD'; color = 'emerald'; }
    else if (final >= 5.0) { tag = 'FAIR'; color = 'cyan'; }
    else if (final <= 3.5) { tag = 'FLAT'; color = 'slate'; }
    return { score: final, tag, color };
  };

  const { score: surfScore, tag: conditionTag, color: scoreColor } = calculateScore(currentForecast || forecasts[0]);

  const handleHourSelect = (data: ForecastData) => {
    if (onSelectForecastHour) {
      onSelectForecastHour(data);
    }
  };

  // 6 Timeline nodes for the Energy / Tide curve chart
  const timelineHours = forecasts.slice(0, 6).length >= 6 
    ? forecasts.slice(0, 6) 
    : [
        { label: '04:00', power: 25, height: 1.1, time: '04:00' },
        { label: '08:00', power: 65, height: 1.4, time: '08:00' },
        { label: '12:00', power: 45, height: 1.3, time: '12:00' },
        { label: '16:00', power: 20, height: 0.9, time: '16:00' },
        { label: '20:00', power: 75, height: 1.6, time: '20:00' },
        { label: '00:00', power: 90, height: 1.8, time: '24:00' }
      ];

  return (
    <div className="space-y-4 text-slate-800 select-none">
      
      {/* 1. TOP HERO SECTION WITH REALISTIC BREAKING OCEAN WAVE BACKGROUND */}
      <div className="relative rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/20 min-h-[360px] sm:min-h-[400px] flex flex-col justify-between p-5 sm:p-7 text-white">
        
        {/* Crisp Ocean Barrel Wave Photo Background */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=1600&q=85')`,
            backgroundPosition: 'center 40%'
          }}
        />
        
        {/* Subtle Atmospheric Ocean Gradient Overlay for clean readability */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/30" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-sky-950/40 via-transparent to-sky-950/20" />

        {/* Top Header Row on Wave: Date & Circular Score Gauge + Notification Bell */}
        <div className="relative z-10 flex items-start justify-between">
          
          {/* Day & Date in High-Contrast White Display Typography */}
          <div className="drop-shadow-md">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight uppercase font-tactical text-white leading-none">
              {dayNameUpper}
            </h1>
            <p className="text-xl sm:text-3xl font-bold tracking-tight text-white/95 mt-1 font-tactical">
              {dayMonthUpper}
            </p>
          </div>

          {/* Right Top: Circular Score Gauge + Notification Bell Icon */}
          <div className="flex items-center gap-3">
            
            {/* Circular Gauge matching the user reference */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              onClick={onOpenAICoach}
              className="relative cursor-pointer group drop-shadow-lg"
              title="Bekijk AI Coach Analyse"
            >
              {/* Circular SVG Gauge Track & Arc */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track Circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth="8"
                    fill="none"
                  />
                  {/* Active Score Colored Arc (orange / amber / emerald) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={
                      conditionTag === 'EPIC' ? '#F59E0B' :
                      conditionTag === 'GOOD' ? '#10B981' :
                      conditionTag === 'FAIR' ? '#06B6D4' :
                      '#F97316'
                    }
                    strokeWidth="8"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 * (1 - (surfScore / 10))}
                    strokeLinecap="round"
                    fill="none"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                {/* Score Number in Center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center -space-y-0.5">
                  <span className="text-xl sm:text-2xl font-black font-tactical text-white tracking-tight drop-shadow-sm">
                    {surfScore.toFixed(1)}
                  </span>
                  {/* Badge pill inside / attached to circle */}
                  <span className={cn(
                    "text-[8px] sm:text-[9px] font-mono font-black uppercase px-2 py-0.2 rounded-full text-white shadow-sm",
                    conditionTag === 'EPIC' ? "bg-amber-500" :
                    conditionTag === 'GOOD' ? "bg-emerald-600" :
                    conditionTag === 'FAIR' ? "bg-cyan-600" :
                    "bg-orange-500"
                  )}>
                    {conditionTag}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Notification Bell Button */}
            <button 
              onClick={onOpenSessionWindow}
              className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white transition-all drop-shadow-md cursor-pointer relative"
              title="Surf Alerts & Getijdenvenster"
            >
              <Bell className="w-5 h-5 fill-white/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400 ring-2 ring-sky-950 absolute top-1 right-1" />
            </button>
          </div>
        </div>

        {/* Middle-to-Bottom Floating Card & Spot Pill over the wave */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mt-6">
          
          {/* Frosted Translucent Glass Card on top of Wave (WAVE HEIGHT / SEE ALL) */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectForecastHour?.(currentForecast || forecasts[0])}
            className="w-full sm:w-64 bg-white/80 hover:bg-white/90 backdrop-blur-xl rounded-2xl p-4 border border-white/70 shadow-xl text-slate-900 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-600">
                WAVE HEIGHT
              </span>
              <span className="text-[10px] font-mono font-bold text-cyan-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                See All <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            <div className="flex items-center gap-2.5 mt-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-100/80 flex items-center justify-center text-cyan-600 shrink-0">
                <Waves className="w-5 h-5" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black font-tactical text-slate-900 leading-none">
                  {waveHeightVal.toFixed(1)}
                </span>
                <span className="text-base font-mono font-bold text-slate-600">m</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 mt-2.5 pt-2 border-t border-slate-200/70">
              <span className="flex items-center gap-1">
                <Waves className="w-3.5 h-3.5 text-cyan-600" />
                <strong>{periodVal}s Swell</strong>
              </span>
              <span className="text-cyan-700 font-bold">
                {currentForecast?.windType === 'offshore' ? 'Clean' : 'Choppy'}
              </span>
            </div>
          </motion.div>

          {/* Spot Pill Badge on Water */}
          <div className="self-end">
            <button 
              onClick={onOpenMap}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 text-xs font-mono font-bold uppercase tracking-wider backdrop-blur-md shadow-lg border border-white transition-all transform hover:scale-105 cursor-pointer"
            >
              <span className="px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-800 text-[10px] font-black">Spot</span>
              <span>{spot.name}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. CRISP WHITE SHEET HOUSING 2x2 METRICS & SWELL ENERGY CHART */}
      <div className="relative -mt-4 sm:-mt-6 z-20 bg-white/95 backdrop-blur-2xl rounded-t-[2.5rem] rounded-b-[2rem] border border-slate-200/90 shadow-[0_15px_40px_rgba(0,35,80,0.06)] p-4 sm:p-7 space-y-6">
        
        {/* Top Sheet Drag/Notch Handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto" />

        {/* 2x2 Metric Cards Grid matching user screenshot */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          
          {/* Card 1: WAVE HEIGHT with Wave Curve Vector */}
          <div className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 flex flex-col justify-between shadow-xs transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">
                WAVE HEIGHT
              </span>
              <Waves className="w-4 h-4 text-cyan-600" />
            </div>

            <div className="my-2 sm:my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-4xl font-black font-tactical text-slate-900">
                  {waveHeightVal.toFixed(1)}
                </span>
                <span className="text-xs sm:text-sm font-mono text-slate-500 font-bold">m</span>
              </div>
            </div>

            {/* Smooth Blue Wave Line Drawing at Bottom */}
            <div className="w-full h-8 flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 24">
                <path
                  d="M 0 18 Q 20 4 40 18 T 80 18 T 100 12"
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 0 18 Q 20 4 40 18 T 80 18 T 100 12 L 100 24 L 0 24 Z"
                  fill="url(#waveFillCard)"
                  opacity="0.15"
                />
                <defs>
                  <linearGradient id="waveFillCard" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284C7" />
                    <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Card 2: WIND with Beaufort & Direction */}
          <div className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 flex flex-col justify-between shadow-xs transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">
                WIND
              </span>
              <Wind className="w-4 h-4 text-orange-600" />
            </div>

            <div className="my-2 sm:my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-4xl font-black font-tactical text-slate-900">
                  {windBftRange}
                </span>
              </div>
            </div>

            {/* Direction & Knots Indicator */}
            <div className="w-full flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono text-slate-500 font-bold">
                {windKnots} knopen • {currentForecast?.windType || 'Side-onshore'}
              </span>
              <div 
                className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 shrink-0 transform transition-transform"
                style={{ transform: `rotate(${currentForecast?.windDirection || 45}deg)` }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Card 3: WAVE PERIOD with Info Icon */}
          <div className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 flex flex-col justify-between shadow-xs transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">
                  WAVE PERIOD
                </span>
                <Info className="w-3 h-3 text-slate-400" />
              </div>
              <Timer className="w-4 h-4 text-cyan-600" />
            </div>

            <div className="my-2 sm:my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-4xl font-black font-tactical text-slate-900">
                  {periodVal.toFixed(0)}
                </span>
                <span className="text-xs sm:text-sm font-mono text-slate-500 font-bold">s</span>
              </div>
            </div>

            {/* Period Waveform Indicator */}
            <div className="w-full flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono text-cyan-700 font-bold">
                {periodVal >= 7 ? 'Krachtige Deining' : 'Windgolven'}
              </span>
              <div className="flex items-end gap-1 h-4">
                {[30, 60, 90, 50, 80].map((h, i) => (
                  <div key={i} className="w-1 bg-cyan-500 rounded-full" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Card 4: TIDE CYCLE with Layered Tide Waves Graphic */}
          <div className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 flex flex-col justify-between shadow-xs transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-slate-600">
                TIDE CYCLE
              </span>
              <Droplets className="w-4 h-4 text-blue-600" />
            </div>

            <div className="my-2 sm:my-3">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-black font-tactical text-slate-900">
                  {currentForecast?.tideHeight !== undefined ? `${currentForecast.tideHeight.toFixed(1)}m` : 'Hoogtij'}
                </span>
                <span className="text-[10px] font-mono text-slate-500 font-bold">
                  ({waterTemp}°C)
                </span>
              </div>
            </div>

            {/* Multi-layered smooth blue tide waves graphic */}
            <div className="w-full h-8 flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 24">
                <path
                  d="M 0 16 C 25 4, 35 20, 60 10 C 85 0, 95 18, 100 14 L 100 24 L 0 24 Z"
                  fill="#93C5FD"
                  opacity="0.5"
                />
                <path
                  d="M 0 18 C 20 8, 40 22, 70 12 C 90 6, 95 16, 100 16 L 100 24 L 0 24 Z"
                  fill="#60A5FA"
                  opacity="0.7"
                />
                <path
                  d="M 0 20 C 30 14, 50 24, 75 16 C 90 12, 95 19, 100 18 L 100 24 L 0 24 Z"
                  fill="#2563EB"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* 3. SWELL ENERGIE & VERLOOP CURVE ("MIJN ENERGIE") */}
        <div className="bg-slate-50/90 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold uppercase font-tactical tracking-wider text-slate-900 flex items-center gap-2">
                <span>MIJN ENERGIE & GOLFVERLOOP</span>
              </h3>
              <p className="text-[10px] font-mono text-slate-500">
                Uurlijkse golfkracht en getijdencyclus voor vandaag
              </p>
            </div>

            <button 
              onClick={() => onSelectForecastHour?.(currentForecast || forecasts[0])}
              className="text-xs font-mono font-bold text-cyan-700 hover:text-cyan-800 flex items-center gap-1 cursor-pointer"
            >
              <span>See All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sine Wave Curve with Points & Time Labels */}
          <div className="relative pt-4 pb-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1 px-1">
              <span>50K</span>
              <span>0K</span>
            </div>

            {/* Interactive SVG Sine Curve */}
            <div className="w-full h-24 sm:h-28 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="25" x2="500" y2="25" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="500" y2="50" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="75" x2="500" y2="75" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />

                {/* Shaded Area Under Curve */}
                <path
                  d="M 20 70 C 90 20, 160 30, 230 75 C 300 100, 370 40, 480 20 L 480 100 L 20 100 Z"
                  fill="url(#energyGradient)"
                  opacity="0.25"
                />

                {/* Primary Sine Curve Line */}
                <path
                  d="M 20 70 C 90 20, 160 30, 230 75 C 300 100, 370 40, 480 20"
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                <defs>
                  <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284C7" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Circular Data Nodes on the curve matching screenshot */}
                <circle cx="20" cy="70" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3" />
                <circle cx="120" cy="28" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3" />
                <circle cx="230" cy="75" r="6" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2.5" />
                <circle cx="340" cy="65" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3" />
                <circle cx="430" cy="28" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3" />
                <circle cx="480" cy="20" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3" />
              </svg>
            </div>

            {/* Time Labels below chart */}
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-mono font-bold text-slate-500 mt-2 px-1">
              <span>04:00</span>
              <span>08:00</span>
              <span className="text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded">12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>00:00</span>
            </div>
          </div>
        </div>

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
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
};


