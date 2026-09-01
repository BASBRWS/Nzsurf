import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Plus, 
  Check, 
  Trash2, 
  ChevronRight, 
  ShieldCheck, 
  Waves, 
  Scale, 
  Award,
  Sparkles,
  Zap
} from 'lucide-react';
import { UserProfile, Board, Wetsuit } from '../types';

interface TacticalProfileQuiverProps {
  user: UserProfile;
  onUpdate: (updatedUser: UserProfile) => void;
  onClose?: () => void;
}

export const TacticalProfileQuiver: React.FC<TacticalProfileQuiverProps> = ({
  user,
  onUpdate,
  onClose
}) => {
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState<number>(user.weight || 98);

  const handleSelectBoard = (id: string) => {
    onUpdate({ ...user, selectedBoardId: id });
  };

  const handleSkillChange = (level: any) => {
    onUpdate({ ...user, skillLevel: level });
  };

  const handleSaveWeight = () => {
    onUpdate({ ...user, weight: Number(weightInput) });
    setIsEditingWeight(false);
  };

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-800 select-none">
      {/* Profile Header Box in Light Glassmorphism */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[2rem] border border-slate-200/90 p-5 sm:p-7 shadow-[0_10px_35px_rgba(0,40,90,0.08)] space-y-6">
        
        {/* User Card with Avatar and Badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 shadow-md">
                <div className="w-full h-full rounded-2xl bg-white flex items-center justify-center text-cyan-600">
                  <User className="w-7 h-7" />
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-cyan-700 uppercase tracking-widest font-bold">
                  SURF PASPOORT
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-tactical uppercase tracking-tight text-slate-900">
                {user.displayName || 'Selmeen_205s'}
              </h2>
              <p className="text-xs font-mono text-slate-500">
                Lid sinds 2024 • Noordzee Surfer
              </p>
            </div>
          </div>

          <button 
            onClick={() => handleSkillChange(user.skillLevel === 'beginner' ? 'intermediate' : user.skillLevel === 'intermediate' ? 'advanced' : 'beginner')}
            className="px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-mono text-xs font-bold hover:bg-cyan-100 transition-all cursor-pointer"
          >
            Level: {user.skillLevel.toUpperCase()}
          </button>
        </div>

        {/* 2-Column Key Stats (Wave Score: Beginner | Weight: 98 KG) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Wave Score / Skill */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">
              WAVE SCORE
            </span>
            <div className="my-2">
              <span className="text-xl sm:text-2xl font-black font-tactical text-slate-900 uppercase">
                {user.skillLevel}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-700 font-medium">
              <span>Stabiliteit focus</span>
            </div>
          </div>

          {/* Weight in KG */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">
              WEIGHT
            </span>
            <div className="my-2 flex items-baseline gap-1">
              {isEditingWeight ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={weightInput}
                    onChange={(e) => setWeightInput(Number(e.target.value))}
                    className="w-16 bg-white border border-cyan-500 text-slate-900 font-tactical font-black text-xl rounded px-1.5 py-0.5"
                    autoFocus
                  />
                  <button onClick={handleSaveWeight} className="text-xs text-cyan-700 font-mono font-bold">OK</button>
                </div>
              ) : (
                <>
                  <span 
                    onClick={() => setIsEditingWeight(true)}
                    className="text-2xl sm:text-3xl font-black font-tactical text-slate-900 cursor-pointer hover:text-cyan-700"
                  >
                    {user.weight || 98}
                  </span>
                  <span className="text-xs font-mono text-slate-400 font-bold">KG</span>
                </>
              )}
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Min. aanbevolen volume: <strong className="text-cyan-700">75 - 90L</strong>
            </p>
          </div>
        </div>

        {/* Session tracker progress pills */}
        <div className="grid grid-cols-2 gap-3 bg-slate-100/70 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-mono text-slate-600 font-medium">Sessie Score</span>
            <span className="text-sm font-mono font-bold text-cyan-700">39%</span>
          </div>
          <div className="flex items-center justify-between px-2 border-l border-slate-300">
            <span className="text-xs font-mono text-slate-600 font-medium">Condition Fit</span>
            <span className="text-sm font-mono font-bold text-emerald-700">82 nor</span>
          </div>
        </div>

        {/* MIJN BOARDS (SETUP) - See All */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-cyan-600" />
              <h3 className="text-sm sm:text-base font-black font-tactical uppercase tracking-wider text-slate-900">
                MIJN BOARDS (SETUP)
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-700">See All</span>
          </div>

          {/* Boards List */}
          <div className="space-y-3">
            {/* Primary Board: Olaian 500 Softboard */}
            <div 
              onClick={() => handleSelectBoard('1')}
              className="bg-white hover:bg-slate-50 cursor-pointer rounded-2xl p-4 border-2 border-cyan-500 shadow-sm flex items-center justify-between gap-4 transition-all"
            >
              <div className="flex items-center gap-3.5">
                {/* Visual Surfboard Graphic */}
                <div className="w-12 h-20 bg-gradient-to-b from-cyan-400 to-teal-500 rounded-full border border-white flex flex-col items-center justify-between p-1.5 shadow-md shrink-0">
                  <div className="w-1.5 h-1.5 bg-black/30 rounded-full" />
                  <span className="text-[7px] font-mono font-black text-black -rotate-90">OLAIAN</span>
                  <div className="w-2 h-1 bg-black/30 rounded-sm" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base sm:text-lg font-black font-tactical uppercase text-slate-900">
                      Olaian 500 Softboard
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-mono text-[9px] font-bold">
                      ACTIEF
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-600 mt-0.5">
                    Volume: <strong className="text-slate-900">90 Lits</strong> • 68 CO2 • 4.8 lites
                  </p>
                  <p className="text-[10px] font-mono text-cyan-700 font-medium mt-1">
                    Ideaal voor Noordzee klotsbak condities & beginners
                  </p>
                </div>
              </div>

              <div className="w-7 h-7 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950 shadow-sm shrink-0">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
            </div>

            {/* Secondary Board: 65L Longboard / Fish */}
            <div 
              onClick={() => handleSelectBoard('2')}
              className="bg-slate-50 hover:bg-white cursor-pointer rounded-2xl p-4 border border-slate-200 flex items-center justify-between gap-4 transition-all opacity-80 hover:opacity-100"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-16 bg-gradient-to-b from-amber-400 to-orange-500 rounded-full border border-white flex items-center justify-center p-1 shrink-0 shadow-sm">
                  <span className="text-[7px] font-mono font-black text-white -rotate-90">FISH</span>
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black font-tactical uppercase text-slate-800">
                    Torq Mod Fish 6'6
                  </h4>
                  <p className="text-xs font-mono text-slate-500">
                    Volume: <strong className="text-slate-800">45 Liter</strong> • Epoxy
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-slate-400 font-bold">Selecteer</span>
            </div>
          </div>
        </div>

        {/* GEAR & WETSUITS */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-sm sm:text-base font-black font-tactical uppercase tracking-wider text-slate-900">
            WETSUIT & ACCESSOIRES
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-cyan-300 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">2/2mm Zomer Wetsuit</span>
                <span className="text-[10px] font-mono text-slate-500">Watertemp match 18°C</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-mono text-[9px] font-bold">
                GEKOZEN
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between opacity-80 hover:opacity-100 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-700 block">5/4mm Winter met Cap</span>
                <span className="text-[10px] font-mono text-slate-400">Watertemp 6-12°C</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-bold">Winter</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
