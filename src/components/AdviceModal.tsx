import React from 'react';
import { SurfAdvice, ForecastData, SurfSpot } from '../types';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { X, CheckCircle2, AlertCircle, Ban, Activity, Wind, Waves, Zap } from 'lucide-react';
import { DetailedCharts } from './DetailedCharts';
import { Tooltip, TooltipIcon } from './ui/Tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface AdviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  advice: SurfAdvice | null;
  forecast: ForecastData | null;
  allForecastData: ForecastData[];
  loading: boolean;
  spot: SurfSpot;
}

export function AdviceModal({ isOpen, onClose, advice, forecast, allForecastData, loading, spot }: AdviceModalProps) {
  if (!isOpen || !forecast) return null;

  const getSuitabilityIcon = (suitability: string) => {
    switch (suitability) {
      case 'perfect': return <CheckCircle2 className="w-8 h-8 text-emerald-400" />;
      case 'good': return <Activity className="w-8 h-8 text-accent" />;
      case 'challenging': return <AlertCircle className="w-8 h-8 text-amber-400" />;
      case 'dangerous': return <Ban className="w-8 h-8 text-red-400" />;
      default: return <Zap className="w-8 h-8 text-accent" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-marine-950/80 backdrop-blur-sm modal-backdrop"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="glass-dark modal-dialog rounded-[3rem] w-full max-w-[650px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative border border-white/10"
        >
          <div className="modal-header p-6 md:p-10 border-b border-white/5 flex justify-between items-start bg-white/5">
            <div className="space-y-2 md:space-y-4">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-mono tracking-widest uppercase text-accent">Sessie Analyse</p>
                <div className="h-4 w-px bg-white/10" />
                <p className="text-[10px] font-mono tracking-widest uppercase text-white/30">{spot.name}</p>
              </div>
              <div>
                <h2 className="modal-title text-xl sm:text-4xl font-black italic text-white leading-tight uppercase">
                  {loading ? "Analyseren..." : advice?.title || "Sessie Analyse"}
                </h2>
                <p className="text-[9px] sm:text-[10px] font-mono text-white/30 uppercase mt-1 sm:mt-2">
                  {format(parseISO(forecast.timestamp), 'EEEE d MMMM HH:mm', { locale: nl })}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="modal-close-btn p-3 glass rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
              title="Sluiten"
            >
              <X className="w-6 h-6 text-white/50" />
            </button>
          </div>

          <div className="modal-body p-6 sm:p-8 md:p-10 space-y-8 md:space-y-10 overflow-y-auto flex-1 custom-scroll">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-accent animate-pulse">Data synchroniseren...</p>
              </div>
            ) : (
              <>
                <div className="modal-subcard flex items-start gap-6 sm:gap-8 p-6 sm:p-8 rounded-[2rem] glass border border-white/5">
                  <div className="mt-1 shrink-0">{getSuitabilityIcon(advice?.suitability || '')}</div>
                  <div className="space-y-4">
                    <p className="text-sand-50/80 text-base leading-relaxed font-medium">{advice?.description}</p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="px-4 py-1.5 bg-accent/10 text-accent rounded-full text-[10px] font-mono uppercase tracking-wider">
                          Power: {advice?.score}/10
                        </div>
                        {forecast?.currentRisk && forecast.currentRisk.level !== 'low' && (
                          <Tooltip content={forecast.currentRisk.description}>
                            <button className={cn(
                              "p-1.5 rounded-full flex items-center justify-center transition-colors cursor-help",
                              forecast.currentRisk.level === 'high' ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                            )}>
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                      <div className="px-4 py-1.5 bg-marine-500/10 text-marine-500 rounded-full text-[10px] font-mono uppercase tracking-wider">
                        Kans: {advice?.chanceOfSuccess}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div className="modal-subcard p-6 rounded-3xl glass border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-white/30">
                      <Waves className="w-4 h-4 text-accent" /> Swell
                    </div>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-white">{forecast.waveHeight}m</p>
                      <p className="text-[10px] font-mono text-white/20 uppercase">{forecast.swellPeriod}s • {forecast.swellDirection}°</p>
                    </div>
                  </div>
                  <div className="modal-subcard p-6 rounded-3xl glass border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-white/30">
                      <Wind className="w-4 h-4 text-accent" /> Wind
                    </div>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-white">{forecast.windSpeed} KN</p>
                      <p className="text-[10px] font-mono text-white/20 uppercase">{forecast.windDirection}°</p>
                    </div>
                  </div>
                  <div className="modal-subcard p-6 rounded-3xl glass border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-white/30">
                      <Zap className="w-4 h-4 text-accent" /> Getij
                    </div>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-white">{forecast.tideHeight}m</p>
                      <p className="text-[10px] font-mono text-white/20 uppercase">{forecast.waterTemp}°C</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-white/10" />
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Gedetailleerde Grafieken</p>
                  </div>
                  <DetailedCharts forecast={allForecastData} selectedTimestamp={forecast.timestamp} />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
