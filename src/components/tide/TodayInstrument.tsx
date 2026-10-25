import React, { useMemo } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { ForecastData, SurfSpot, UserProfile } from '../../types';
import { planDays, sizeWord, useChances } from '../home/AnswerCard';
import { reasonSentence, windTypeNl } from '../../utils/surfMoments';
import { computeSurfChance, degreesToCompass16 } from '../../utils/spotKnowledge';
import { DayLine } from './DayLine';
import { OK, TIDE, dayProfile, dayTips, hourOf, useWidth } from './tide';

/**
 * Vandaag als instrument: één woord dat oordeelt, het tijdvak, en de dag als lijn.
 * Ingelogd met boards: persoonlijke kans; anders de algemene kans.
 */
interface Props {
  spot: SurfSpot; forecasts: ForecastData[]; user: UserProfile; isLoggedIn: boolean;
  isLoading?: boolean; error?: string | null; staleAt?: string | null; onRetry?: () => void;
  onSelectHour?: (f: ForecastData) => void; onOpenAICoach?: () => void; onOpenSessionWindow?: () => void; onOpenProfile?: () => void;
}

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');
const hh = (d?: Date) => (d ? format(d, 'HH:mm') : '');
const dayWord = (d: Date, now: Date) => {
  const t = new Date(now); t.setDate(now.getDate() + 1);
  return isSameDay(d, t) ? 'morgen' : format(d, 'EEEE', { locale: nl });
};
const Mono: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`tide-mono text-[11px] text-[color:var(--tide-sea)] ${className}`}>{children}</span>
);

export const TodayInstrument: React.FC<Props> = ({ spot, forecasts, user, isLoggedIn, isLoading, error, staleAt, onRetry, onSelectHour, onOpenAICoach, onOpenSessionWindow, onOpenProfile }) => {
  const now = new Date();
  const personal = isLoggedIn && (user.boards?.length ?? 0) > 0;
  const { chance, board, generic } = useChances(spot, forecasts, user, personal);
  const plans = useMemo(() => planDays(forecasts, chance, board, generic, new Date(), 7), [forecasts, chance, board, generic]);
  const [ref, width] = useWidth<HTMLDivElement>();

  // De lijn van vandaag: alle blokken van 06 tot 21 uur (ook die al voorbij zijn).
  const todayItems = useMemo(() => forecasts.filter(f => isSameDay(parseISO(f.timestamp), now) && hourOf(f) >= 5 && hourOf(f) <= 22)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [forecasts]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = plans[0];
  const okToday = !!today?.peak && today.peakChance >= OK;
  const next = plans.slice(1).find(p => p.peak && p.peakChance >= OK);
  const show = okToday ? today : next ?? today;
  const f = show?.peak;

  let word = '', when: React.ReactNode = null;
  if (okToday) {
    const s = today.start!;
    word = s.getTime() <= now.getTime() ? 'Nu.' : s.getHours() < 12 ? 'Vanochtend.' : s.getHours() < 17 ? 'Vanmiddag.' : 'Vanavond.';
    when = <>{s.getTime() <= now.getTime() ? `nu – ${hh(today.end)}` : `${hh(s)} – ${hh(today.end)}`}</>;
  } else if (next) {
    word = today?.items.length ? 'Vandaag niet.' : `${dayWord(next.day, now).replace(/^./, c => c.toUpperCase())}.`;
    when = <>eerste kans {dayWord(next.day, now)} {hh(next.start)} – {hh(next.end)}</>;
  } else if (plans.some(p => p.items.length)) {
    word = 'Deze week niet.';
    when = <>geen moment boven {OK}%</>;
  }
  const pct = show?.peakChance ?? 0;
  // Hoogte aan het strand: dezelfde als waar de kans op rekent (en de tabel nu groot toont).
  const h = f ? computeSurfChance(spot, f).spotWave : 0;
  const sea = f?.waveHeight ?? 0;
  const damped = f && sea >= 0.5 && h < sea * 0.6;

  return (
    <section aria-label="Kan ik vandaag surfen?" className="px-1 pt-2">
      <div className="flex items-center justify-between gap-3">
        <Mono>{personal ? 'voor jou' : 'algemene kans'}</Mono>
        <Mono className="text-[color:var(--tide-mist)]">{format(now, 'EEE d MMM', { locale: nl }).replace('.', '')}</Mono>
      </div>

      {f && word ? (
        <>
          <h2 className="mt-6 leading-[0.95] text-[color:var(--tide-ink)]" style={{ fontSize: 'clamp(56px, 19vw, 92px)' }}>{word}</h2>
          <div className="mt-3 flex items-baseline gap-3 flex-wrap">
            <span className="text-[20px] font-semibold tabular-nums">{when}</span>
            <span className="tide-serif text-[30px] leading-none" style={{ color: pct >= OK ? TIDE.sun : TIDE.mist }}>{pct}%</span>
          </div>
          <p className="mt-2 text-[17px] leading-snug text-[color:var(--tide-sea)] max-w-[34ch]">{reasonSentence(spot, f)}</p>

          <div ref={ref} className="mt-6">
            {(() => { const prof = dayProfile(todayItems, chance); return prof.hours.length > 1 && (
              <DayLine hours={prof.hours} chances={prof.chances} tide={prof.tide} tips={dayTips(spot, todayItems, chance)}
                width={width} height={190} now={now.getHours() + now.getMinutes() / 60} axis
                label={`Kans vandaag per uur, beste ${pct}%`} />
            ); })()}
          </div>

          <div className="mt-5 border-t border-[color:var(--tide-line)] pt-3">
            <Mono className="block text-[color:var(--tide-mist)]">{okToday || !next ? '' : `${dayWord(next.day, now)} `}om {format(parseISO(f.timestamp), 'HH:mm')} · aan het strand</Mono>
          </div>
          <div className="mt-2 grid grid-cols-3">
            <div><div className="tide-serif text-[34px] leading-none">{fmt1(h)} m</div><Mono className="block mt-1.5">{sizeWord(h)}</Mono><Mono className="block mt-1 text-[color:var(--tide-mist)]">zee {fmt1(sea)} m</Mono></div>
            <div><div className="tide-serif text-[34px] leading-none">{Math.round(f.swellPeriod)} s</div><Mono className="block mt-1.5">{f.swellPeriod >= 8 ? 'deining' : f.swellPeriod >= 6 ? 'gemengd' : 'windgolven'}</Mono></div>
            <div><div className="tide-serif text-[34px] leading-none">{Math.round(f.windSpeed)} kn</div><Mono className="block mt-1.5">{degreesToCompass16(f.windDirection)} · {windTypeNl(f.windType) || '—'}</Mono></div>
          </div>

          {damped && (
            <p className="mt-4 text-[15px] leading-snug text-[color:var(--tide-sea)]">
              Op zee {fmt1(sea)} m, maar aan het strand van {spot.name} komt ongeveer {fmt1(h)} m aan: zandbanken en de swellrichting
              {f.swellDirection !== undefined ? ` (uit ${degreesToCompass16(f.swellDirection)})` : ''} dempen de golven.
            </p>
          )}

          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[color:var(--tide-line)] pt-4">
            <Mono>board</Mono>
            {personal && show.board
              ? <span className="text-[17px]">{show.board}{typeof show.generic === 'number' && show.generic !== pct ? <span className="text-[color:var(--tide-mist)]"> · algemeen {show.generic}%</span> : null}</span>
              : isLoggedIn
                ? <button onClick={onOpenProfile} className="text-[16px] underline underline-offset-4 cursor-pointer">Voeg je boards toe</button>
                : <span className="text-[16px] text-[color:var(--tide-sea)]">Log in voor advies op maat</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[color:var(--tide-line)] pt-3">
            {onSelectHour && <button onClick={() => onSelectHour(f)} className="min-h-[44px] text-[16px] underline underline-offset-4 cursor-pointer">Waarom?</button>}
            {onOpenAICoach && <button onClick={onOpenAICoach} className="min-h-[44px] text-[16px] underline underline-offset-4 cursor-pointer">AI-coach</button>}
            {onOpenSessionWindow && <button onClick={onOpenSessionWindow} className="min-h-[44px] text-[16px] underline underline-offset-4 cursor-pointer">Meldingen</button>}
          </div>
        </>
      ) : error && !isLoading ? (
        <div className="mt-6">
          <h2 className="text-[44px] leading-none">Geen verbinding.</h2>
          <p className="mt-3 text-[17px] text-[color:var(--tide-sea)]">De weerbron gaf geen antwoord. Controleer je verbinding of probeer het zo opnieuw.</p>
          {onRetry && <button onClick={onRetry} className="mt-4 min-h-[48px] px-5 rounded-full bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)] text-[16px] font-semibold cursor-pointer">Opnieuw</button>}
          <Mono className="block mt-3 text-[color:var(--tide-mist)] normal-case tracking-normal">technisch: {error}</Mono>
        </div>
      ) : (
        <h2 className="mt-6 text-[44px] leading-none text-[color:var(--tide-mist)]">{isLoading ? 'Even kijken…' : 'Nog geen verwachting.'}</h2>
      )}

      {staleAt && error && !isLoading && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--tide-line)] pt-3 text-[15px] text-[#8a4b12]">
          <span>Oudere verwachting van {new Date(staleAt).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}; ophalen mislukte.</span>
          {onRetry && <button onClick={onRetry} className="min-h-[44px] underline underline-offset-4 shrink-0 cursor-pointer">Opnieuw</button>}
        </div>
      )}
    </section>
  );
};
