import React, { useState } from 'react';
import { ForecastData, SurfSpot, UserProfile } from '../types';
import { processDailyForecasts, DailySummary } from '../utils/dailyForecastUtils';
import { isOuddorpNoordwegKiteZone } from '../utils/kiteAlertUtils';
import { 
  Sun, 
  CloudSun, 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  CloudLightning, 
  CloudFog, 
  Target, 
  Waves, 
  Wind, 
  Clock, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Sparkles, 
  User, 
  ChevronRight,
  ChevronDown,
  Info,
  Compass,
  Zap,
  Gauge,
  Activity,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface CompactDailyForecastProps {
  forecast: ForecastData[];
  spot: SurfSpot;
  user: UserProfile;
  isLoggedIn: boolean;
  onSelectForecastHour: (data: ForecastData) => void;
  onOpenProfile?: () => void;
}

const getWeatherIcon = (code?: number) => {
  if (code === undefined) return <Sun className="w-4 h-4 text-amber-500" />;
  switch (code) {
    case 0:
      return <Sun className="w-4 h-4 text-amber-500" />;
    case 1:
    case 2:
      return <CloudSun className="w-4 h-4 text-amber-600" />;
    case 3:
      return <Cloud className="w-4 h-4 text-slate-500" />;
    case 45:
    case 48:
      return <CloudFog className="w-4 h-4 text-slate-500" />;
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
      return <CloudRain className="w-4 h-4 text-cyan-600" />;
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return <CloudSnow className="w-4 h-4 text-blue-400" />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning className="w-4 h-4 text-amber-600" />;
    default:
      return <Sun className="w-4 h-4 text-amber-500" />;
  }
};

export function CompactDailyForecast({
  forecast,
  spot,
  user,
  isLoggedIn,
  onSelectForecastHour,
  onOpenProfile
}: CompactDailyForecastProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const dailySummaries = React.useMemo(() => {
    return processDailyForecasts(forecast, spot, user, isLoggedIn);
  }, [forecast, spot, user, isLoggedIn]);

  if (dailySummaries.length === 0) {
    return (
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-10 text-center space-y-4 border border-slate-200 shadow-sm">
        <Waves className="w-8 h-8 text-cyan-600 mx-auto animate-pulse" />
        <p className="text-sm font-mono text-slate-500 uppercase tracking-widest">
          Geen voorspelling beschikbaar voor {spot?.name}
        </p>
      </div>
    );
  }

  const todaySummary = dailySummaries[0];

  return (
    <div className="space-y-5">
      {/* Top Intelligence Banner: Prime Session Spotlight in Light Theme */}
      {todaySummary && todaySummary.bestWindow && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onSelectForecastHour(todaySummary.bestHourData)}
          className="relative overflow-hidden rounded-[2rem] border border-cyan-300 bg-gradient-to-r from-cyan-50 via-white/95 to-blue-50/80 p-5 sm:p-6 shadow-[0_8px_30px_rgba(0,180,216,0.1)] backdrop-blur-xl group cursor-pointer transition-all hover:border-cyan-500 hover:shadow-md"
        >
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-cyan-200/40 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-200/60 transition-all" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500 border border-cyan-400 flex items-center justify-center text-white shrink-0 shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">
                    Prime Session Venster
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {spot.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-2 pt-0.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-tactical">
                    {todaySummary.bestWindow.timeRange}
                  </span>
                  <span className="text-xs sm:text-sm text-cyan-700 font-medium">
                    • {todaySummary.bestWindow.conditionText}
                  </span>
                  {todaySummary.sunscreenAdvice && todaySummary.sunscreenAdvice.uvIndex >= 1 && (
                    <span className="text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1">
                      <Sun className="w-3 h-3 text-amber-500" />
                      UV {todaySummary.sunscreenAdvice.uvIndex} ({todaySummary.sunscreenAdvice.spfRecommendation.split(' ')[0]})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-center px-4 py-2 rounded-xl bg-slate-900 text-white group-hover:bg-cyan-600 transition-all text-xs font-mono font-bold uppercase tracking-wider shadow-sm">
              <span>Open Uuranalyse</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Profile & Setup Calibration Banner in Light Theme */}
      {user.boards && user.boards.length > 0 ? (
        <div className="rounded-2xl p-4 border border-emerald-300 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-1.5 rounded-lg bg-emerald-200 text-emerald-800 shrink-0 mt-0.5 sm:mt-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-700 leading-relaxed min-w-0">
              <span className="text-slate-900 font-bold block sm:inline">Setup-berekening actief: </span>
              <span className="text-slate-600">
                Scores & adviezen zijn geoptimaliseerd voor jouw <strong className="text-emerald-800">{user.boards.length} geregistreerde surfplank{user.boards.length > 1 ? 'en' : ''}</strong> en {user.weight || 75}kg profiel ({user.skillLevel || 'intermediate'}).
              </span>
            </div>
          </div>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="shrink-0 self-start sm:self-center px-3 py-1 rounded-lg bg-white border border-emerald-300 text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            >
              Setup beheren
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl p-4 border border-slate-200 bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-1.5 rounded-lg bg-cyan-100 text-cyan-800 shrink-0 mt-0.5 sm:mt-0">
              <Info className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900 font-bold">Standaard surfer-benchmark:</strong> Berekeningen zijn gebaseerd op een allround surfer (75kg, intermediate niveau, 36L board). Voeg je eigen boards toe voor advies op maat van jouw gear.
            </p>
          </div>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="shrink-0 self-start sm:self-center px-3 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-800 transition-all cursor-pointer whitespace-nowrap"
            >
              + Voeg setup toe
            </button>
          )}
        </div>
      )}

      {/* 7-Day Daily Forecast Cards (Crisp Tactical Light Theme) */}
      <div className="space-y-4 sm:space-y-5">
        {dailySummaries.map((day, idx) => {
          const isExpanded = expandedDay === day.dateStr;
          
          return (
            <motion.div
              key={day.dateStr}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="relative overflow-hidden rounded-[2rem] border border-slate-200/90 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,40,90,0.06)] hover:border-cyan-400 hover:shadow-[0_12px_35px_rgba(0,180,216,0.1)] transition-all duration-300"
            >
              {/* Top Dynamic Rating Accent Line */}
              <div className={cn(
                "h-1.5 w-full bg-gradient-to-r",
                day.ratingLabel === 'EPIC' ? "from-amber-400 via-yellow-400 to-amber-500" :
                day.ratingLabel === 'GOOD' ? "from-emerald-400 via-teal-400 to-emerald-500" :
                day.ratingLabel === 'FAIR' ? "from-cyan-400 via-blue-400 to-cyan-500" :
                day.ratingLabel === 'POOR' ? "from-orange-400 via-amber-400 to-orange-500" :
                "from-slate-300 via-slate-400 to-slate-300"
              )} />

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                {/* 1. Command Header: Date + Rating Radar Capsule */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  {/* Left: Date Block */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    {/* Calendar Micro Tile */}
                    <div className="flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-50 border border-slate-200 shrink-0 shadow-xs">
                      <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-600">
                        {day.dayName.slice(0, 3)}
                      </span>
                      <span className="text-lg sm:text-xl font-black text-slate-900 font-tactical leading-none mt-0.5">
                        {day.dayNumber}
                      </span>
                      <span className="text-[8px] sm:text-[9px] font-mono text-slate-400 uppercase font-bold">
                        {day.monthName}
                      </span>
                    </div>

                    <div className="space-y-0.5 sm:space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-xl font-black text-slate-900 font-tactical tracking-tight truncate uppercase">
                          {day.dayName}
                        </h3>
                        <div className="p-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 shrink-0">
                          {getWeatherIcon(day.weatherCode)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                        <span className="font-semibold text-slate-600 truncate">{day.ratingHeadline}</span>
                        <span className="text-slate-300 hidden xs:inline">•</span>
                        <span className="text-[9px] sm:text-[10px] font-mono text-cyan-800 bg-cyan-50 px-1.5 sm:px-2 py-0.5 rounded border border-cyan-200 font-bold">
                          {day.spotMatchPercent}% Spot Match
                        </span>
                        {day.isPersonalizedQuiver ? (
                          <span className="text-[9px] sm:text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 font-medium">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Setup: {day.quiverEvaluation.bestBoard.name} ({day.quiverEvaluation.bestBoard.matchPercent}%)
                          </span>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded border border-slate-200">
                            Standaard shape: {day.gearAdvice.board}
                          </span>
                        )}
                        {day.kiteAlert?.isZone && day.kiteAlert?.isFavorable && (
                          <span className={cn(
                            "text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded border flex items-center gap-1 font-bold",
                            day.kiteAlert.intensity === 'extreme'
                              ? "bg-red-50 text-red-800 border-red-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          )}>
                            <Wind className="w-3 h-3" />
                            Kite Alert: {day.kiteAlert.badgeLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Score Radar Capsule in Light Theme */}
                  <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                    <div className={cn(
                      "flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border font-mono shadow-xs transition-all",
                      day.ratingLabel === 'EPIC' ? "bg-amber-50 text-amber-900 border-amber-300" :
                      day.ratingLabel === 'GOOD' ? "bg-emerald-50 text-emerald-900 border-emerald-300" :
                      day.ratingLabel === 'FAIR' ? "bg-cyan-50 text-cyan-900 border-cyan-300" :
                      day.ratingLabel === 'POOR' ? "bg-orange-50 text-orange-900 border-orange-300" :
                      "bg-slate-50 text-slate-700 border-slate-300"
                    )}>
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] sm:text-[9px] uppercase tracking-wider font-bold opacity-70">
                          {day.isPersonalizedQuiver ? 'Setup Score' : 'Score'}
                        </span>
                        <span className="text-sm sm:text-lg font-black font-tactical leading-none">{day.ratingScore.toFixed(1)}</span>
                      </div>
                      <div className="h-5 sm:h-6 w-px bg-current opacity-30" />
                      <span className="text-xs sm:text-sm font-black font-tactical uppercase tracking-wider">
                        {day.ratingLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kite Waarschuwing Alert Box */}
                {day.kiteAlert?.isZone && day.kiteAlert?.isFavorable && (
                  <div className={cn(
                    "p-3.5 sm:p-4 rounded-2xl border flex items-start gap-3 transition-all",
                    day.kiteAlert.intensity === 'extreme'
                      ? "bg-red-50 border-red-300 text-red-900"
                      : "bg-amber-50 border-amber-300 text-amber-900"
                  )}>
                    <div className="p-2 rounded-xl bg-amber-200/60 text-amber-800 shrink-0 mt-0.5">
                      <Wind className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-900 font-mono flex items-center gap-1.5">
                          <span>🪁 Kite Waarschuwing: Drukte & Gunstige Wind</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-mono font-bold">
                            {day.kiteAlert.windKnots} kn / {day.kiteAlert.windBft} Bft {day.kiteAlert.windDirection ? `(${day.kiteAlert.windDirection})` : ''}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {day.kiteAlert.fullWarning}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 pt-0.5">
                        Geldt voor: {day.kiteAlert.zoneDescription}
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. Tactical AI Oceanographic Briefing Box */}
                <div className="p-3.5 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 mt-1.5 shrink-0 animate-ping" />
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed break-words font-medium">
                      {day.summaryNarrative}
                    </p>
                  </div>

                  {/* Match Alignment Note */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80 text-[11px] sm:text-xs text-slate-600 font-mono">
                    <Compass className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span className="leading-snug break-words">{day.matchNote.text}</span>
                  </div>
                </div>

                {/* 3. 4-Module Bento Telemetry Grid in Light Theme */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  {/* Module 1: Swell & Face Height */}
                  <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200 hover:border-cyan-400 transition-colors space-y-1.5 shadow-xs min-w-0">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider font-bold truncate">Golven & Face</span>
                      <Waves className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-600 shrink-0" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-black text-slate-900 font-tactical">{day.waveHeight.peak.toFixed(1)}</span>
                        <span className="text-xs font-mono text-slate-400 font-bold">m</span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-cyan-700 pt-0.5 truncate font-medium">
                        Face: {day.waveHeight.breakingFace}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 truncate">
                      <span className="font-bold text-cyan-600">{day.waveHeight.dirArrow}</span>
                      <span className="truncate">{day.waveHeight.dirLabel} ({day.waveHeight.directionDeg}°)</span>
                    </div>
                  </div>

                  {/* Module 2: Wind Dynamics */}
                  <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200 hover:border-orange-400 transition-colors space-y-1.5 shadow-xs min-w-0">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider font-bold truncate">Wind & Structuur</span>
                      <Wind className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600 shrink-0" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-black text-slate-900 font-tactical truncate">{day.wind.bftRange}</span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-orange-600 pt-0.5 truncate font-medium">
                        {day.wind.speedKnots} kn • {day.wind.gustKnots} kn
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 truncate">
                      <span className="font-bold text-orange-600">{day.wind.dirArrow}</span>
                      <span className="truncate">{day.wind.dirLabel} • {day.wind.classificationLabel.split('•')[0]}</span>
                    </div>
                  </div>

                  {/* Module 3: Swell Period */}
                  <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-400 transition-colors space-y-1.5 shadow-xs min-w-0">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider font-bold truncate">Periode & Power</span>
                      <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-black text-slate-900 font-tactical">{day.period}</span>
                        <span className="text-xs font-mono text-slate-400 font-bold">s</span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-emerald-700 pt-0.5 truncate font-medium">
                        {day.waveHeight.swellEnergyKj} kJ/m²
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 truncate">
                      {day.periodLabel}
                    </div>
                  </div>

                  {/* Module 4: Tide Windows */}
                  <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 transition-colors space-y-1.5 shadow-xs min-w-0">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider font-bold truncate">Getijdencyclus</span>
                      <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                    </div>
                    <div className="space-y-1">
                      {day.tideTurns.length > 0 ? (
                        day.tideTurns.slice(0, 2).map((t, tIdx) => (
                          <div key={tIdx} className="flex items-center justify-between text-[10px] sm:text-xs font-mono">
                            <span className="text-slate-500 flex items-center gap-1 truncate">
                              {t.isHigh ? <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cyan-600 shrink-0" /> : <ArrowDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-600 shrink-0" />}
                              <span className="truncate">{t.isHigh ? 'Hoogtij' : 'Laagtij'}</span>
                            </span>
                            <span className="text-slate-900 font-bold ml-1">{t.time}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] sm:text-xs font-mono text-slate-400">Geen getijdata</div>
                      )}
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-100 truncate">
                      {spot.isAtlantic ? 'Atlantisch getij' : 'Noordzee getij'}
                    </div>
                  </div>
                </div>

                {/* 4. Tactical Playbook & Gear Strategy Matrix in Light Theme */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-cyan-50/70 via-slate-50/50 to-white border border-cyan-200/80 space-y-3.5">
                  {/* Prime Session Window Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <Zap className="w-4 h-4 text-cyan-600 shrink-0" />
                      <span className="text-slate-900 font-bold">Beste Sessie Venster:</span>
                      <span className="text-cyan-800 font-bold px-2 py-0.5 rounded bg-cyan-100 border border-cyan-200">{day.bestWindow?.timeRange}</span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
                      {day.bestWindow?.why}
                    </p>
                  </div>

                  {/* Setup & Wetsuit Advice Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
                    {/* Setup Surfboard Box */}
                    <div className="p-3 sm:p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-800 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          {day.isPersonalizedQuiver ? 'Uit jouw Setup' : 'Aanbevolen Shape'}
                        </span>
                        <span className={cn(
                          "text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border",
                          day.quiverEvaluation.bestBoard.matchPercent >= 85 
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300" 
                            : "bg-cyan-50 text-cyan-800 border-cyan-300"
                        )}>
                          {day.quiverEvaluation.bestBoard.matchPercent}% Match
                        </span>
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-baseline gap-2">
                          <span>{day.quiverEvaluation.bestBoard.name}</span>
                          <span className="text-[11px] font-mono text-slate-500 font-normal">
                            ({day.quiverEvaluation.bestBoard.length} • {day.quiverEvaluation.bestBoard.volume}L)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                          {day.quiverEvaluation.bestBoard.reason}
                        </p>
                      </div>

                      {/* Setup Comparison Pill list if multiple boards owned */}
                      {day.quiverEvaluation.allBoards.length > 1 && (
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-slate-400">Jouw setup:</span>
                          {day.quiverEvaluation.allBoards.map((b, bIdx) => (
                            <span 
                              key={bIdx} 
                              className={cn(
                                "px-1.5 py-0.5 rounded border text-[10px]",
                                bIdx === 0 
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold" 
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              )}
                            >
                              {b.name} ({b.matchPercent}%)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Wetsuit Box */}
                    <div className="p-3 sm:p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {day.gearAdvice.wetsuitIsOwned ? 'Uit jouw Kast' : 'Wetsuit Advies'}
                        </span>
                        <span className="text-[10px] font-mono text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 font-bold">
                          {day.waterTempAvg}°C Water
                        </span>
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900">
                          {day.gearAdvice.wetsuit}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                          {day.quiverEvaluation.wetsuitNote}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-400">
                        {day.gearAdvice.wetsuitSubtitle}
                      </div>
                    </div>
                  </div>

                  {/* Sunscreen Advice Sub-bar */}
                  {day.sunscreenAdvice && (
                    <div className="pt-2.5 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sun className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          day.sunscreenAdvice.level === 'high' || day.sunscreenAdvice.level === 'very_high' 
                            ? "text-amber-500" 
                            : day.sunscreenAdvice.level === 'moderate' 
                            ? "text-yellow-600" 
                            : "text-slate-400"
                        )} />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold shrink-0">Zonkracht & Zonnebrand:</span>
                        <span className={cn(
                          "text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0",
                          day.sunscreenAdvice.level === 'high' || day.sunscreenAdvice.level === 'very_high'
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : day.sunscreenAdvice.level === 'moderate'
                            ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {day.sunscreenAdvice.levelLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate sm:text-right font-medium">
                        {day.sunscreenAdvice.shortAdvice}
                      </p>
                    </div>
                  )}
                </div>

                {/* 5. Daypart Timeline Strip (Morning -> Evening) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                    <span>Dagverloop (Ochtend → Avond)</span>
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : day.dateStr)}
                      className="text-cyan-700 hover:underline flex items-center gap-1 normal-case font-sans text-xs font-bold cursor-pointer"
                    >
                      <span>{isExpanded ? 'Verberg dagdelen' : 'Toon dagdelen'}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 overflow-hidden"
                      >
                        {day.dayParts.map((part, pIdx) => (
                          <div 
                            key={pIdx}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs font-mono"
                          >
                            <div className="flex items-center justify-between text-slate-500 text-[10px]">
                              <span className="font-bold text-slate-800 uppercase">{part.label}</span>
                              <div className="flex items-center gap-1.5">
                                {part.uvIndex !== undefined && part.uvIndex >= 1 && (
                                  <span className="text-amber-600 font-bold">☀️ UV {part.uvIndex}</span>
                                )}
                                <span>{part.timeRange}</span>
                              </div>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-base font-bold text-slate-900 font-tactical">{part.waveHeight.toFixed(1)}m</span>
                              <span className="text-cyan-700 font-bold">{part.windBft} Bft {part.windDir}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/80">
                              <span>{part.condition}</span>
                              <span className="font-bold text-cyan-800">{part.ratingScore.toFixed(1)}/10</span>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 6. Card Footer Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    {spot.name} • {day.hourlyData.length} datapunten
                  </span>

                  <button
                    onClick={() => onSelectForecastHour(day.bestHourData)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-cyan-600 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all shadow-sm cursor-pointer"
                  >
                    <span>Uur-voor-uur Details</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

