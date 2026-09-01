import React, { useState, useMemo, useEffect } from 'react';
import { SurfAdvice, ForecastData, SurfSpot, UserProfile } from '../types';
import { format, parseISO, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { 
  X, CheckCircle2, AlertCircle, Ban, Activity, Wind, Waves, Zap, Sun, 
  Sparkles, Bot, Clock, ChevronRight, Navigation, RefreshCw, 
  BarChart3, Table as TableIcon, Layers, ShieldCheck, Thermometer, 
  Compass, ArrowUpRight
} from 'lucide-react';
import { DetailedCharts } from './DetailedCharts';
import { WaveTubeLoader } from './WaveTubeLoader';
import { Tooltip } from './ui/Tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { knotsToBeaufort, getCompassInfo } from '../utils/dailyForecastUtils';
import { calculateSunscreenAdvice, getUvPillClasses } from '../utils/sunscreenUtils';
import { getKiteAlert } from '../utils/kiteAlertUtils';

interface AdviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  advice: SurfAdvice | null;
  forecast: ForecastData | null;
  allForecastData: ForecastData[];
  loading: boolean;
  spot: SurfSpot;
  user?: UserProfile;
  onRequestAdvice?: (hourData?: ForecastData) => void;
  onSelectForecastHour?: (hourData: ForecastData) => void;
}

type ModalTab = 'hourly' | 'charts' | 'ai';

export function AdviceModal({ 
  isOpen, 
  onClose, 
  advice, 
  forecast, 
  allForecastData, 
  loading, 
  spot,
  user,
  onRequestAdvice,
  onSelectForecastHour
}: AdviceModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('hourly');

  // Keyboard navigation & Escape handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Extract all hours for the selected day
  const selectedDate = useMemo(() => {
    if (!forecast) return new Date();
    return parseISO(forecast.timestamp);
  }, [forecast]);

  const dayHours = useMemo(() => {
    if (!forecast || !allForecastData.length) return [];
    return allForecastData
      .filter(f => isSameDay(parseISO(f.timestamp), selectedDate))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [allForecastData, selectedDate, forecast]);

  if (!isOpen || !forecast) return null;

  const getSuitabilityIcon = (suitability: string) => {
    switch (suitability) {
      case 'perfect': return <CheckCircle2 className="w-7 h-7 text-emerald-600" />;
      case 'good': return <Activity className="w-7 h-7 text-cyan-600" />;
      case 'challenging': return <AlertCircle className="w-7 h-7 text-amber-600" />;
      case 'dangerous': return <Ban className="w-7 h-7 text-rose-600" />;
      default: return <Zap className="w-7 h-7 text-cyan-600" />;
    }
  };

  const getWindTypeBadge = (type?: string) => {
    switch (type) {
      case 'offshore':
        return { label: 'Offshore (Aflandig)', class: 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold' };
      case 'side-offshore':
        return { label: 'Side-Offshore', class: 'bg-cyan-50 text-cyan-900 border-cyan-300 font-bold' };
      case 'cross-shore':
        return { label: 'Cross-shore', class: 'bg-blue-50 text-blue-900 border-blue-300 font-bold' };
      case 'side-onshore':
        return { label: 'Side-Onshore', class: 'bg-amber-50 text-amber-900 border-amber-300 font-bold' };
      case 'onshore':
        return { label: 'Onshore (Aanlandig)', class: 'bg-orange-50 text-orange-900 border-orange-300 font-bold' };
      default:
        return { label: type || 'Variabel', class: 'bg-slate-100 text-slate-800 border-slate-300 font-bold' };
    }
  };

  const calculateQuickScore = (data: ForecastData) => {
    let score = 5.0;
    if (data.waveHeight >= 0.7 && data.waveHeight <= 2.2) score += 2.0;
    else if (data.waveHeight >= 0.4 && data.waveHeight < 0.7) score += 1.0;
    else if (data.waveHeight < 0.3) score -= 2.5;
    else if (data.waveHeight > 2.5) score -= 1.0;

    if (data.swellPeriod >= 8) score += 1.5;
    else if (data.swellPeriod >= 6) score += 0.5;
    else if (data.swellPeriod <= 4) score -= 1.0;

    if (data.windType === 'offshore') score += 2.0;
    else if (data.windType === 'side-offshore') score += 1.0;
    else if (data.windType === 'side-onshore') score -= 0.5;
    else if (data.windType === 'onshore') {
      if (data.windSpeed > 16) score -= 2.0;
      else score -= 1.0;
    }

    const finalScore = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
    let label = 'Matig';
    let badgeClass = 'bg-amber-50 text-amber-900 border-amber-300 font-bold';
    let dotClass = 'bg-amber-500';
    if (finalScore >= 7.8) {
      label = 'Top';
      badgeClass = 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold';
      dotClass = 'bg-emerald-500';
    } else if (finalScore >= 6.0) {
      label = 'Goed';
      badgeClass = 'bg-cyan-50 text-cyan-900 border-cyan-300 font-bold';
      dotClass = 'bg-cyan-500';
    } else if (finalScore <= 3.8) {
      label = 'Kabbel / Flat';
      badgeClass = 'bg-slate-100 text-slate-800 border-slate-300 font-bold';
      dotClass = 'bg-slate-400';
    }

    return { score: finalScore, label, badgeClass, dotClass };
  };

  const selectedHourStr = format(selectedDate, 'HH:mm');
  const formattedDayStr = format(selectedDate, 'EEEE d MMMM yyyy', { locale: nl });
  const windCompass = getCompassInfo(forecast.windDirection);
  const swellCompass = getCompassInfo(forecast.swellDirection);
  const windBft = knotsToBeaufort(forecast.windSpeed);
  const windBadge = getWindTypeBadge(forecast.windType);
  const activeHourScore = calculateQuickScore(forecast);

  // Active sunscreen advice
  const sunscreen = forecast.sunscreenAdvice || calculateSunscreenAdvice(forecast.uvIndex || 0, forecast.isDaylight);

  const handleHourSelect = (item: ForecastData) => {
    if (onSelectForecastHour) {
      onSelectForecastHour(item);
    }
  };

  const handleTriggerAI = () => {
    if (onRequestAdvice) {
      onRequestAdvice(forecast);
      setActiveTab('ai');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md modal-backdrop"
        />
        
        {/* Modal Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-5xl h-[92dvh] sm:h-[90vh] flex flex-col overflow-hidden shadow-2xl relative border border-slate-200 z-10 text-slate-800"
        >
          {/* Header */}
          <div className="modal-header p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 shrink-0">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-[10px] font-mono tracking-widest uppercase text-cyan-800 font-bold">
                  Uur-voor-Uur Analyse
                </span>
                <span className="text-slate-300 text-xs">•</span>
                <span className="text-[11px] font-mono text-slate-700 uppercase tracking-wider font-bold truncate max-w-[200px] sm:max-w-none">
                  {spot.name}
                </span>
                {spot.type && (
                  <span className="text-[10px] font-mono text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-semibold">
                    {spot.type}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2.5">
                <h2 className="modal-title text-lg sm:text-2xl md:text-3xl font-black text-slate-900 capitalize tracking-tight font-tactical">
                  {formattedDayStr}
                </h2>
                <span className="text-cyan-700 font-mono font-bold text-base sm:text-lg">
                  {selectedHourStr}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {/* Tab Selector Buttons */}
              <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  onClick={() => setActiveTab('hourly')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer",
                    activeTab === 'hourly'
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200 font-black"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Uuroverzicht</span>
                  <span className="sm:hidden">Uur</span>
                </button>
                <button
                  onClick={() => setActiveTab('charts')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer",
                    activeTab === 'charts'
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200 font-black"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Grafieken</span>
                  <span className="sm:hidden">Grafiek</span>
                </button>
                <button
                  onClick={() => setActiveTab('ai')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer relative",
                    activeTab === 'ai'
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200 font-black"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">AI Coach</span>
                  <span className="sm:hidden">AI</span>
                  {loading && (
                    <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping absolute -top-0.5 -right-0.5" />
                  )}
                  {!loading && advice && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white absolute -top-0.5 -right-0.5" />
                  )}
                </button>
              </div>

              <button 
                onClick={onClose}
                className="modal-close-btn p-2 sm:p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700 hover:text-slate-900 border border-slate-200 cursor-pointer"
                title="Sluiten (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Hourly Scrubber Bar (Horizontal Timeline of the day) */}
          <div className="px-3 sm:px-6 py-2.5 bg-slate-50/90 border-b border-slate-200 overflow-x-auto shrink-0 scrollbar-thin">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1 mr-1">
                <Clock className="w-3 h-3 text-slate-400" /> Uren:
              </span>
              {dayHours.map((hourItem) => {
                const hourDate = parseISO(hourItem.timestamp);
                const hourFormatted = format(hourDate, 'HH:mm');
                const isSelected = hourItem.timestamp === forecast.timestamp;
                const quick = calculateQuickScore(hourItem);

                return (
                  <button
                    key={hourItem.timestamp}
                    onClick={() => handleHourSelect(hourItem)}
                    className={cn(
                      "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-mono transition-all flex items-center gap-1.5 border cursor-pointer shrink-0",
                      isSelected
                        ? "bg-slate-900 border-slate-900 text-white font-bold shadow-md scale-105"
                        : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 font-medium"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isSelected ? "bg-cyan-400" : quick.dotClass)} />
                    <span className="font-bold">{hourFormatted}</span>
                    <span className={cn("text-[10px]", isSelected ? "text-cyan-200" : "text-slate-400")}>{hourItem.waveHeight.toFixed(1)}m</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal Body Content */}
          <div className="modal-body p-4 sm:p-6 md:p-8 pb-14 sm:pb-10 space-y-6 overflow-y-auto flex-1 custom-scroll bg-white">
            
            {/* Active Selected Hour Telemetry Spotlight */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                    Live Telemetrie om <strong className="text-cyan-700 text-sm font-black">{selectedHourStr}</strong>
                  </span>
                  <span className={cn("text-[10px] font-mono px-2.5 py-0.5 rounded-full border shadow-2xs", activeHourScore.badgeClass)}>
                    Conditie: {activeHourScore.label} ({activeHourScore.score}/10)
                  </span>
                </div>

                {!advice && !loading && (
                  <button
                    onClick={handleTriggerAI}
                    className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-xs font-mono font-bold uppercase tracking-wider text-cyan-900 transition-all cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Vraag AI Coach Toelichting</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. SWELL & GOLVEN */}
                <div className="modal-subcard p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                    <span className="flex items-center gap-1.5 text-cyan-700 font-bold">
                      <Waves className="w-4 h-4" /> Swell & Golf
                    </span>
                    <span className="font-semibold">{swellCompass.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900">{forecast.waveHeight.toFixed(1)}</span>
                      <span className="text-xs font-mono text-slate-500 uppercase">meter</span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-600">
                      {forecast.swellPeriod}s periode • {forecast.swellDirection}°
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Power Index</span>
                    <span className="text-cyan-700 font-bold">{forecast.wavePower || Math.round(forecast.waveHeight * forecast.swellPeriod * 8)}/100</span>
                  </div>
                </div>

                {/* 2. WIND */}
                <div className="modal-subcard p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                    <span className="flex items-center gap-1.5 text-orange-700 font-bold">
                      <Wind className="w-4 h-4" /> Wind
                    </span>
                    <span className="font-semibold">{windCompass.label} ({forecast.windDirection}°)</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900">{Math.round(forecast.windSpeed)}</span>
                      <span className="text-xs font-mono text-slate-500 uppercase">knopen</span>
                      <span className="text-xs font-mono text-amber-800 font-bold ml-1">({windBft} Bft)</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <div 
                        className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 shrink-0 transition-transform duration-500"
                        style={{ transform: `rotate(${forecast.windDirection}deg)` }}
                      >
                        <Navigation className="w-2.5 h-2.5 fill-current text-cyan-600" />
                      </div>
                      <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", windBadge.class)}>
                        {windBadge.label}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Wind Kwaliteit</span>
                    <span className="text-emerald-700 font-bold">{forecast.windQuality || (forecast.windType === 'offshore' ? 95 : 60)}/100</span>
                  </div>
                </div>

                {/* 3. GETIJ & TEMPERATUREN */}
                <div className="modal-subcard p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                    <span className="flex items-center gap-1.5 text-blue-700 font-bold">
                      <Zap className="w-4 h-4" /> Getij & Water
                    </span>
                    <span className="font-semibold">{spot.isAtlantic ? 'Atlantisch' : 'Noordzee'}</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900">{forecast.tideHeight !== undefined ? forecast.tideHeight.toFixed(1) : '---'}</span>
                      <span className="text-xs font-mono text-slate-500 uppercase">meter</span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-600 flex items-center gap-2">
                      <span>Water: <strong className="text-slate-900">{forecast.waterTemp}°C</strong></span>
                      <span>•</span>
                      <span>Lucht: <strong className="text-slate-900">{forecast.airTemp}°C</strong></span>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Wetsuit Advies</span>
                    <span className="text-slate-900 font-bold">{forecast.waterTemp < 12 ? '5/4mm + boots' : forecast.waterTemp < 16 ? '4/3mm' : '3/2mm'}</span>
                  </div>
                </div>

                {/* 4. ZONKRACHT & ZONNEBRAND */}
                <div className="modal-subcard p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                    <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                      <Sun className="w-4 h-4" /> Zon & Zonnebrand
                    </span>
                    <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border", getUvPillClasses(sunscreen.level).badge)}>
                      UV {sunscreen.uvIndex}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      {sunscreen.shortAdvice}
                    </p>
                    <p className="text-[11px] text-slate-600 font-mono">
                      Aanbevolen: <strong className="text-amber-800 font-bold">{sunscreen.spfRecommendation}</strong>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Waterreflectie</span>
                    <span className="text-amber-800 font-bold">+30% blootstelling</span>
                  </div>
                </div>
              </div>

              {/* Muistromen / Risico waarschuwing indien aanwezig */}
              {forecast.currentRisk && forecast.currentRisk.level !== 'low' && (
                <div className={cn(
                  "p-3.5 sm:p-4 rounded-2xl border flex items-start gap-3",
                  forecast.currentRisk.level === 'high'
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                )}>
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                  <div className="text-xs leading-relaxed">
                    <strong className="font-bold block uppercase tracking-wider text-[11px]">Veiligheidsnotitie / Stroming:</strong>
                    <span>{forecast.currentRisk.description}</span>
                  </div>
                </div>
              )}

              {/* Kite Waarschuwing */}
              {(() => {
                const kiteAlert = getKiteAlert(spot, forecast);
                if (!kiteAlert.isZone || !kiteAlert.isFavorable) return null;

                return (
                  <div className={cn(
                    "p-3.5 sm:p-4 rounded-2xl border flex items-start gap-3",
                    kiteAlert.intensity === 'extreme'
                      ? "bg-rose-50 border-rose-200 text-rose-900"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  )}>
                    <Wind className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                    <div className="text-xs leading-relaxed space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="font-bold uppercase tracking-wider text-[11px] text-amber-900 flex items-center gap-1.5">
                          <span>🪁 Kite Waarschuwing</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 font-mono font-bold">
                            {kiteAlert.badgeLabel} • {kiteAlert.windKnots} kn / {kiteAlert.windBft} Bft
                          </span>
                        </strong>
                      </div>
                      <p className="text-slate-800 font-medium">
                        {kiteAlert.fullWarning}
                      </p>
                      <p className="text-[10px] font-mono text-slate-600 pt-0.5">
                        Geldt voor: {kiteAlert.zoneDescription}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* TAB CONTENT */}
            {activeTab === 'hourly' && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-cyan-700" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 font-tactical">
                      Uur-voor-Uur Matrix ({dayHours.length} uren)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Klik op een rij om dat tijdstip direct te selecteren
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono uppercase tracking-wider text-slate-600">
                          <th className="py-3 px-3 sm:px-4 font-bold">Tijd</th>
                          <th className="py-3 px-3 sm:px-4 font-bold">Golven & Swell</th>
                          <th className="py-3 px-3 sm:px-4 font-bold">Wind</th>
                          <th className="py-3 px-3 sm:px-4 font-bold hidden md:table-cell">Type</th>
                          <th className="py-3 px-3 sm:px-4 font-bold">Getij & Temp</th>
                          <th className="py-3 px-3 sm:px-4 font-bold hidden sm:table-cell">Zon / UV</th>
                          <th className="py-3 px-3 sm:px-4 font-bold text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dayHours.map((hourItem) => {
                          const hourDate = parseISO(hourItem.timestamp);
                          const hourStr = format(hourDate, 'HH:mm');
                          const isSelected = hourItem.timestamp === forecast.timestamp;
                          const quick = calculateQuickScore(hourItem);
                          const hWindCompass = getCompassInfo(hourItem.windDirection);
                          const hWindBft = knotsToBeaufort(hourItem.windSpeed);
                          const hWindBadge = getWindTypeBadge(hourItem.windType);
                          const hSunscreen = hourItem.sunscreenAdvice || calculateSunscreenAdvice(hourItem.uvIndex || 0, hourItem.isDaylight);

                          return (
                            <tr
                              key={hourItem.timestamp}
                              onClick={() => handleHourSelect(hourItem)}
                              className={cn(
                                "transition-colors cursor-pointer group",
                                isSelected
                                  ? "bg-cyan-50/80 font-medium"
                                  : "hover:bg-slate-50"
                              )}
                            >
                              {/* Tijd */}
                              <td className="py-3 px-3 sm:px-4 font-mono">
                                <div className="flex items-center gap-2">
                                  <span className={cn("w-2 h-2 rounded-full shrink-0", isSelected ? "bg-cyan-600 ring-2 ring-cyan-200" : quick.dotClass)} />
                                  <span className={cn("font-bold text-sm", isSelected ? "text-cyan-800" : "text-slate-900")}>
                                    {hourStr}
                                  </span>
                                </div>
                              </td>

                              {/* Golven */}
                              <td className="py-3 px-3 sm:px-4">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-bold text-slate-900 text-sm">{hourItem.waveHeight.toFixed(1)}m</span>
                                  <span className="text-[10px] font-mono text-slate-500">{hourItem.swellPeriod}s</span>
                                </div>
                              </td>

                              {/* Wind */}
                              <td className="py-3 px-3 sm:px-4">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                                    style={{ transform: `rotate(${hourItem.windDirection}deg)` }}
                                  >
                                    <Navigation className="w-2.5 h-2.5 fill-current text-cyan-600" />
                                  </div>
                                  <span className="font-bold text-slate-900">{Math.round(hourItem.windSpeed)} kn</span>
                                  <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">({hWindBft} Bft {hWindCompass.label})</span>
                                </div>
                              </td>

                              {/* Wind Type */}
                              <td className="py-3 px-3 sm:px-4 hidden md:table-cell">
                                <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded border", hWindBadge.class)}>
                                  {hWindBadge.label}
                                </span>
                              </td>

                              {/* Getij & Temp */}
                              <td className="py-3 px-3 sm:px-4 font-mono text-slate-600">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">{hourItem.tideHeight !== undefined ? `${hourItem.tideHeight.toFixed(1)}m` : '-'}</span>
                                  <span className="text-slate-300">•</span>
                                  <span>{hourItem.waterTemp}°C</span>
                                </div>
                              </td>

                              {/* UV */}
                              <td className="py-3 px-3 sm:px-4 hidden sm:table-cell">
                                {hSunscreen.uvIndex >= 1 ? (
                                  <span className="text-[10px] font-mono text-amber-800 font-bold flex items-center gap-1">
                                    <Sun className="w-3 h-3 text-amber-500" />
                                    UV {hSunscreen.uvIndex}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-400">-</span>
                                )}
                              </td>

                              {/* Score */}
                              <td className="py-3 px-3 sm:px-4 text-right font-mono">
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block", quick.badgeClass)}>
                                  {quick.score.toFixed(1)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CHARTS */}
            {activeTab === 'charts' && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-700" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 font-tactical">
                    Verloopgrafieken voor {formattedDayStr}
                  </h3>
                </div>
                <DetailedCharts forecast={allForecastData} selectedTimestamp={forecast.timestamp} />
              </div>
            )}

            {/* TAB / SECTION: AI COACH ANALYSE & SETUP MATCH (ON-DEMAND) */}
            <div className={cn(
              "space-y-4 pt-4 border-t border-slate-200",
              activeTab === 'ai' ? "block" : "block"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-cyan-700" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2 font-tactical">
                    <span>AI Surfcoach & Setup Match</span>
                    <span className="text-[10px] font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                      Optionele Toelichting
                    </span>
                  </h3>
                </div>

                {advice && !loading && (
                  <button
                    onClick={handleTriggerAI}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-mono font-bold uppercase tracking-wider text-slate-800 transition-all cursor-pointer shadow-2xs"
                    title="Herbereken AI advies"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-700" />
                    <span>Opnieuw genereren</span>
                  </button>
                )}
              </div>

              {/* If advice is currently generating -> Custom Wave Tube Loader */}
              {loading && (
                <div className="p-8 sm:p-12 rounded-3xl bg-slate-50 border border-cyan-200 flex flex-col items-center justify-center text-center shadow-xs">
                  <WaveTubeLoader 
                    size="lg" 
                    title="AI Coach berekent sessie-analyse..." 
                    subtitle={`Berekent boardmatch uit je ${user?.boards?.length || 0} surfboards, wetsuit-warmte en baïne-risico's voor ${selectedHourStr}.`}
                  />
                </div>
              )}

              {/* If advice has NOT yet been requested for this session */}
              {!loading && !advice && (
                <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-cyan-50/70 via-white to-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex items-center gap-2 text-cyan-800 text-xs font-mono font-bold uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Gepersonaliseerde Surfcoach Evaluatie</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed font-medium">
                      Wil je een uitgebreide AI-toelichting voor <strong>{selectedHourStr}</strong> afgestemd op jouw gewicht ({user?.weight || 75}kg), niveau ({user?.skillLevel || 'intermediate'}) en {user?.boards?.length || 0} surfboards in je setup?
                    </p>
                    <p className="text-[11px] text-slate-500">
                      De AI analyseert golfkracht, windkwaliteit, getijdenfase en selecteert het meest geschikte board uit je kast.
                    </p>
                  </div>

                  <button
                    onClick={handleTriggerAI}
                    className="shrink-0 self-start sm:self-center px-5 sm:px-6 py-3 rounded-2xl bg-slate-900 hover:bg-cyan-700 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-md flex items-center gap-2.5 transition-all transform hover:scale-[1.02] cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Genereer AI Advies</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* If advice IS loaded */}
              {!loading && advice && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="modal-subcard p-6 sm:p-8 rounded-3xl bg-slate-50 border border-slate-200 space-y-6 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="mt-0.5 shrink-0">{getSuitabilityIcon(advice.suitability || '')}</div>
                      <div>
                        <h4 className="text-base sm:text-xl font-black text-slate-900 capitalize leading-tight font-tactical">
                          {advice.title || "Sessie Analyse"}
                        </h4>
                        <p className="text-[10px] font-mono text-slate-600 uppercase mt-0.5 font-bold">
                          Voor {formattedDayStr} om {selectedHourStr}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-start sm:self-center">
                      <div className="px-3.5 py-1.5 bg-emerald-50 text-emerald-900 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-emerald-300">
                        Score: {advice.score}/10
                      </div>
                      <div className="px-3.5 py-1.5 bg-cyan-50 text-cyan-900 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-cyan-300">
                        Slagingskans: {advice.chanceOfSuccess}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-slate-800 text-sm sm:text-base leading-relaxed font-medium">
                      {advice.description}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

