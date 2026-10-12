import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '../lib/utils';
import { degreesToCompass16 } from '../utils/spotKnowledge';
import {
  AuditForecastDoc, AuditObsDoc, AuditParam, DaySources, MIN_N, PARAMS,
  dayGrid, daySlots, periodWinners,
} from '../utils/forecastAudit';

/**
 * Weekoverzicht van de voorspellingsaudit: per tijdstip wat elke voorspeller
 * verwachtte, wat er gemeten is en wie het dichtst bij zat. Daaronder de uitslag
 * van de afgelopen 7 dagen. Toekomstige dagen tonen alleen de verwachtingen.
 */

const fmtDay = (d: Date) => d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

function fmtValue(param: AuditParam, v: number | undefined): string {
  if (v === undefined) return '—';
  if (param === 'dir' || param === 'windDir') return degreesToCompass16(v);
  if (param === 'windKn') return String(Math.round(v));
  return v.toFixed(1).replace('.', ',');
}

/** Afwijking: wind en richtingen in hele getallen, de rest met twee decimalen. */
function fmtErr(param: AuditParam, v: number): string {
  const whole = param === 'windKn' || param === 'dir' || param === 'windDir';
  return v.toFixed(whole ? 0 : 2).replace('.', ',') + (param === 'dir' || param === 'windDir' ? '°' : '');
}

export function AuditWeekView({ forecasts, observations, sources, param }: {
  forecasts: AuditForecastDoc[];
  observations: AuditObsDoc[];
  sources: DaySources[];
  param: AuditParam;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const now = Date.now();
  const prm = PARAMS.find(p => p.key === param)!;
  const day = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);

  const grid = useMemo(
    () => dayGrid(forecasts, observations, sources, daySlots(day), param, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, observations, sources, day, param],
  );
  const shownRows = grid.rows.filter(r => r.values.some(v => v !== undefined));
  const week = useMemo(
    () => periodWinners(forecasts, observations, sources, now - 7 * 864e5, now, param, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, observations, sources, param],
  );
  const hasObs = grid.observed.some(v => v !== undefined);

  return (
    <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
      <div>
        <div className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-cyan-600" /> Weekoverzicht: wat voorspelde wie? ({prm.label}, {prm.unit})
        </div>
        <p className="text-[11px] text-slate-600 mt-1">
          Per tijdstip de laatste verwachting die elke voorspeller vóór dat moment gaf, naast de meting van Rijkswaterstaat.
          <span className="font-bold text-emerald-700"> Groen</span> = zat het dichtst bij. Toekomstige tijdstippen tonen alleen wat iedereen verwacht.
          Kies het onderdeel (golfhoogte, wind, …) bij de filters.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDayOffset(o => Math.max(-6, o - 1))} disabled={dayOffset <= -6}
          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 cursor-pointer" aria-label="Vorige dag">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-bold text-slate-900">
          {fmtDay(day)}{dayOffset === 0 ? ' (vandaag)' : dayOffset === -1 ? ' (gisteren)' : dayOffset === 1 ? ' (morgen)' : ''}
        </div>
        <button onClick={() => setDayOffset(o => Math.min(6, o + 1))} disabled={dayOffset >= 6}
          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 cursor-pointer" aria-label="Volgende dag">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {shownRows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 pr-2 sticky left-0 bg-white">Bron</th>
                {grid.slots.map(t => <th key={t} className="text-right px-1.5">{fmtTime(t)}</th>)}
                {hasObs && <th className="text-right pl-2" title="Gemiddelde afwijking op deze dag">Afw.</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-900">
                <td className="py-1 pr-2 sticky left-0 bg-slate-50">Gemeten (RWS)</td>
                {grid.observed.map((v, i) => <td key={i} className="text-right px-1.5">{fmtValue(param, v)}</td>)}
                {hasObs && <td />}
              </tr>
              {shownRows.map(r => (
                <tr key={r.source} className={cn('border-b border-slate-100', r.kind === 'nzsurf' && 'bg-cyan-50 font-bold')}>
                  <td className={cn('py-1 pr-2 sticky left-0 whitespace-nowrap', r.kind === 'nzsurf' ? 'bg-cyan-50' : 'bg-white')}>{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={cn('text-right px-1.5', grid.best[i].includes(r.source) && 'text-emerald-700 font-black bg-emerald-50')}>
                      {fmtValue(param, v)}
                    </td>
                  ))}
                  {hasObs && <td className="text-right pl-2 text-slate-600">{r.mae !== undefined ? fmtErr(param, r.mae) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Geen verwachtingen voor deze dag. De audit verzamelt sinds 11 oktober; elke ochtend komt er een week vooruit bij.</p>
      )}

      <div>
        <div className="text-xs font-black uppercase text-slate-900 mb-1">Uitslag afgelopen 7 dagen</div>
        {week.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1 pr-2">#</th><th className="pr-2">Bron</th>
                <th className="pr-2 text-right" title="Aantal tijdstippen waarop deze bron het dichtst bij de meting zat">Keer dichtstbij</th>
                <th className="pr-2 text-right">Gem. afwijking ({prm.unit})</th><th className="text-right">n</th>
              </tr></thead>
              <tbody>
                {week.map((w, i) => (
                  <tr key={w.source} className={cn('border-b border-slate-100', w.kind === 'nzsurf' && 'bg-cyan-50 font-bold', w.n < MIN_N && 'text-slate-400')}>
                    <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{w.label}</td>
                    <td className="pr-2 text-right">{w.wins}</td>
                    <td className="pr-2 text-right">{fmtErr(param, w.mae)}</td>
                    <td className="text-right">{w.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-1">Grijs = minder dan {MIN_N} vergelijkingen; nog geen betrouwbare uitslag.</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Nog geen tijdstippen met zowel verwachtingen als metingen.</p>
        )}
      </div>
    </div>
  );
}
