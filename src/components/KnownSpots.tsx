import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Check, MapPin, Plus } from 'lucide-react';
import { SPOT_CATALOG, SPOT_REGIONS, spotPagePath } from '../data/spotCatalog';
import { cn } from '../lib/utils';

interface KnownSpotsProps {
  savedIds: Set<string>;
  selectedSpotId: string;
  onAdd: (id: string) => void;
  onSelect: (id: string) => void;
}

/**
 * Bekende Nederlandse surfspots die een gebruiker kan overnemen. Ze staan niet
 * standaard in het profiel; "Toevoegen" zet ze bij de eigen spots.
 */
export function KnownSpots({ savedIds, selectedSpotId, onAdd, onSelect }: KnownSpotsProps) {
  const showPageLinks = !Capacitor.isNativePlatform(); // de pagina's staan op de website
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-black font-tactical uppercase tracking-wider text-slate-900">Bekende surfspots</h3>
        <p className="text-xs text-slate-500 mt-0.5">Voeg spots toe die je zelf surft. Ze komen dan in je spotkeuze bovenaan.</p>
      </div>
      {SPOT_REGIONS.map(region => (
        <div key={region} className="space-y-1.5">
          <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400">{region}</h4>
          <ul className="divide-y divide-slate-100">
            {SPOT_CATALOG.filter(s => s.region === region).map(s => {
              const saved = savedIds.has(s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                  <button
                    onClick={() => (saved ? onSelect(s.id) : onAdd(s.id))}
                    className={cn('flex items-center gap-1.5 text-sm text-left cursor-pointer min-w-0',
                      s.id === selectedSpotId ? 'font-bold text-cyan-700' : 'text-slate-800')}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {showPageLinks && (
                      <a href={spotPagePath(s)} className="text-[11px] text-slate-500 underline hover:text-cyan-700">verwachting</a>
                    )}
                    {saved ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <Check className="w-3.5 h-3.5" /> In je spots
                      </span>
                    ) : (
                      <button
                        onClick={() => onAdd(s.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-900 text-white hover:bg-cyan-600 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Toevoegen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
