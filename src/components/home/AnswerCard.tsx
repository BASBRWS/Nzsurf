import React, { useMemo } from 'react';
import { parseISO, format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Sparkles, Bell, MapPin, ChevronRight, RefreshCw } from 'lucide-react';
import type { ForecastData, SurfSpot, UserProfile } from '../../types';
import { personalHours } from '../../utils/surfProfile';
import { chanceOf, reasonSentence, windTypeNl } from '../../utils/surfMoments';
import { degreesToCompass16 } from '../../utils/spotKnowledge';

/**
 * Het antwoord bovenaan Vandaag: kan ik surfen, wanneer, en met welk board?
 * Ingelogd met boards: de persoonlijke kans (profiel + quiver), anders de algemene kans.
 * Altijd met de cijfers erbij en een knop naar het waarom.
 */

const STEP_MS = 3 * 3600e3;
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

/** Golfhoogte in surftaal. */
export function sizeWord(h: number): string {
  return h < 0.3 ? 'vlak' : h < 0.5 ? 'kniehoog' : h < 0.75 ? 'heuphoog' : h < 1.0 ? 'borsthoog' : h < 1.3 ? 'schouderhoog' : h < 1.7 ? 'hoofdhoog' : h < 2.4 ? 'overhead' : 'dubbel overhead';
}

export interface DayPlan {
  day: Date;
  items: ForecastData[];
  peak?: ForecastData;
  peakChance: number;
  start?: Date;
  end?: Date;
  board?: string;
  generic?: number;
}

/** Kans per verwachtingsblok: persoonlijk (beste board) of algemeen. */
export function useChances(spot: SurfSpot, forecasts: ForecastData[], user: UserProfile, personal: boolean) {
  return useMemo(() => {
    const ph = personal && forecasts.length ? personalHours(spot, forecasts, user).hours : [];
    const byT = new Map(ph.map(h => [h.t, h]));
    return {
      chance: (f: ForecastData) => { const h = byT.get(f.timestamp); return personal && h ? h.personal : chanceOf(spot, f); },
      board: (f: ForecastData) => (personal ? byT.get(f.timestamp)?.bestBoard : undefined),
      generic: (f: ForecastData) => chanceOf(spot, f),
    };
  }, [spot, forecasts, user, personal]);
}

/** Daglichtblokken per dag, met het beste aaneengesloten venster (≥ 45%) rond de piek. */
export function planDays(forecasts: ForecastData[], chance: (f: ForecastData) => number, board: (f: ForecastData) => string | undefined,
  generic: (f: ForecastData) => number, now = new Date(), days = 7): DayPlan[] {
  const out: DayPlan[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now); day.setDate(now.getDate() + d); day.setHours(12, 0, 0, 0);
    const items = forecasts.filter(f => {
      const t = parseISO(f.timestamp), h = t.getHours();
      return isSameDay(t, day) && h >= 6 && h < 21 && (f.isDaylight ?? true) && t.getTime() + STEP_MS > now.getTime();
    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!items.length) { out.push({ day, items, peakChance: 0 }); continue; }
    const cs = items.map(chance);
    const pi = cs.indexOf(Math.max(...cs));
    let a = pi, b = pi;
    if (cs[pi] >= 45) { while (a > 0 && cs[a - 1] >= 45) a--; while (b < cs.length - 1 && cs[b + 1] >= 45) b++; }
    const start = parseISO(items[a].timestamp);
    const dayEnd = new Date(start); dayEnd.setHours(21, 0, 0, 0);
    const end = new Date(Math.min(parseISO(items[b].timestamp).getTime() + STEP_MS, dayEnd.getTime()));
    out.push({ day, items, peak: items[pi], peakChance: cs[pi], start, end, board: board(items[pi]), generic: generic(items[pi]) });
  }
  return out;
}

const partOfDay = (start: Date, now: Date) => (start.getTime() <= now.getTime() ? 'nu' : start.getHours() < 12 ? 'vanochtend' : start.getHours() < 17 ? 'vanmiddag' : 'vanavond');
const dayName = (d: Date, now: Date) => {
  const t = new Date(now); t.setDate(now.getDate() + 1);
  return isSameDay(d, now) ? 'vandaag' : isSameDay(d, t) ? 'morgen' : format(d, 'EEEE', { locale: nl });
};
const hhmm = (d?: Date) => (d ? format(d, 'HH:mm') : '');

interface Props {
  spot: SurfSpot;
  forecasts: ForecastData[];
  user: UserProfile;
  isLoggedIn: boolean;
  isLoading?: boolean;
  error?: string | null;
  staleAt?: string | null;
  onRetry?: () => void;
  onSelectHour?: (f: ForecastData) => void;
  onOpenAICoach?: () => void;
  onOpenSessionWindow?: () => void;
  onOpenMap?: () => void;
  onOpenProfile?: () => void;
}

export const AnswerCard: React.FC<Props> = ({ spot, forecasts, user, isLoggedIn, isLoading, error, staleAt, onRetry, onSelectHour, onOpenAICoach, onOpenSessionWindow, onOpenMap, onOpenProfile }) => {
  const now = new Date();
  const personal = isLoggedIn && (user.boards?.length ?? 0) > 0;
  const { chance, board, generic } = useChances(spot, forecasts, user, personal);
  const plans = useMemo(() => planDays(forecasts, chance, board, generic, new Date(), 7), [forecasts, chance, board, generic]);

  const today = plans[0];
  const todayOk = today?.peak && today.peakChance >= 45;
  const next = plans.slice(1).find(p => p.peak && p.peakChance >= 45);
  const show = todayOk ? today : (today?.peak ? today : next);

  let headline = '', sub = '';
  if (todayOk) {
    headline = `${today.peakChance >= 70 ? 'Ja' : 'Redelijk'}, ${partOfDay(today.start!, now)}`;
    sub = today.start!.getTime() <= now.getTime() ? `Nu tot ${hhmm(today.end)}.` : `Beste moment ${hhmm(today.start)}–${hhmm(today.end)}.`;
  } else if (next) {
    headline = today?.items.length ? 'Vandaag niet' : `Eerste kans ${dayName(next.day, now)}`;
    sub = `Eerste kans: ${dayName(next.day, now)} ${hhmm(next.start)}–${hhmm(next.end)} (${next.peakChance}%).`;
  } else if (plans.some(p => p.items.length)) {
    headline = 'Deze week weinig';
    sub = 'Geen moment boven 45% in de verwachting voor deze spot. Kijk bij Spots of het elders beter is.';
  }

  const dl = format(now, 'EEEE d MMM', { locale: nl });
  const dateLine = dl.charAt(0).toUpperCase() + dl.slice(1);
  const f = show?.peak;
  const h = f ? f.spotWaveHeight ?? f.waveHeight : undefined;
  const tone = !f ? 'from-slate-600 to-slate-700' : (todayOk && today.peakChance >= 70) ? 'from-emerald-700 to-teal-800' : todayOk ? 'from-cyan-700 to-sky-900' : 'from-slate-600 to-slate-800';

  return (
    <section aria-label="Kan ik vandaag surfen?" className={`rounded-3xl bg-gradient-to-br ${tone} text-white p-5 shadow-lg`}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={onOpenMap} className="flex items-center gap-1.5 min-h-[44px] min-w-0 -ml-1 px-1 text-[14px] text-white/90 cursor-pointer" aria-label={`Spot: ${spot.name}. Spots bekijken`}>
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{dateLine} · {personal ? 'voor jou' : 'algemene kans'}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onOpenAICoach} className="flex items-center gap-1.5 min-h-[40px] px-3 rounded-full bg-white/15 hover:bg-white/25 text-[14px] font-semibold whitespace-nowrap cursor-pointer">
            <Sparkles className="w-4 h-4" /> AI-coach
          </button>
          <button onClick={onOpenSessionWindow} className="w-10 h-10 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 cursor-pointer" aria-label="Meldingen en sessievenster">
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>

      {f && headline ? (
        <>
          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mt-1">
            <h2 className="font-sans normal-case not-italic text-[32px] leading-tight font-extrabold tracking-tight">{headline}</h2>
            <span className="rounded-full bg-white/20 px-3 py-1 text-[15px] font-bold tabular-nums">{show!.peakChance}%</span>
          </div>
          <p className="mt-1.5 text-[16px] leading-snug text-white/95">{sub} {reasonSentence(spot, f)}</p>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-[13px] text-white/80">Golf strand</div>
              <div className="text-[20px] font-bold tabular-nums">{fmt1(h!)} m</div>
              <div className="text-[13px] text-white/85">{sizeWord(h!)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-[13px] text-white/80">Periode</div>
              <div className="text-[20px] font-bold tabular-nums">{Math.round(f.swellPeriod)} s</div>
              <div className="text-[13px] text-white/85">{f.swellPeriod >= 8 ? 'deining' : f.swellPeriod >= 6 ? 'gemengd' : 'windgolven'}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-[13px] text-white/80">Wind</div>
              <div className="text-[20px] font-bold tabular-nums">{Math.round(f.windSpeed)} kn</div>
              <div className="text-[13px] text-white/85">{degreesToCompass16(f.windDirection)} · {windTypeNl(f.windType) || '—'}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-white/90">
              {personal && show!.board ? <>Pak je <b>{show!.board}</b>{typeof show!.generic === 'number' && show!.generic !== show!.peakChance ? ` · algemeen ${show!.generic}%` : ''}</>
                : isLoggedIn ? <button onClick={onOpenProfile} className="underline cursor-pointer">Voeg je boards toe voor advies op maat</button>
                : 'Log in voor advies op jouw niveau en boards'}
            </p>
            {onSelectHour && (
              <button onClick={() => onSelectHour(f)} className="flex items-center gap-1 min-h-[40px] px-3 rounded-full bg-white text-slate-900 text-[14px] font-semibold cursor-pointer">
                Waarom? <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </>
      ) : error && !isLoading ? (
        <div className="mt-3">
          <h2 className="font-sans normal-case not-italic text-[22px] font-bold">Geen verbinding met de weerbron</h2>
          <p className="mt-1 text-[15px] text-white/90">De verwachting kon niet worden opgehaald. Controleer je verbinding of probeer het zo opnieuw.</p>
          {onRetry && <button onClick={onRetry} className="mt-3 flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white text-slate-900 text-[15px] font-semibold cursor-pointer"><RefreshCw className="w-4 h-4" /> Opnieuw</button>}
          <p className="mt-2 text-[12px] text-white/60">Technisch: {error}</p>
        </div>
      ) : (
        <p className="mt-3 text-[16px] text-white/90">{isLoading ? 'Verwachting laden…' : 'Nog geen verwachting voor deze spot.'}</p>
      )}

      {staleAt && error && !isLoading && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-50 text-amber-900 px-3 py-2 text-[14px]">
          <span>Oudere verwachting van {new Date(staleAt).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: ophalen mislukte.</span>
          {onRetry && <button onClick={onRetry} className="font-semibold underline shrink-0 min-h-[40px] cursor-pointer">Opnieuw</button>}
        </div>
      )}
    </section>
  );
};
