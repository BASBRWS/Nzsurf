import React from 'react';
import { Plus } from 'lucide-react';

export type TacticalTab = 'forecast' | 'week' | 'weather' | 'spots' | 'map' | 'window' | 'ai' | 'profile' | 'community';

interface TacticalBottomNavProps {
  activeTab: TacticalTab;
  onSelectTab: (tab: TacticalTab) => void;
  /** "Meld condities": spotrapport maken. */
  onReport?: () => void;
  showReport?: boolean;
}

// Vier vaste plekken. Weer, community, AI-coach en sessievenster zitten onder Ik (en de AI-coach
// ook op Vandaag); melden is een knop met tekst boven de balk.
const ITEMS: { id: TacticalTab; label: string; also?: TacticalTab[] }[] = [
  { id: 'forecast', label: 'Vandaag', also: ['ai', 'window'] },
  { id: 'week', label: 'Week' },
  { id: 'spots', label: 'Kust', also: ['map'] },
  { id: 'profile', label: 'Ik', also: ['weather', 'community'] },
];

export const TacticalBottomNav: React.FC<TacticalBottomNavProps> = ({ activeTab, onSelectTab, onReport, showReport = true }) => (
  <>
    {showReport && onReport && (
      <button
        onClick={onReport}
        className="fixed right-4 z-50 flex items-center gap-2 min-h-[48px] px-5 rounded-full text-[15px] font-semibold shadow-[0_10px_28px_-10px_rgba(18,41,43,0.6)] cursor-pointer"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))', background: 'var(--tide-ink)', color: 'var(--tide-sand)' }}
      >
        <Plus className="w-5 h-5" /> Meld condities
      </button>
    )}
    <nav aria-label="Hoofdmenu" className="fixed bottom-0 left-0 right-0 z-50 border-t select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'var(--tide-sand)', borderColor: 'var(--tide-line)' }}>
      <div className="max-w-md md:max-w-2xl mx-auto grid grid-cols-4 h-[68px]">
        {ITEMS.map(item => {
          const active = activeTab === item.id || !!item.also?.includes(activeTab);
          return (
            <button key={item.id} onClick={() => onSelectTab(item.id)} aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              style={{ color: active ? 'var(--tide-ink)' : '#6b8082' }}>
              <span className={`text-[16px] ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--tide-sun)' : 'transparent' }} />
            </button>
          );
        })}
      </div>
    </nav>
  </>
);
