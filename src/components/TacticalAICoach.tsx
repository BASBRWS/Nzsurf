import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  Send, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Waves, 
  Wind, 
  Compass, 
  ShieldAlert, 
  Activity,
  MessageSquare
} from 'lucide-react';
import { SurfSpot, ForecastData, UserProfile } from '../types';
import { getSurfAdvice } from '../services/geminiService';
import { WaveTubeLoader } from './WaveTubeLoader';

interface TacticalAICoachProps {
  spot: SurfSpot;
  currentForecast?: ForecastData | null;
  user: UserProfile;
  onOpenQuiver?: () => void;
}

export const TacticalAICoach: React.FC<TacticalAICoachProps> = ({
  spot,
  currentForecast,
  user,
  onOpenQuiver
}) => {
  const [customQuery, setCustomQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiAnalysisText, setAiAnalysisText] = useState<string>(
    "Als beginner van 98kg is je Olaian 500 8'6\" (90L) qua volume absoluut de juiste keuze om stabiel te blijven liggen. Echter de condities vandaag maken het je heel erg moeilijk. Met 1.4m golven, een korte periode van 5.3s en een dikke 25 knopen side-onshore wind is de Noordzee veranderd in een heftige klotsbak. Je grote 90L softtop vangt enorm veel wind tijdens het peddelen en de korte golfperiode geeft je nauwelijks hersteltijd na een wipe-out. Advies: wacht tot vanavond als de wind afneemt, of zoek beschutting achter het noordelijk havenhoofd."
  );

  const [aiScore, setAiScore] = useState<number>(3.5);
  const [chanceSuccess, setChanceSuccess] = useState<number>(20);
  const [chanceLabel, setChanceLabel] = useState<string>('LAAG (20%)');

  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentForecast) return;

    setIsLoading(true);
    try {
      const result = await getSurfAdvice(user, spot, currentForecast, []);
      if (result) {
        setAiScore(result.score || 3.5);
        setChanceSuccess(result.chanceOfSuccess || 25);
        setChanceLabel(result.chanceOfSuccess && result.chanceOfSuccess > 50 ? `GEMIDDELD (${result.chanceOfSuccess}%)` : `LAAG (${result.chanceOfSuccess || 20}%)`);
        setAiAnalysisText(result.description || result.title);
      }
    } catch (err) {
      console.error("AI Coach query failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-800 select-none">
      {/* Main AI Tactical Card in Light Glassmorphism */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[2rem] border border-slate-200/90 p-5 sm:p-7 shadow-[0_10px_35px_rgba(0,40,90,0.08)] space-y-6">
        
        {/* Top Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-[10px] font-mono tracking-[0.25em] uppercase font-bold">
            <Sparkles className="w-3 h-3 text-cyan-600" />
            <span>AI POWERED ANALYSIS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-tactical uppercase tracking-tight text-slate-900">
            Hour-By-Hour Analysis
          </h2>
          <p className="text-xs font-mono text-slate-500">
            Spot: <span className="text-cyan-700 font-bold">{spot.name}</span> • Rider: <span className="text-slate-900 font-bold">{user.skillLevel} (98kg)</span>
          </p>
        </div>

        {/* Tactical Metric 3-Pills Bar (Wave 4.3/10 | [AI] | Chance 37.7%) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white border border-slate-200/70 text-center shadow-xs">
            <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">WAVE SCORE</span>
            <span className="text-sm sm:text-base font-black font-tactical text-slate-900">4.3 / 10</span>
          </div>

          <div className="flex items-center justify-center p-2 rounded-xl bg-slate-900 text-white shadow-sm">
            <span className="text-xs sm:text-sm font-black font-tactical tracking-widest uppercase text-cyan-300">
              AI TACTICAL
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white border border-slate-200/70 text-center shadow-xs">
            <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">CHANCE</span>
            <span className="text-sm sm:text-base font-black font-tactical text-cyan-700">37.7%</span>
          </div>
        </div>

        {/* Dual-Arc Circular AI Gauge Card (Score: 3.5 / 10 | Chance of success: LAAG 20%) */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-6 rounded-2xl bg-slate-50/80 border border-slate-200">
          {/* Circular Score Gauge */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Background circle track */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="8"
              />
              {/* Foreground progress arc */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#0284C7"
                strokeWidth="8"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (251.2 * (aiScore / 10))}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-mono uppercase text-cyan-700 font-bold tracking-wider">SCORE</span>
              <span className="text-2xl sm:text-3xl font-black font-tactical text-slate-900 tracking-tight">
                {aiScore.toFixed(1)}
              </span>
              <span className="text-[9px] font-mono text-slate-400">/ 10</span>
            </div>
          </div>

          {/* Chance of Success Status Pill & Description */}
          <div className="space-y-2 text-center sm:text-left">
            <span className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-widest block">
              CHANCE OF SUCCESS
            </span>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-800 font-mono text-sm font-bold">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span>{chanceLabel}</span>
            </div>
            <p className="text-xs text-slate-600 max-w-xs">
              Moeilijke condities door onshore wind en rommelige deining.
            </p>
          </div>
        </div>

        {/* Detailed Dutch AI Tactical Coach Analysis Box */}
        {isLoading ? (
          <div className="p-8 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-xs">
            <WaveTubeLoader 
              size="md" 
              title="AI Coach berekent sessie-analyse..." 
              subtitle="Swell, getijden en boardmatch worden live gesimuleerd."
            />
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-white border border-slate-200 relative space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-cyan-700">
              <Brain className="w-4 h-4" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider">
                Noordzee AI Coach Synthese
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
              {aiAnalysisText}
            </p>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[10px] font-mono text-slate-400">
              <span>Model: Gemini 2.5 Pro Neural Marine</span>
              <button 
                onClick={handleAskAI} 
                disabled={isLoading}
                className="text-cyan-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Opnieuw analyseren</span>
              </button>
            </div>
          </div>
        )}

        {/* Interactive Custom Question to AI Coach */}
        <form onSubmit={handleAskAI} className="flex gap-2">
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Vraag de AI coach (bijv. 'Kan ik beter naar Domburg gaan?')..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors font-sans shadow-xs"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2.5 bg-slate-900 hover:bg-cyan-600 text-white font-bold font-tactical rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-xs">VRAAG</span>
          </button>
        </form>

      </div>
    </div>
  );
};
