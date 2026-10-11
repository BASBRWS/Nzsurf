import React from 'react';
import { CalendarPlus, ChevronRight } from 'lucide-react';
import { ForecastData, SurfSpot } from '../../types';
import { cn } from '../../lib/utils';
import { findWindows, chanceLevel, rawLine, windowLabel } from '../../utils/surfMoments';
import { buildWindowCalendarUrl, openExternalUrl } from '../../utils/calendarUtils';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface BestMomentsProps {
  spot: SurfSpot;
  forecast: ForecastData[];
  onSelectHour: (f: ForecastData) => void;
}

/**
 * Suggestie: de drie beste surfvensters van de komende dagen, mét de cijfers,
 * zodat je zelf kunt beoordelen of het bij jou past.
 */
export function BestMoments({ spot, forecast, onSelectHour }: BestMomentsProps) {
  const now = new Date();
  const windows = findWindows(spot, forecast, now, 45).slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Beste momenten (suggestie)</h3>
        <p className="text-[11px] font-mono text-slate-500">Op basis van de kans; check de cijfers en oordeel zelf.</p>
      </div>
      {windows.length === 0 ? (
        <p className="text-sm text-slate-600">Geen redelijke surfmomenten (≥45%) in de verwachting voor {spot.name}. Kijk in de tabel hierboven of bij andere spots.</p>
      ) : (
        <ul className="space-y-2">
          {windows.map(w => {
            const lvl = chanceLevel(w.peakChance);
            const details = `${windowLabel(w, now)} · ${lvl.label} (${w.peakChance}%)\n${rawLine(w.peak)}`;
            return (
              <li key={w.start.toISOString()} className={cn('rounded-xl border p-3', lvl.cls)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900">{cap(windowLabel(w, now))}</div>
                    <div className="text-[11px] font-mono text-slate-700 mt-0.5">{rawLine(w.peak)}</div>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono font-black bg-white/80 px-2 py-0.5 rounded-full border border-current/20">
                    {lvl.label} {w.peakChance}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onSelectHour(w.peak)}
                    className="text-[11px] font-bold text-cyan-800 flex items-center gap-0.5 cursor-pointer"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => openExternalUrl(buildWindowCalendarUrl(spot, w.start, w.end, details))}
                    className="text-[11px] font-bold text-slate-700 flex items-center gap-1 ml-auto cursor-pointer"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" /> Zet in agenda
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
