import React, { useEffect, useMemo, useState } from 'react';
import { Scale, RefreshCw } from 'lucide-react';
import type { SurfSpot, UserProfile } from '../types';
import type { AuditForecastDoc } from '../utils/forecastAudit';
import { WebcamMeasurement, loadWebcamMeasurements, webcamSpots } from '../services/webcamMeasure';
import { buildTestRows, scoreCandidates, userBoardClasses, CandidateScore } from '../utils/chanceTest';
import { cn } from '../lib/utils';

/**
 * Beta: kans tegen werkelijkheid. Drie kandidaten op dezelfde momenten, getoetst aan
 * het webcamoordeel voor de boards van de gebruiker.
 */

const NAMES: Record<CandidateScore['key'], { name: string; what: string }> = {
  nzsurf: { name: 'NzSurf nu', what: 'algemene kans zoals de app hem gaf' },
  personal: { name: 'Test: persoonlijk', what: 'surfvenster uit je profiel, zelfde NzSurf-data' },
  hybrid: { name: 'NzSurf hybride', what: 'algemene kans op de data van de sterkste bronnen' },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const cell = (c?: number) => (typeof c === 'number' ? `${c}%` : '–');

export function ChanceTestPanel({ user, spots, audit }: { user: UserProfile; spots: SurfSpot[]; audit: AuditForecastDoc[] }) {
  const [items, setItems] = useState<WebcamMeasurement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { loadWebcamMeasurements().then(setItems).catch(e => setErr(e?.message || String(e))); }, [tick]);

  const spot = useMemo(() => webcamSpots(spots).camera, [spots]);
  const rows = useMemo(() => (items ? buildTestRows(items, user, spot, audit) : []), [items, user, spot, audit]);
  const all = useMemo(() => scoreCandidates(rows), [rows]);
  const judged = useMemo(() => scoreCandidates(rows, true), [rows]);
  const classes = userBoardClasses(user);
  const ranked = [...all.scores].sort((a, b) => a.brier - b.brier);

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black uppercase text-slate-900 flex items-center gap-1.5"><Scale className="w-4 h-4 text-cyan-600" /> Kans tegen werkelijkheid</p>
          <p className="text-[11px] text-slate-600">
            Waarheid: het webcamoordeel (Maasvlakte) voor jouw boards ({classes.join(', ')}; het beste telt). Alle drie op dezelfde momenten, met de NzSurf-verwachting voor {spot.name}.
          </p>
        </div>
        <button onClick={() => setTick(t => t + 1)} className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-300 flex items-center gap-1 cursor-pointer"><RefreshCw className="w-3 h-3" /> Vernieuwen</button>
      </div>

      {err && <p className="text-[11px] text-rose-700">Kon metingen niet laden: {err}</p>}

      <table className="w-full text-[11px]">
        <thead><tr className="text-left text-slate-500"><th className="pr-2">Kandidaat</th><th className="pr-2 text-right">Raak</th><th className="pr-2 text-right">Brier</th><th className="pr-2 text-right">Scheef</th><th className="pr-2 text-right">Alleen oordeel</th></tr></thead>
        <tbody>
          {ranked.map((s, i) => {
            const j = judged.scores.find(x => x.key === s.key)!;
            return (
              <tr key={s.key} className="border-t border-slate-100 align-top">
                <td className="pr-2 py-1"><b className={cn(i === 0 && all.n >= 5 && 'text-emerald-700')}>{NAMES[s.key].name}</b><br /><span className="text-slate-500">{NAMES[s.key].what}</span></td>
                <td className="pr-2 text-right font-mono">{all.n ? pct(s.hit) : '–'}</td>
                <td className="pr-2 text-right font-mono">{all.n ? n2(s.brier) : '–'}</td>
                <td className="pr-2 text-right font-mono">{all.n ? `${s.bias >= 0 ? '+' : ''}${Math.round(s.bias * 100)}` : '–'}</td>
                <td className="pr-2 text-right font-mono">{judged.n ? `${pct(j.hit)} · ${n2(j.brier)}` : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-500">
        {all.n} momenten met alle drie een kans en een waarheid ({judged.n} met een echt webcamoordeel, de rest achteraf benaderd).
        Raak = aan de goede kant van 50%. Brier = gemiddelde (kans − waarheid)², lager is beter. Scheef = gemiddeld te optimistisch (+) of te somber (−), in procentpunten.
      </p>
      {all.n < 30 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Nog {all.n} momenten. Onder ±30 zegt een verschil tussen de drie weinig; onder 10 niets. Meet 1–2× per dag op wisselende dagen (ook flauwe en grote).
        </p>
      )}

      {rows.length > 0 && (
        <details>
          <summary className="text-[11px] font-bold text-slate-700 cursor-pointer">Per meting ({rows.length})</summary>
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-[10px]">
              <thead><tr className="text-left text-slate-500"><th className="pr-2">Tijd</th><th className="pr-2">Werkelijkheid</th><th className="pr-2 text-right">NzSurf nu</th><th className="pr-2 text-right">Test</th><th className="pr-2 text-right">Hybride</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.m.runAt} className="border-t border-slate-100">
                    <td className="pr-2 font-mono whitespace-nowrap">{new Date(r.m.runAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{r.exact ? '' : ' *'}</td>
                    <td className="pr-2">{r.truth ? <><b>{r.truth.y === 1 ? 'surfbaar' : r.truth.y === 0 ? 'niet' : 'matig'}</b> <span className="text-slate-500">({r.truth.source === 'oordeel' ? `oordeel: ${r.truth.label}` : `achteraf: ${r.truth.label}`})</span></> : <span className="text-slate-400">geen oordeel</span>}</td>
                    <td className="pr-2 text-right font-mono">{cell(r.nzsurf)}</td>
                    <td className="pr-2 text-right font-mono">{cell(r.personal)}</td>
                    <td className="pr-2 text-right font-mono">{cell(r.hybrid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">* oudere meting: windkwaliteit uit windrichting/-kracht herberekend, getij neutraal. Hybride: zijn verschil met NzSurf in Ouddorp (13 km) op dat uur, toegepast op de cameraspot.</p>
        </details>
      )}
    </div>
  );
}
