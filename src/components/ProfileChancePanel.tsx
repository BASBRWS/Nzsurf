import React, { useMemo, useState } from 'react';
import { UserRound, ChevronDown, ChevronRight } from 'lucide-react';
import type { ForecastData, SurfSpot, UserProfile } from '../types';
import { personalHours, GENERIC_WINDOW_TEXT, PersonalHour } from '../utils/surfProfile';
import { cn } from '../lib/utils';

/**
 * Beta: persoonlijke kans naast de algemene NzSurf-kans, voor de gekozen spot.
 * Laat zien welk surfvenster uit het profiel volgt en waar het advies verandert.
 */

const SKILL: Record<string, string> = { beginner: 'beginner', intermediate: 'gemiddeld', advanced: 'gevorderd', pro: 'pro' };
const WORKS = 50; // vanaf deze kans telt een uur als "surfbaar"
const isDaylight = (t: string) => { const h = new Date(t).getHours(); return h >= 7 && h <= 19; };
const dayKey = (t: string) => new Date(t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const tone = (c: number) => (c >= 70 ? 'bg-emerald-600 text-white' : c >= WORKS ? 'bg-emerald-100 text-emerald-900' : c >= 30 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500');

export function ProfileChancePanel({ spot, hours, user }: { spot?: SurfSpot; hours: ForecastData[]; user: UserProfile }) {
  const [open, setOpen] = useState<string | null>(null);
  const res = useMemo(() => (spot && hours.length ? personalHours(spot, hours, user) : null), [spot, hours, user]);

  const days = useMemo(() => {
    const m = new Map<string, PersonalHour[]>();
    for (const h of res?.hours || []) {
      if (!isDaylight(h.t) || Date.parse(h.t) < Date.now() - 3 * 3_600_000) continue;
      const k = dayKey(h.t);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    }
    return [...m.entries()].slice(0, 7).map(([day, hs]) => {
      const bestG = hs.reduce((a, b) => (b.generic > a.generic ? b : a));
      const bestP = hs.reduce((a, b) => (b.personal > a.personal ? b : a));
      return { day, hs, bestG, bestP, nG: hs.filter(h => h.generic >= WORKS).length, nP: hs.filter(h => h.personal >= WORKS).length };
    });
  }, [res]);

  if (!spot || !res) {
    return <div className="bg-white/90 border border-slate-200 rounded-3xl p-4 text-sm text-slate-500">Persoonlijke kans: nog geen verwachting geladen voor deze spot.</div>;
  }
  const diffDays = days.filter(d => Math.abs(d.bestP.personal - d.bestG.generic) >= 15);

  return (
    <div className="bg-white/90 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-black uppercase text-slate-900 flex items-center gap-2"><UserRound className="w-5 h-5 text-cyan-600" /> Persoonlijke kans — {spot.name}</h3>
        <p className="text-xs text-slate-600 mt-1">
          Profiel: {user.weight || 75} kg, {SKILL[user.skillLevel] || 'gemiddeld'}, {user.boards?.length || 0} board(s){user.surfPreferences ? ', met je eigen voorkeuren (golf, periode, wind)' : ', nog zonder eigen voorkeuren (Instellingen → Mijn voorkeuren)'}. Per uur rekent NzSurf met elk board uit je quiver en neemt het beste.
          Alleen ter vergelijking in de Beta; de app gebruikt nog de algemene kans.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {res.windows.map(w => (
          <div key={w.board.id} className="rounded-xl border border-slate-200 p-3 text-[11px] text-slate-700 space-y-0.5">
            <p className="font-bold text-slate-900 text-xs">{w.board.name || w.board.type} <span className="font-normal text-slate-500">({w.board.type}, {w.board.volume} L)</span></p>
            {w.why.map(l => <p key={l}>• {l}</p>)}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{GENERIC_WINDOW_TEXT}</p>

      <div className="text-xs text-slate-700">
        {diffDays.length
          ? <p><b>{diffDays.length} van {days.length} dagen</b> verschillen 15 punten of meer: daar zou het advies voor jou anders zijn dan voor "de gemiddelde surfer".</p>
          : <p>Deze week geen grote verschillen tussen algemene en persoonlijke kans.</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-slate-500">
            <th className="pr-2 py-1">Dag</th><th className="pr-2 text-right">Algemeen</th><th className="pr-2 text-right">Voor jou</th><th className="pr-2">Board</th><th className="pr-2 text-right">Uren ≥{WORKS}%</th>
          </tr></thead>
          <tbody>
            {days.map(d => {
              const delta = d.bestP.personal - d.bestG.generic;
              return (
                <React.Fragment key={d.day}>
                  <tr className="border-t border-slate-100 cursor-pointer" onClick={() => setOpen(open === d.day ? null : d.day)}>
                    <td className="pr-2 py-1.5 font-bold whitespace-nowrap">{open === d.day ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />} {d.day}</td>
                    <td className="pr-2 text-right"><span className={cn('px-1.5 py-0.5 rounded font-mono', tone(d.bestG.generic))}>{d.bestG.generic}%</span></td>
                    <td className="pr-2 text-right whitespace-nowrap">
                      <span className={cn('px-1.5 py-0.5 rounded font-mono', tone(d.bestP.personal))}>{d.bestP.personal}%</span>
                      {Math.abs(delta) >= 15 && <span className={cn('ml-1 font-bold', delta > 0 ? 'text-emerald-700' : 'text-rose-700')}>{delta > 0 ? '+' : ''}{delta}</span>}
                    </td>
                    <td className="pr-2">{d.bestP.personal >= 30 ? d.bestP.bestBoard : '—'}</td>
                    <td className="pr-2 text-right font-mono">{d.nG} → {d.nP}</td>
                  </tr>
                  {open === d.day && (
                    <tr><td colSpan={5} className="pb-2">
                      <table className="w-full text-[10px] bg-slate-50 rounded-lg">
                        <thead><tr className="text-left text-slate-500"><th className="px-2">Tijd</th><th className="pr-2 text-right">Spot</th><th className="pr-2 text-right">Per.</th><th className="pr-2">Wind</th><th className="pr-2 text-right">Alg.</th><th className="pr-2 text-right">Jij</th><th className="pr-2">Board / beperking</th></tr></thead>
                        <tbody>
                          {d.hs.map(h => (
                            <tr key={h.t} className="border-t border-slate-200">
                              <td className="px-2 font-mono">{new Date(h.t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="pr-2 text-right">{h.spotH.toFixed(1).replace('.', ',')} m</td>
                              <td className="pr-2 text-right">{Math.round(h.period)} s</td>
                              <td className="pr-2 whitespace-nowrap">{Math.round(h.windKn)} kn {h.windType || ''}</td>
                              <td className="pr-2 text-right font-mono">{h.generic}</td>
                              <td className="pr-2 text-right font-mono font-bold">{h.personal}</td>
                              <td className="pr-2">{h.bestBoard}{h.limit ? <span className="text-slate-500"> · {h.limit}</span> : null}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">
        Beste uur per dag (7–19 u). "Uren ≥{WORKS}%": hoeveel uren algemeen → voor jou surfbaar zijn. Tik op een dag voor de uren. Het venster is nu afgeleid uit je profiel, nog niet getoetst:
        dat komt met het sessielogboek (na elke sessie één oordeel), waarmee het venster zich aan jou aanpast.
      </p>
    </div>
  );
}
