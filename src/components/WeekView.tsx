import React, { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { LayoutGrid, List, Info } from 'lucide-react';
import type { ForecastData, SurfSpot, UserProfile } from '../types';
import { CompactDailyForecast } from './CompactDailyForecast';
import { ForecastGrid } from './ForecastGrid';
import { planDays, sizeWord, useChances } from './home/AnswerCard';
import { windTypeNl } from '../utils/surfMoments';
import { degreesToCompass16 } from '../utils/spotKnowledge';
import { cn } from '../lib/utils';

/**
 * Week: per dag in één oogopslag wanneer het werkt (5 dagdelen), de beste uren en één
 * percentage. De volledige dagkaarten en tabel staan eronder voor wie de cijfers wil.
 */

const PARTS = [[6, 9, 'vroeg'], [9, 12, 'ochtend'], [12, 15, 'middag'], [15, 18, 'namiddag'], [18, 21, 'avond']] as const;
const cellCls = (c?: number) => (c === undefined ? 'bg-slate-100' : c >= 70 ? 'bg-emerald-500' : c >= 45 ? 'bg-emerald-200' : c >= 20 ? 'bg-amber-200' : 'bg-slate-200');
const scoreCls = (c: number) => (c >= 70 ? 'text-emerald-700' : c >= 45 ? 'text-emerald-700' : c >= 20 ? 'text-amber-700' : 'text-slate-500');
const word = (c: number) => (c >= 70 ? 'goed' : c >= 45 ? 'redelijk' : c >= 20 ? 'matig' : 'werkt niet');

interface Props {
  spot: SurfSpot;
  forecasts: ForecastData[];
  user: UserProfile;
  isLoggedIn: boolean;
  onSelectHour?: (f: ForecastData) => void;
  onOpenProfile?: () => void;
}

export const WeekView: React.FC<Props> = ({ spot, forecasts, user, isLoggedIn, onSelectHour, onOpenProfile }) => {
  const canPersonal = isLoggedIn && (user.boards?.length ?? 0) > 0;
  const [mode, setMode] = useState<'personal' | 'general'>(canPersonal ? 'personal' : 'general');
  const personal = canPersonal && mode === 'personal';
  const { chance, board, generic } = useChances(spot, forecasts, user, personal);
  const plans = useMemo(() => planDays(forecasts, chance, board, generic, new Date(), 7), [forecasts, chance, board, generic]);
  const [detail, setDetail] = useState<'cards' | 'grid'>('cards');
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const openDay = (d: Date) => {
    setFocusDay(format(d, 'yyyy-MM-dd'));
    setDetail('cards');
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-sans normal-case not-italic tracking-normal text-[22px] font-extrabold">Week · {spot.name}</h2>
          <p className="text-[14px] text-slate-600">Wanneer werkt het? Tik een dag voor de details.</p>
        </div>
      </div>

      {canPersonal ? (
        <div role="tablist" aria-label="Soort kans" className="grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1">
          {(['personal', 'general'] as const).map(m => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cn('min-h-[44px] rounded-xl text-[15px] font-semibold cursor-pointer', mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600')}>
              {m === 'personal' ? 'Voor jou' : 'Algemeen'}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-slate-600">Algemene kans. {isLoggedIn ? <button onClick={onOpenProfile} className="underline text-cyan-800 cursor-pointer">Voeg je boards toe</button> : 'Log in'} voor advies op maat.</p>
      )}

      <div className="rounded-3xl bg-white border border-slate-200 divide-y divide-slate-100">
        {plans.map((p, i) => {
          const f = p.peak;
          const label = i === 0 ? 'Vandaag' : format(p.day, 'EEEEEE', { locale: nl });
          const meta = !f ? 'geen daglichturen meer'
            : p.peakChance >= 45 ? `${format(p.start!, 'HH')}–${format(p.end!, 'HH')} u · ${((f.spotWaveHeight ?? f.waveHeight)).toFixed(1).replace('.', ',')} m · ${Math.round(f.swellPeriod)} s · ${degreesToCompass16(f.windDirection)} ${Math.round(f.windSpeed)} kn${f.windType ? ` ${windTypeNl(f.windType)}` : ''}`
            : `${sizeWord(f.spotWaveHeight ?? f.waveHeight)} · ${(f.spotWaveHeight ?? f.waveHeight).toFixed(1).replace('.', ',')} m · ${degreesToCompass16(f.windDirection)} ${Math.round(f.windSpeed)} kn`;
          const parts = PARTS.map(([a, b, name]) => {
            const cs = p.items.filter(x => { const h = parseISO(x.timestamp).getHours(); return h >= a && h < b; }).map(chance);
            return { name, c: cs.length ? Math.max(...cs) : undefined };
          });
          return (
            <button key={i} onClick={() => f && openDay(p.day)} disabled={!f}
              className="w-full grid grid-cols-[64px_1fr_auto] gap-3 items-center px-4 py-3 text-left cursor-pointer disabled:cursor-default hover:bg-slate-50 first:rounded-t-3xl last:rounded-b-3xl"
              aria-label={`${label} ${format(p.day, 'd MMMM', { locale: nl })}: ${f ? `${p.peakChance}%, ${word(p.peakChance)}, ${meta}` : 'geen gegevens'}`}>
              <div>
                <div className="text-[16px] font-bold capitalize">{label}</div>
                <div className="text-[13px] text-slate-500">{format(p.day, 'd MMM', { locale: nl }).replace('.', '')}</div>
              </div>
              <div className="min-w-0">
                <div className="grid grid-cols-5 gap-1" aria-hidden="true">
                  {parts.map(x => <div key={x.name} title={`${x.name}: ${x.c ?? '–'}%`} className={cn('h-6 rounded-md', cellCls(x.c))} />)}
                </div>
                <div className="mt-1 text-[13px] leading-snug text-slate-600 line-clamp-2">{meta}</div>
              </div>
              <div className="text-right">
                <div className={cn('text-[17px] font-extrabold tabular-nums', f ? scoreCls(p.peakChance) : 'text-slate-400')}>{f ? `${p.peakChance}%` : '–'}</div>
                <div className="text-[12px] text-slate-500">{f ? word(p.peakChance) : ''}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[13px] text-slate-600" aria-hidden="true">
        <span><i className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1 align-[-1px]" />goed ≥ 70%</span>
        <span><i className="inline-block w-3 h-3 rounded bg-emerald-200 mr-1 align-[-1px]" />redelijk</span>
        <span><i className="inline-block w-3 h-3 rounded bg-amber-200 mr-1 align-[-1px]" />matig</span>
        <span><i className="inline-block w-3 h-3 rounded bg-slate-200 mr-1 align-[-1px]" />werkt niet</span>
      </div>

      <div className="flex gap-2 rounded-2xl bg-sky-50 border border-sky-100 p-3 text-[14px] text-slate-700">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
        <p><b>Hoe zeker?</b> Vandaag en morgen het betrouwbaarst. Vanaf dag 4 een richting, geen belofte: kijk dan opnieuw.</p>
      </div>

      <div ref={detailRef} className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-sans normal-case not-italic tracking-normal text-[18px] font-bold">Alle cijfers</h3>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([['cards', 'Dagkaarten', List], ['grid', 'Tabel', LayoutGrid]] as const).map(([k, l, Icon]) => (
              <button key={k} onClick={() => setDetail(k)} aria-pressed={detail === k}
                className={cn('flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-[14px] font-semibold cursor-pointer', detail === k ? 'bg-white shadow-sm' : 'text-slate-600')}>
                <Icon className="w-4 h-4" /> {l}
              </button>
            ))}
          </div>
        </div>
        {detail === 'cards'
          ? <CompactDailyForecast forecast={forecasts} spot={spot} user={user} isLoggedIn={isLoggedIn} onSelectForecastHour={(f) => onSelectHour?.(f)} onOpenProfile={onOpenProfile} focusDay={focusDay} />
          : <ForecastGrid forecast={forecasts} onCellClick={(f) => onSelectHour?.(f)} spot={spot} onDayClick={(d) => { setFocusDay(d); setDetail('cards'); }} />}
      </div>
    </div>
  );
};
