import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Clock, 
  Sparkles, 
  ChevronRight, 
  CheckCircle2, 
  Flame, 
  Compass, 
  Waves, 
  Sliders, 
  ShieldCheck, 
  Info,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { SurfSpot, ForecastData, UserProfile } from '../types';

interface TacticalSessionWindowProps {
  spot: SurfSpot;
  currentForecast?: ForecastData | null;
  user?: UserProfile;
  onOpenAICoach?: () => void;
  onOpenQuiver?: () => void;
}

export const TacticalSessionWindow: React.FC<TacticalSessionWindowProps> = ({
  spot,
  currentForecast,
  user,
  onOpenAICoach,
  onOpenQuiver
}) => {
  const [startTime, setStartTime] = useState<string>('11:00');
  const [endTime, setEndTime] = useState<string>('14:00');
  const [matchScore, setMatchScore] = useState<number>(68);

  const activeBoard = user?.boards?.find(b => b.id === user.selectedBoardId) || {
    name: 'Olaian 500 Softboard',
    volume: 90,
    length: "8'6",
    type: 'softtop'
  };

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-800 select-none">
      {/* Best Session Window Main Hero Header in Light Glassmorphism */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[2rem] border border-slate-200/90 p-5 sm:p-7 shadow-[0_10px_35px_rgba(0,40,90,0.08)] space-y-6">
        
        {/* Title and Time Window Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-cyan-600 font-bold">
                OPTIMAL SESSION WINDOW
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-tactical uppercase tracking-tight text-slate-900 mt-1">
              Beste Sessie Venster
            </h2>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-mono text-sm font-bold mt-2">
              <Clock className="w-3.5 h-3.5 text-cyan-600" />
              <span>{startTime} - {endTime}</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block font-bold">Flits / Getijde</span>
            <span className="text-xs font-mono font-bold text-slate-700">Flits 09:06</span>
            <span className="text-[10px] font-mono text-cyan-600 font-bold block">HW 14:00</span>
          </div>
        </div>

        {/* Time Slider & Timeline Scrubber Bar */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 font-medium">
            <span>08:00</span>
            <span className="text-cyan-700 font-bold">VENSTER: 11:00 - 14:00</span>
            <span>18:00</span>
          </div>

          {/* Interactive Range Track */}
          <div className="relative h-7 bg-slate-100 rounded-full p-1 border border-slate-200 flex items-center">
            {/* Active window highlighted segment */}
            <div 
              className="absolute left-[30%] right-[35%] h-5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full flex items-center justify-between px-2 shadow-sm"
            >
              <div className="w-3 h-3 bg-white rounded-full shadow-md" />
              <span className="text-[9px] font-mono font-black text-slate-950">BEST MATCH</span>
              <div className="w-3 h-3 bg-white rounded-full shadow-md" />
            </div>
          </div>
        </div>

        {/* 68% MATCH Progress Gauge & Active Setup Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 p-4 sm:p-5">
          {/* Match Score Circular Pill */}
          <div className="flex sm:flex-col items-center justify-center gap-3 sm:gap-1 text-center sm:border-r border-slate-200 sm:pr-4">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center rounded-full border-4 border-cyan-500 bg-white shadow-md">
              <span className="text-xl sm:text-2xl font-black font-tactical text-slate-900">
                {matchScore}%
              </span>
              <span className="text-[9px] font-mono font-bold text-cyan-600 uppercase">
                MATCH
              </span>
            </div>
            <div className="text-left sm:text-center">
              <span className="text-xs font-bold uppercase tracking-wider block text-slate-900">
                Geschikt voor jou
              </span>
              <span className="text-[10px] font-mono text-slate-500">Beginner (98kg)</span>
            </div>
          </div>

          {/* Active Board details */}
          <div className="sm:col-span-2 flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-600 font-bold">
                  GEKOZEN BOARD
                </span>
                <h4 className="text-base sm:text-lg font-black font-tactical text-slate-900 uppercase">
                  {activeBoard.name}
                </h4>
                <p className="text-xs font-mono text-slate-600">
                  Volume: <strong className="text-slate-900">{activeBoard.volume} Liter</strong> • Lengte: <strong className="text-slate-900">{activeBoard.length}</strong>
                </p>
              </div>
              <button 
                onClick={onOpenQuiver}
                className="text-[10px] font-mono text-cyan-600 font-bold hover:underline cursor-pointer"
              >
                Wissel
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold">
                ✓ Stabiel voor 98kg
              </span>
              <span className="px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-orange-800 font-mono text-[10px] font-bold">
                ! Vangt veel wind
              </span>
            </div>
          </div>
        </div>

        {/* GEAR RECOMMENDATION Card (30% progress bar, 2/2mm Wetsuit match 18°C) */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-600" />
              <h4 className="text-sm font-bold uppercase font-tactical tracking-wider text-slate-900">
                GEAR RECOMMENDATION
              </h4>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-700">30% Advies Fit</span>
          </div>

          <p className="text-xs text-slate-600">
            Kommen beste samenstandure venster op basis van watertemperatuur en windchill.
          </p>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="w-[30%] h-full bg-cyan-500 rounded-full shadow-sm" />
          </div>

          {/* Wetsuit & Volume Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 shrink-0">
                <span className="text-xs font-mono font-bold">2/2</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Wetsuit: 2/2mm</p>
                <p className="text-[10px] font-mono text-slate-500">Watertemp match 18°C</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                <span className="text-xs font-mono font-bold">90L</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Volume: 90 Liter</p>
                <p className="text-[10px] font-mono text-slate-500">Drijfvermogen match</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA to Open AI Tactical Coach */}
        {onOpenAICoach && (
          <button
            onClick={onOpenAICoach}
            className="w-full py-3.5 bg-slate-900 hover:bg-cyan-600 text-white font-black font-tactical uppercase tracking-wider text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <span>BEKIJK AI TACTISCHE ANALYSE</span>
            <ChevronRight className="w-4 h-4 text-cyan-300" />
          </button>
        )}
      </div>
    </div>
  );
};
