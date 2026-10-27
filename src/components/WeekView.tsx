import React, { useMemo, useRef, useState } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { ForecastData, SurfSpot, UserProfile } from '../types';
import { CompactDailyForecast } from './CompactDailyForecast';
import { ForecastGrid } from './ForecastGrid';
import { planDays, useChances } from './home/AnswerCard';
import { DayLine } from './tide/DayLine';
import { GREEN, OK, TIDE, chanceColor, dayProfile, dayTips, heightScale, hourOf, useWidth } from './tide/tide';
import { computeSurfChance } from '../utils/spotKnowledge';

/**
 * Week als zeven getijden: elke dag dezelfde lijn, onder elkaar. Licht waar het ≥ 65% is.
 * Vanaf dag 4 gestippeld: een richting, geen belofte. Tik een dag voor alle cijfers.
 */
interface Props {
  spot: SurfSpot;
  forecasts: ForecastData[];
  user: UserProfile;
  isLoggedIn: boolean;
  onSelectHour?: (f: ForecastData) => void;
  onOpenProfile?: () => void;
}

const Mono: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <span className={`tide-mono text-[11px] text-[color:var(--tide-sea)] ${className}`} style={style}>{children}</span>
);

export const WeekView: React.FC<Props> = ({ spot, forecasts, user, isLoggedIn, onSelectHour, onOpenProfile }) => {
  const canPersonal = isLoggedIn && (user.boards?.length ?? 0) > 0;
  const [mode, setMode] = useState<'personal' | 'general'>(canPersonal ? 'personal' : 'general');
  const personal = canPersonal && mode === 'personal';
  const { chance, board, generic } = useChances(spot, forecasts, user, personal);
  const plans = useMemo(() => planDays(forecasts, chance, board, generic, new Date(), 7), [forecasts, chance, board, generic]);
  const [detail, setDetail] = useState<'cards' | 'grid'>('grid');
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const lineW = Math.max(160, width - 56 - 64);

  // Eén hoogteschaal voor de hele week, zodat de dagen te vergelijken zijn.
  const weekScale = useMemo(() => heightScale(Math.max(0.5, ...forecasts.filter(f => f.isDaylight !== false).slice(0, 7 * 8).map(f => computeSurfChance(spot, f).spotWave))), [forecasts, spot]);
  const best = plans.filter(p => p.peak).reduce<typeof plans[number] | null>((a, b) => (!a || b.peakChance > a.peakChance ? b : a), null);
  const now = new Date();

  const openDay = (d: Date) => {
    setFocusDay(format(d, 'yyyy-MM-dd'));
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="px-1 pt-2 text-[color:var(--tide-ink)]">
      <div className="flex items-center justify-between gap-3">
        <Mono>zeven dagen</Mono>
        {canPersonal && (
          <div role="tablist" aria-label="Soort kans" className="flex gap-4">
            {(['personal', 'general'] as const).map(m => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`min-h-[44px] text-[15px] cursor-pointer ${mode === m ? 'underline underline-offset-[6px] decoration-[color:var(--tide-sun)] decoration-2' : 'text-[color:var(--tide-mist)]'}`}>
                {m === 'personal' ? 'Voor jou' : 'Algemeen'}
              </button>
            ))}
          </div>
        )}
      </div>

      <h2 className="mt-4 text-[54px] leading-none">Deze week</h2>
      {best && best.peakChance >= OK ? (
        <Mono className="block mt-3 text-[color:var(--tide-ink)]">
          beste · {isSameDay(best.day, now) ? 'vandaag' : format(best.day, 'EEEE', { locale: nl })} {format(best.start!, 'HH')} – {format(best.end!, 'HH')} · <span style={{ color: chanceColor(best.peakChance) }}>{best.peakChance}%</span>
        </Mono>
      ) : <Mono className="block mt-3">deze week geen moment boven {OK}%</Mono>}
      {!canPersonal && (
        <p className="mt-2 text-[15px] text-[color:var(--tide-sea)]">Algemene kans. {isLoggedIn ? <button onClick={onOpenProfile} className="underline underline-offset-4 cursor-pointer">Voeg je boards toe</button> : 'Log in'} voor advies op maat.</p>
      )}

      <div ref={ref} className="mt-6">
        {plans.map((p, i) => {
          const items = forecasts.filter(f => isSameDay(parseISO(f.timestamp), p.day) && hourOf(f) >= 5 && hourOf(f) <= 22)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const label = i === 0 ? 'vandaag' : format(p.day, 'EEEEEE', { locale: nl });
          const pct = p.peak ? p.peakChance : null;
          const desc = pct === null ? 'geen gegevens' : pct >= OK ? `${pct}%, beste ${format(p.start!, 'HH')} tot ${format(p.end!, 'HH')} uur` : `${pct}%, werkt niet goed`;
          return (
            <div key={i} className="w-full grid items-end gap-0 text-left" style={{ gridTemplateColumns: `56px ${lineW}px 1fr`, height: 98 }}>
              <button onClick={() => p.peak && openDay(p.day)} disabled={!p.peak} className="pb-5 leading-tight text-left min-h-[44px] cursor-pointer disabled:cursor-default"
                aria-label={`${i === 0 ? 'Vandaag' : format(p.day, 'EEEE d MMMM', { locale: nl })}: ${desc}${i >= 3 ? ', nog onzeker' : ''}. Toon de details`}>
                <Mono className="block text-[color:var(--tide-ink)]">{label}</Mono>
                <Mono className="block text-[color:var(--tide-mist)]">{format(p.day, 'd')}</Mono>
              </button>
              {(() => { const prof = dayProfile(items, chance); return prof.hours.length > 1; })()
                ? (() => {
                    const prof = dayProfile(items, chance, x => computeSurfChance(spot, x).spotWave);
                    // Hoogte aan het strand om 9, 13 en 17 uur, als duiding onder de lijn.
                    const heights = [9, 13, 17].map(hr => {
                      const f = items.reduce<ForecastData | undefined>((a, b) => (!a || Math.abs(hourOf(b) - hr) < Math.abs(hourOf(a) - hr) ? b : a), undefined);
                      return f && Math.abs(hourOf(f) - hr) <= 2 ? { h: hr, v: computeSurfChance(spot, f).spotWave } : null;
                    }).filter((x): x is { h: number; v: number } => !!x);
                    return <DayLine hours={prof.hours} chances={prof.chances} values={prof.values} scaleMax={weekScale} width={lineW} height={86} uncertain={i >= 3} heights={heights} tips={dayTips(spot, items, chance)} />;
                  })()
                : <span className="h-[86px] border-b border-[color:var(--tide-line)]" />}
              <button onClick={() => p.peak && openDay(p.day)} disabled={!p.peak} tabIndex={-1} aria-hidden="true"
                className="tide-serif text-right text-[26px] leading-none pb-[18px] cursor-pointer disabled:cursor-default" style={{ color: pct === null ? TIDE.mist : chanceColor(pct) }}>{pct === null ? '–' : `${pct}%`}</button>
            </div>
          );
        })}
        <div className="grid mt-1" style={{ gridTemplateColumns: `56px ${lineW}px 1fr` }} aria-hidden="true">
          <span />
          <div className="relative h-4">
            {[6, 12, 18, 21].map(h => (
              <Mono key={h} className="absolute" style={{ left: `${((h - 6) / 15) * 100}%`, transform: h === 6 ? 'none' : h === 21 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{String(h).padStart(2, '0')}</Mono>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-[color:var(--tide-line)] pt-3 text-[15px] leading-snug text-[color:var(--tide-sea)]">
        <span className="inline-block w-6 h-3 rounded-sm mr-1.5 align-[-1px]" style={{ background: `linear-gradient(90deg, ${GREEN.lo}, ${GREEN.hi})` }} />groen = te surfen (kans ≥ {OK}%); hoe donkerder, hoe zekerder.
        De lijn is de golfhoogte aan het strand (zelfde schaal voor alle dagen, tot {String(weekScale).replace('.', ',')} m); de getallen eronder om 9, 13 en 17 uur. Veeg of wijs over een lijn voor de tijd en de cijfers; tik de dag voor de details.
        Vanaf dag 4 gestippeld: een richting, geen belofte.
      </p>

      <div ref={detailRef} className="mt-6 border-t border-[color:var(--tide-line)] pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[28px] leading-none">Alle cijfers</h3>
          <div className="flex gap-4">
            {([['grid', 'Tabel'], ['cards', 'Dagkaarten']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setDetail(k)} aria-pressed={detail === k}
                className={`min-h-[44px] text-[15px] cursor-pointer ${detail === k ? 'underline underline-offset-[6px] decoration-[color:var(--tide-sun)] decoration-2' : 'text-[color:var(--tide-mist)]'}`}>{l}</button>
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
