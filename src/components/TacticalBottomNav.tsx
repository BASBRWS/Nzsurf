import React from 'react';
import { motion } from 'motion/react';
import { 
  Waves, 
  Wind, 
  MapPin, 
  Compass, 
  User, 
  Plus, 
  Sparkles, 
  Clock, 
  Radio, 
  Activity,
  Layers,
  MessageSquare
} from 'lucide-react';

export type TacticalTab = 'forecast' | 'weather' | 'spots' | 'window' | 'ai' | 'profile' | 'community';

interface TacticalBottomNavProps {
  activeTab: TacticalTab;
  onSelectTab: (tab: TacticalTab) => void;
  onQuickAction?: () => void;
}

export const TacticalBottomNav: React.FC<TacticalBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onQuickAction
}) => {
  const navItems: { id: TacticalTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'forecast', label: 'SWELL', icon: Waves },
    { id: 'weather', label: 'WEER', icon: Wind },
    { id: 'spots', label: 'SPOTS', icon: Compass },
    { id: 'community', label: 'SOCIAL', icon: MessageSquare },
    { id: 'window', label: 'VENSTER', icon: Clock },
    { id: 'ai', label: 'AI COACH', icon: Sparkles },
    { id: 'profile', label: 'ME', icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto select-none">
      {/* Light frosted glass container with glowing border accent */}
      <div className="max-w-md md:max-w-2xl mx-auto px-3 pb-3 sm:pb-5 pt-2">
        <div className="relative bg-white/90 backdrop-blur-2xl border border-slate-200/90 rounded-full shadow-[0_12px_40px_rgba(0,30,80,0.12)] px-2 py-2 flex items-center justify-around">
          
          {navItems.slice(0, 3).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`
                  relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-200 cursor-pointer
                  ${isActive ? 'text-cyan-700 font-bold' : 'text-slate-500 hover:text-slate-800'}
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavPillLight"
                    className="absolute inset-0 bg-cyan-50 rounded-full border border-cyan-200 shadow-xs"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5 relative z-10" />
                <span className="text-[9px] font-mono tracking-wider mt-0.5 relative z-10 font-bold">
                  {item.label}
                </span>
                {item.id === 'spots' && (
                  <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-cyan-500 rounded-full animate-ping pointer-events-none" />
                )}
              </button>
            );
          })}

          {/* Central Floating Glowing (+) Reconnaissance Action Button */}
          <div className="relative -mt-6">
            <button
              onClick={onQuickAction}
              className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.25)] hover:bg-cyan-600 active:scale-95 transition-all ring-4 ring-white cursor-pointer"
              title="Snel Advies of Spot Scan"
            >
              <Plus className="w-6 h-6 stroke-[3] text-cyan-300" />
            </button>
          </div>

          {navItems.slice(3).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`
                  relative flex flex-col items-center justify-center py-1.5 px-3 rounded-full transition-all duration-200 cursor-pointer
                  ${isActive ? 'text-cyan-700 font-bold' : 'text-slate-500 hover:text-slate-800'}
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavPillLight"
                    className="absolute inset-0 bg-cyan-50 rounded-full border border-cyan-200 shadow-xs"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5 relative z-10" />
                <span className="text-[9px] font-mono tracking-wider mt-0.5 relative z-10 font-bold">
                  {item.label}
                </span>
              </button>
            );
          })}

        </div>
      </div>
    </nav>
  );
};
