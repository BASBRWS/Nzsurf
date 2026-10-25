import React from 'react';
import { Waves, CalendarDays, MapPin, User, Plus } from 'lucide-react';

export type TacticalTab = 'forecast' | 'week' | 'weather' | 'spots' | 'window' | 'ai' | 'profile' | 'community';

interface TacticalBottomNavProps {
  activeTab: TacticalTab;
  onSelectTab: (tab: TacticalTab) => void;
  /** "Meld condities": spotrapport maken. */
  onReport?: () => void;
  showReport?: boolean;
}

// Vier vaste plekken. Weer, community, AI-coach en sessievenster zitten onder Ik (en de AI-coach
// ook op Vandaag); melden is een knop met tekst boven de balk.
const ITEMS: { id: TacticalTab; label: string; icon: React.ComponentType<{ className?: string }>; also?: TacticalTab[] }[] = [
  { id: 'forecast', label: 'Vandaag', icon: Waves, also: ['ai', 'window'] },
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'spots', label: 'Spots', icon: MapPin },
  { id: 'profile', label: 'Ik', icon: User, also: ['weather', 'community'] },
];

export const TacticalBottomNav: React.FC<TacticalBottomNavProps> = ({ activeTab, onSelectTab, onReport, showReport = true }) => (
  <>
    {showReport && onReport && (
      <button
        onClick={onReport}
        className="fixed right-4 z-50 flex items-center gap-2 min-h-[48px] px-5 rounded-full bg-slate-900 text-white text-[15px] font-semibold shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:bg-cyan-700 cursor-pointer"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        <Plus className="w-5 h-5" /> Meld condities
      </button>
    )}
    <nav aria-label="Hoofdmenu" className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md md:max-w-2xl mx-auto grid grid-cols-4 h-[68px]">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id || !!item.also?.includes(activeTab);
          return (
            <button key={item.id} onClick={() => onSelectTab(item.id)} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${active ? 'text-cyan-800' : 'text-slate-500 hover:text-slate-800'}`}>
              <span className={`grid place-items-center h-8 w-14 rounded-full ${active ? 'bg-cyan-100' : ''}`}><Icon className="w-5 h-5" /></span>
              <span className={`text-[13px] ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  </>
);
