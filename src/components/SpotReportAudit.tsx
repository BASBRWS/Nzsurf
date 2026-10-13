import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Download, Loader2, Camera } from 'lucide-react';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { TableHelp } from './TableHelp';
import {
  AuditForecastDoc, MIN_REPORTS, RATING_LABELS, SpotReportLike,
  reportRows, summarizeReports, toCsv,
} from '../utils/forecastAudit';

/**
 * Toetst wat de boei niet kan: de vertaling naar de spot. Golfhoogte op de spot
 * vs de foto-schatting, en de NzSurf-kans (en breakfinder-score) vs het oordeel
 * van de surfer in het spotrapport.
 */

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

export function SpotReportAudit({ auditDocs, auditSpotId, onDownload }: {
  auditDocs: AuditForecastDoc[];
  auditSpotId: string;
  onDownload: (name: string, content: string, type: string) => void;
}) {
  const [reports, setReports] = useState<SpotReportLike[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'spotReports'))
      .then(snap => { if (!cancelled) setReports(snap.docs.map(d => d.data() as SpotReportLike)); })
      .catch(e => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => (reports ? reportRows(reports, auditDocs, auditSpotId) : []), [reports, auditDocs, auditSpotId]);
  const sum = useMemo(() => summarizeReports(rows), [rows]);
  const enough = (n: number) => n >= MIN_REPORTS;

  return (
    <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
      <div>
        <div className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-cyan-600" /> Spotkennis getoetst aan spotrapporten</div>
        <p className="text-[11px] text-slate-600 mt-1">
          De boei meet op zee. Wat NzSurf eigen maakt (golfhoogte op de spot, getijvenster, kans) toets je alleen met waarnemingen op het strand:
          de foto in een spotrapport (golfhoogte geschat door AI) en het oordeel van de surfer ("Hoe is het om te surfen?").
          Alle spots tellen mee; breakfinder alleen voor Ouddorp. Onder {MIN_REPORTS} rapporten is het een indicatie, geen conclusie.
        </p>
      </div>

      {error && <p className="text-xs text-rose-700">Kon spotrapporten niet laden: {error}</p>}
      {!reports && !error && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Spotrapporten laden…</div>}

      {reports && (
        <>
          <ul className="space-y-1.5 text-[12px] text-slate-800">
            <li>
              <strong>Golfhoogte op het strand:</strong>{' '}
              {sum.wave
                ? <span className={cn(!enough(sum.wave.n) && 'text-slate-500')}>
                    NzSurf spothoogte wijkt gemiddeld {fmt(sum.wave.maeSpot)} m af van de foto; de ruwe zeehoogte {fmt(sum.wave.maeSea)} m
                    {' '}({sum.wave.n} rapporten). {sum.wave.maeSpot < sum.wave.maeSea ? 'De spotcorrectie helpt.' : sum.wave.maeSpot > sum.wave.maeSea ? 'De spotcorrectie maakt het hier niet beter.' : 'Geen verschil.'}
                  </span>
                : <span className="text-slate-500">nog geen rapporten met foto-schatting en verwachting</span>}
            </li>
            <li>
              <strong>Kans vs oordeel surfer:</strong>{' '}
              {sum.chance
                ? <span className={cn(!enough(sum.chance.n) && 'text-slate-500')}>
                    NzSurf zat {sum.chance.agree}% goed ({sum.chance.n} rapporten; "goed" = kans ≥ 45% en surfer zegt Redelijk/Goed, of allebei niet)
                  </span>
                : <span className="text-slate-500">nog geen rapporten met een oordeel (de vraag staat sinds deze versie in het spotrapport)</span>}
            </li>
            <li>
              <strong>Breakfinder-score vs oordeel (Ouddorp):</strong>{' '}
              {sum.breakfinder
                ? <span className={cn(!enough(sum.breakfinder.n) && 'text-slate-500')}>{sum.breakfinder.agree}% goed ({sum.breakfinder.n} rapporten)</span>
                : <span className="text-slate-500">nog geen Ouddorp-rapporten met oordeel na de start van de audit</span>}
            </li>
            {sum.mismatchRate && (
              <li><strong>AI-oordeel "klopt niet met de verwachting":</strong> {sum.mismatchRate.pct}% van {sum.mismatchRate.n} rapporten</li>
            )}
          </ul>

          {sum.chance && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1 pr-2">NzSurf-kans</th><th className="pr-2 text-right">Rapporten</th><th className="text-right">Surfer: Redelijk/Goed</th>
                </tr></thead>
                <tbody>
                  {sum.chance.byLevel.map(l => (
                    <tr key={l.level} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{l.level}</td><td className="pr-2 text-right">{l.n}</td>
                      <td className="text-right">{l.n ? `${l.works} (${Math.round(l.works / l.n * 100)}%)` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5"><TableHelp>
                <ul>
                  <li>Spotrapporten gegroepeerd op de NzSurf-kans die op dat moment gold.</li>
                  <li><b>Rapporten</b> = hoeveel spotrapporten (met een oordeel van de surfer) in die groep vallen.</li>
                  <li><b>Surfer: Redelijk/Goed</b> = hoeveel daarvan de surfer "Redelijk" of "Goed" noemde. Klopt de kans, dan stijgt dit percentage van boven naar beneden.</li>
                  <li>Onder {MIN_REPORTS} rapporten is het een indicatie, geen conclusie.</li>
                </ul>
              </TableHelp></div>
            </div>
          )}

          <details>
            <summary className="text-[11px] font-bold text-slate-700 cursor-pointer">Alle rapporten ({rows.length})</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1 pr-2">Moment</th><th className="pr-2">Spot</th><th className="pr-2 text-right">Kans</th>
                  <th className="pr-2 text-right">Spot (m)</th><th className="pr-2 text-right">Zee (m)</th><th className="pr-2 text-right">Foto (m)</th><th>Oordeel</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2 whitespace-nowrap">{new Date(r.t).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="pr-2">{r.spotName}</td>
                      <td className="pr-2 text-right">{r.chance ?? '—'}{typeof r.chance === 'number' ? '%' : ''}</td>
                      <td className="pr-2 text-right">{typeof r.spotHs === 'number' ? fmt(r.spotHs, 1) : '—'}</td>
                      <td className="pr-2 text-right">{typeof r.seaHs === 'number' ? fmt(r.seaHs, 1) : '—'}</td>
                      <td className="pr-2 text-right">{typeof r.photoHs === 'number' ? fmt(r.photoHs, 1) : '—'}</td>
                      <td>{r.rating ? RATING_LABELS[r.rating] : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5"><TableHelp>
              <ul>
                <li>Elk spotrapport naast wat NzSurf op dat moment verwachtte (max. 100 rijen; alles staat in de CSV).</li>
                <li><b>Kans</b> = NzSurf-kans. <b>Spot</b> = NzSurf-golfhoogte op de spot, <b>Zee</b> = ruwe golfhoogte op zee, <b>Foto</b> = golfhoogte die de AI op de foto schat.</li>
                <li><b>Oordeel</b> = het antwoord van de surfer op "Hoe is het om te surfen?".</li>
              </ul>
            </TableHelp></div>
          </details>

          <button
            onClick={() => onDownload(`nzsurf-spotrapporten-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map(r => ({
              moment_utc: r.t, spot: r.spotName, spot_id: r.spotId, nzsurf_kans: r.chance ?? '', nzsurf_spothoogte_m: r.spotHs ?? '',
              zeehoogte_m: r.seaHs ?? '', foto_hoogte_m: r.photoHs ?? '', oordeel: r.rating ? RATING_LABELS[r.rating] : '',
              breakfinder_score: r.breakfinder ?? '', ai_match_score: r.matchScore ?? '', ai_klopt_niet: r.mismatch ?? '',
            }))), 'text/csv;charset=utf-8')}
            disabled={!rows.length}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Spotrapporten (CSV)
          </button>
        </>
      )}
    </div>
  );
}
