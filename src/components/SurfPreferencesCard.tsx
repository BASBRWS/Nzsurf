import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { SurfPreferences, UserProfile } from '../types';
import { surfWindow, validPrefs } from '../utils/surfProfile';

/**
 * Mijn voorkeuren: ideale golfhoogte, periode en windsnelheid (twee schuifjes per regel,
 * zoals in Secret Swell). Telt mee in de persoonlijke kans; opslaan met de knop, zodat
 * slepen niet bij elke stap naar de database schrijft.
 */

const waveLabel = (h: number) => (h < 0.45 ? 'Knie' : h < 0.7 ? 'Heup' : h < 0.9 ? 'Borst' : h < 1.2 ? 'Schouder' : h < 1.5 ? 'Hoofdhoog' : h < 2.4 ? 'Overhead' : 'Dubbel overhead');
const periodLabel = (p: number) => (p < 7 ? 'Kort' : p < 10 ? 'Gemiddeld' : p < 13 ? 'Lang' : 'Lange groundswell');
const windLabel = (k: number) => (k < 3 ? 'Geen wind' : k < 8 ? 'Licht' : k < 13 ? 'Matig' : k < 20 ? 'Sterk' : 'Storm');
const nl1 = (x: number) => x.toFixed(1).replace('.', ',');

function DualRange({ title, min, max, step, lo, hi, onChange, fmt, help }: {
  title: string; min: number; max: number; step: number; lo: number; hi: number;
  onChange: (lo: number, hi: number) => void; fmt: (v: number) => string; help: string;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      <div className="flex justify-between text-[11px] text-slate-600"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
      <div className="dual-range">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-cyan-600" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" aria-label={`${title} minimum`} min={min} max={max} step={step} value={lo}
          onChange={e => onChange(Math.min(Number(e.target.value), hi - step), hi)} />
        <input type="range" aria-label={`${title} maximum`} min={min} max={max} step={step} value={hi}
          onChange={e => onChange(lo, Math.max(Number(e.target.value), lo + step))} />
      </div>
      <p className="text-[10px] text-slate-400">{help}</p>
    </div>
  );
}

/** Startwaarden als er nog niets is ingesteld: wat NzSurf nu uit niveau en boards afleidt. */
function derived(user: UserProfile): SurfPreferences {
  const ws = (user.boards?.length ? user.boards : []).map(b => surfWindow({ ...user, surfPreferences: undefined }, b));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (!ws.length) return { waveMin: 0.6, waveMax: 1.5, periodMin: 6, periodMax: 14, windMin: 0, windMax: 12 };
  return {
    waveMin: r1(Math.min(...ws.map(w => w.idealMin))), waveMax: r1(Math.max(...ws.map(w => w.idealMax))),
    periodMin: Math.min(...ws.map(w => w.minPeriod)), periodMax: 14, windMin: 0, windMax: 12,
  };
}

export function SurfPreferencesCard({ user, onUpdate }: { user: UserProfile; onUpdate: (u: UserProfile) => void }) {
  const saved = validPrefs(user.surfPreferences);
  const start = useMemo(() => saved ?? derived(user), [saved, user]);
  const [p, setP] = useState<SurfPreferences>(start);
  const [msg, setMsg] = useState('');
  useEffect(() => { setP(start); }, [start]);

  const dirty = JSON.stringify(p) !== JSON.stringify(saved ?? null);
  const set = (patch: Partial<SurfPreferences>) => { setP(x => ({ ...x, ...patch })); setMsg(''); };
  const save = () => { onUpdate({ ...user, surfPreferences: p }); setMsg('Opgeslagen — telt mee in je persoonlijke kans.'); };
  const reset = () => {
    const { surfPreferences: _drop, ...rest } = user;
    onUpdate(rest as UserProfile);
    setMsg('Gewist — NzSurf leidt je venster weer af uit niveau en boards.');
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
          <SlidersHorizontal className="w-4 h-4 text-cyan-600" />
        </div>
        <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Mijn Voorkeuren</h3>
      </div>
      <div className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 rounded-2xl px-5 py-5 space-y-6">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Stel je ideale golf-, periode- en windcondities in. Dit telt mee in je <b>persoonlijke kans</b>: binnen je bereik is het ideaal,
          daarbuiten zakt de kans geleidelijk. Je boards bepalen nog vanaf welke hoogte het überhaupt werkt.
          {!saved && <span className="text-amber-700"> Nog niet ingesteld: hieronder staat wat NzSurf nu uit je niveau en boards afleidt.</span>}
        </p>
        <DualRange title="Golfhoogte" min={0.3} max={3} step={0.1} lo={p.waveMin} hi={p.waveMax}
          onChange={(lo, hi) => set({ waveMin: Math.round(lo * 10) / 10, waveMax: Math.round(hi * 10) / 10 })}
          fmt={v => `${waveLabel(v)} (${nl1(v)} m)`} help="Hoogte aan het strand, zoals NzSurf die per spot toont." />
        <DualRange title="Golfperiode" min={4} max={16} step={1} lo={p.periodMin} hi={p.periodMax}
          onChange={(lo, hi) => set({ periodMin: lo, periodMax: hi })}
          fmt={v => `${periodLabel(v)} (${v} s)`} help="Onder je minimum te weinig kracht; langer dan je maximum telt nauwelijks af." />
        <DualRange title="Windsnelheid" min={0} max={30} step={1} lo={p.windMin} hi={p.windMax}
          onChange={(lo, hi) => set({ windMin: lo, windMax: hi })}
          fmt={v => `${windLabel(v)} (${v} kn)`} help="Boven je maximum zakt de kans; de windrichting (aflandig/aanlandig) telt daarnaast nog steeds." />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">
            Voorkeuren opslaan
          </button>
          {saved && (
            <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600">
              Wissen (automatisch)
            </button>
          )}
          {msg && <span className="text-[11px] text-emerald-700">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
