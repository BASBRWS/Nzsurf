import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Download, Loader2, Trophy, Filter } from 'lucide-react';
import { db } from '../lib/firebase';
import { SpotReportAudit } from './SpotReportAudit';
import { SurfAuditBoard } from './SurfAuditBoard';
import { canCollectInApp, runAppAuditCollect } from '../services/auditCollector';
import { cn } from '../lib/utils';
import { saveFileOrAlert } from '../utils/saveFile';
import { TableHelp } from './TableHelp';
import {
  AuditForecastDoc, AuditObsDoc, AuditParam, cleanObservations, SpotReportLike, PARAMS, LEAD_BUCKETS, LeadBucket, MIN_N,
  buildPairs, scorePairs, toCsv, Pair,
} from '../utils/forecastAudit';

/**
 * Beta: voorspellingsaudit voor Ouddorp. Wie voorspelt welk onderdeel het best,
 * per vooruitkijktijd — met filters en export (CSV voor Excel, JSON).
 */

const PERIODS = [
  { key: 7, label: '7 dagen' },
  { key: 30, label: '30 dagen' },
  { key: 90, label: '90 dagen' },
  { key: 0, label: 'Alles' },
];
const WIND_FILTERS = [
  { key: 0, label: 'Alle wind' }, { key: 10, label: 'Wind ≥ 10 kn' }, { key: 16, label: 'Wind ≥ 16 kn' }, { key: 22, label: 'Wind ≥ 22 kn' },
];
const WAVE_FILTERS = [
  { key: 0, label: 'Alle golven' }, { key: 0.5, label: 'Golf ≥ 0,5 m' }, { key: 1, label: 'Golf ≥ 1 m' }, { key: 1.5, label: 'Golf ≥ 1,5 m' },
];

// De audit draait voor Ouddorp (zie scripts/forecast-audit.ts).
const AUDIT_SPOT_ID = 'ouddorp-p-noordweg';

const fmtNum = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

// Website: download; app: deelmenu (opslaan in Bestanden/Drive, mailen).
const download = saveFileOrAlert;

export function ForecastAuditPanel() {
  const [period, setPeriod] = useState(30);
  const [param, setParam] = useState<AuditParam>('hs');
  const [bucket, setBucket] = useState<LeadBucket | 'all'>('all');
  const [minWind, setMinWind] = useState(0);
  const [minWave, setMinWave] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [forecasts, setForecasts] = useState<AuditForecastDoc[] | null>(null);
  const [observations, setObservations] = useState<AuditObsDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Spotrapporten: de echte strandtoets ("Hoe is het om te surfen?") en de foto-schatting.
  const [reports, setReports] = useState<SpotReportLike[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'spotReports'))
      .then(snap => { if (!cancelled) setReports(snap.docs.map(d => d.data() as SpotReportLike)); })
      .catch(e => { if (!cancelled) setReportsError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);
  const [appCollect, setAppCollect] = useState<{ busy: boolean; results?: string[] }>({ busy: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setForecasts(null); setError(null);
      try {
        const from = period ? new Date(Date.now() - period * 86400e3).toISOString().slice(0, 10) : '0000';
        // Verwachtingen tot 7 dagen vóór de periode tellen mee (hun doel valt erin).
        const fcFrom = period ? new Date(Date.now() - (period + 7) * 86400e3).toISOString().slice(0, 10) : '0000';
        const [fcSnap, obsSnap] = await Promise.all([
          getDocs(query(collection(db, 'auditForecasts'), where('runDate', '>=', fcFrom))),
          getDocs(query(collection(db, 'auditObservations'), where('date', '>=', from))),
        ]);
        if (cancelled) return;
        setForecasts(fcSnap.docs.map(d => d.data() as AuditForecastDoc));
        setObservations(cleanObservations(obsSnap.docs.map(d => d.data() as AuditObsDoc)));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const allPairs = useMemo(() => (forecasts ? buildPairs(forecasts, observations) : []), [forecasts, observations]);
  const sources = useMemo(() => {
    const m = new Map<string, { label: string; kind: string }>();
    (forecasts || []).forEach(f => m.set(f.source, { label: f.label, kind: f.kind }));
    return [...m.entries()].sort((a, b) => (a[1].kind === 'nzsurf' ? -1 : b[1].kind === 'nzsurf' ? 1 : a[1].label.localeCompare(b[1].label)));
  }, [forecasts]);

  const visibleSources = useMemo(
    () => sources.filter(([id]) => !hidden.has(id)).map(([id, s]) => ({ source: id, label: s.label, kind: s.kind })),
    [sources, hidden],
  );

  // Filters (zonder het onderdeel) — gebruikt voor de "ons algo vs de rest"-samenvatting.
  const condPairs = useMemo(() => allPairs.filter(p =>
    !hidden.has(p.source)
    && (bucket === 'all' || p.bucket === bucket)
    && (!minWind || (p.obsWindKn ?? -1) >= minWind)
    && (!minWave || (p.obsHs ?? -1) >= minWave)
  ), [allPairs, hidden, bucket, minWind, minWave]);
  const pairs = useMemo(() => condPairs.filter(p => p.param === param), [condPairs, param]);
  const ranking = useMemo(() => scorePairs(pairs), [pairs]);

  // Matrix: MAE per bron × vooruitkijktijd voor het gekozen onderdeel (zonder bucketfilter).
  const matrix = useMemo(() => {
    const base = allPairs.filter(p => p.param === param && !hidden.has(p.source)
      && (!minWind || (p.obsWindKn ?? -1) >= minWind) && (!minWave || (p.obsHs ?? -1) >= minWave));
    const out = new Map<string, Map<string, { mae: number; n: number }>>();
    for (const b of LEAD_BUCKETS) {
      for (const s of scorePairs(base.filter(p => p.bucket === b.key))) {
        if (!out.has(s.source)) out.set(s.source, new Map());
        out.get(s.source)!.set(b.key, { mae: s.mae, n: s.n });
      }
    }
    return out;
  }, [allPairs, param, hidden, minWind, minWave]);

  const summary = useMemo(() => PARAMS.map(prm => {
    const sc = scorePairs(condPairs.filter(p => p.param === prm.key)).filter(s => s.n >= MIN_N);
    const ours = sc.find(s => s.kind === 'nzsurf');
    const bestOther = sc.find(s => s.kind !== 'nzsurf');
    const rank = ours ? sc.indexOf(ours) + 1 : null;
    return { prm, ours, bestOther, rank, total: sc.length };
  }), [condPairs]);

  const prm = PARAMS.find(p => p.key === param)!;
  const exportRows = (rows: Pair[]) => rows.map(p => ({
    bron: p.label, bron_id: p.source, verwacht_op: p.runDate, geldig_utc: p.t, uren_vooruit: p.lead, looptijd: p.bucket,
    onderdeel: p.param, verwachting: p.fc, meting: p.obs, fout: p.err, gemeten_wind_kn: p.obsWindKn ?? '', gemeten_golf_m: p.obsHs ?? '',
  }));
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white/90 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-5">
      <div>
        <h3 className="text-lg font-black uppercase text-slate-900 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Voorspellingsaudit — Ouddorp</h3>
        <p className="text-xs text-slate-600 mt-1">
          Elke dag legt een workflow de verwachtingen van alle bronnen vast (de eerste ophaalronde van de dag); 4× per dag vult hij de metingen van Rijkswaterstaat aan (golven Schouwenbank, wind Europlatform).
          Fout = verwachting − meting. MAE = gemiddelde afwijking, bias = structureel te hoog (+) of te laag (−).
          Onder {MIN_N} metingen is een score nog niet betrouwbaar.
        </p>
      </div>

      {/* Surfline en surfnerd weren de GitHub-servers; de app op de telefoon haalt ze op. */}
      {canCollectInApp() ? (
        <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
          <button
            disabled={appCollect.busy}
            onClick={async () => {
              setAppCollect({ busy: true });
              const results = await runAppAuditCollect().catch((e: any) => [`fout: ${e?.message || e}`]);
              setAppCollect({ busy: false, results: results || [] });
            }}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {appCollect.busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Surfline &amp; surfnerd nu ophalen
          </button>
          <p className="text-[11px] text-slate-500">Opent ±20–60 s een browservenster. Verschijnt er een Cloudflare-vinkje ("Ik ben een mens"), tik dat dan aan. De app vraagt hier ook 1x per dag om bij openen.</p>
          {appCollect.results && <ul className="text-[11px] font-mono text-slate-700">{appCollect.results.map(r => <li key={r}>{r}</li>)}</ul>}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Surfline en surfnerd worden opgehaald door de Android-app (browservenster, 1x per dag); op de website kan dat niet.</p>
      )}

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">Kon de auditdata niet laden: {error}</p>}
      {!forecasts && !error && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Laden…</div>}

      {forecasts && (
        <>
          <p className="text-[11px] font-mono text-slate-500">
            {new Set(forecasts.map(f => f.runDate)).size} ophaaldagen · {forecasts.length} verwachtingen · {observations.length} meetdagen · {allPairs.length} vergelijkingen
          </p>

          {/* Status laatste ophaalronde per bron (kapotte uitlezer valt hier op) */}
          {(() => {
            const lastRun = [...new Set(forecasts.map(f => f.runDate))].sort().pop();
            const latest = forecasts.filter(f => f.runDate === lastRun);
            return latest.length ? (
              <details className="rounded-xl border border-slate-200 p-3">
                <summary className="text-xs font-bold text-slate-700 cursor-pointer">Laatste ophaalronde ({lastRun}): {latest.filter(f => f.points?.length).length} van {latest.length} bronnen met data</summary>
                <ul className="mt-2 space-y-0.5 text-[11px] font-mono text-slate-600">
                  {latest.sort((a, b) => a.label.localeCompare(b.label)).map(f => (
                    <li key={f.source}>{f.points?.length ? '✓' : '✗'} {f.label}: {f.points?.length || 0} punten{f.note ? ` — ${f.note}` : ''}</li>
                  ))}
                </ul>
              </details>
            ) : null;
          })()}

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-slate-500"><Filter className="w-3 h-3" /> Filters</div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: period, set: (v: string) => setPeriod(Number(v)), opts: PERIODS.map(p => ({ v: p.key, l: p.label })) },
                { value: param, set: (v: string) => setParam(v as AuditParam), opts: PARAMS.map(p => ({ v: p.key, l: p.label })) },
                { value: bucket, set: (v: string) => setBucket(v as any), opts: [{ v: 'all', l: 'Alle looptijden' }, ...LEAD_BUCKETS.map(b => ({ v: b.key, l: b.label }))] },
                { value: minWind, set: (v: string) => setMinWind(Number(v)), opts: WIND_FILTERS.map(f => ({ v: f.key, l: f.label })) },
                { value: minWave, set: (v: string) => setMinWave(Number(v)), opts: WAVE_FILTERS.map(f => ({ v: f.key, l: f.label })) },
              ].map((f, i) => (
                <select key={i} value={String(f.value)} onChange={e => f.set(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                  {f.opts.map(o => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
                </select>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sources.map(([id, s]) => (
                <button key={id} onClick={() => setHidden(h => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  className={cn('text-[11px] px-2 py-1 rounded-full border cursor-pointer',
                    hidden.has(id) ? 'bg-white text-slate-400 border-slate-200 line-through' : s.kind === 'nzsurf' ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-slate-100 text-slate-800 border-slate-300')}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Is er te surfen? Verwachting, variabelen, werkelijkheid en score per voorspeller */}
          <SurfAuditBoard forecasts={forecasts} observations={observations} sources={visibleSources} reports={reports || []} spotId={AUDIT_SPOT_ID} />

          {/* Ons algo vs de rest */}
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-3">
            <div className="text-xs font-black uppercase text-cyan-900 mb-2">Ons algoritme vs de rest (met huidige filters)</div>
            <ul className="space-y-1 text-[12px] text-slate-800">
              {summary.map(({ prm: p, ours, bestOther, rank, total }) => (
                <li key={p.key}>
                  <strong>{p.label}:</strong>{' '}
                  {ours
                    ? <>NzSurf #{rank} van {total} (MAE {fmtNum(ours.mae)} {p.unit}){bestOther && bestOther.source !== ours.source ? <> · beste andere: {bestOther.label} ({fmtNum(bestOther.mae)} {p.unit})</> : null}</>
                    : <span className="text-slate-500">nog te weinig data</span>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-600 mt-2">
              Let op bij het lezen: NzSurf haalt zijn ruwe cijfers zelf bij Open-Meteo (golven: standaard golfmodel, wind: GFS).
              Op golfhoogte, periode en wind volgt NzSurf dus vooral die bronnen. Wat NzSurf eigen maakt (spothoogte, getij, kans) meet de boei niet;
              dat staat hieronder bij de spotrapporten. Gebruik de ranglijst om het beste model voor NzSurf te kiezen.
            </p>
            <div className="mt-2"><TableHelp title="Zo lees je dit">
              <ul>
                <li><b>#3 van 9</b> = NzSurf staat op plek 3 van de 9 bronnen met genoeg vergelijkingen (minstens {MIN_N}) voor dat onderdeel.</li>
                <li><b>MAE</b> = hoeveel de verwachting gemiddeld naast de meting zat. Lager is beter.</li>
                <li><b>Beste andere</b> = de best scorende bron die niet NzSurf is.</li>
                <li>De filters bovenaan (periode, looptijd, wind, golf, bronnen) tellen mee.</li>
              </ul>
            </TableHelp></div>
          </div>

          {/* Ranglijst */}
          <div>
            <div className="text-xs font-black uppercase text-slate-900 mb-1">Ranglijst: {prm.label} {prm.note ? <span className="font-normal normal-case text-slate-500">({prm.note})</span> : null}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2">#</th><th className="pr-2">Bron</th><th className="pr-2 text-right">n</th>
                  <th className="pr-2 text-right">MAE ({prm.unit})</th><th className="pr-2 text-right">Bias</th><th className="text-right">RMSE</th>
                </tr></thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.source} className={cn('border-b border-slate-100', r.kind === 'nzsurf' && 'bg-cyan-50 font-bold', r.n < MIN_N && 'text-slate-400')}>
                      <td className="py-1.5 pr-2">{i + 1}</td><td className="pr-2">{r.label}</td><td className="pr-2 text-right">{r.n}</td>
                      <td className="pr-2 text-right">{fmtNum(r.mae)}</td><td className="pr-2 text-right">{r.bias > 0 ? '+' : ''}{fmtNum(r.bias)}</td><td className="text-right">{fmtNum(r.rmse)}</td>
                    </tr>
                  ))}
                  {!ranking.length && <tr><td colSpan={6} className="py-3 text-slate-500">Nog geen vergelijkingen voor deze filters. De eerste uitslagen verschijnen een dag na de eerste opgeslagen verwachting.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5"><TableHelp>
              <p>Alle vergelijkingen samen, ongeacht hoe ver vooruit er voorspeld werd: het eindcijfer per voorspeller. Kies bij de filters een ander onderdeel (golfperiode, wind, …) of één looptijd.</p>
              <ul>
                <li><b>n</b> = aantal uren waarvoor zowel een verwachting als een meting is. Een bron die elk uur een waarde geeft (Windfinder Superforecast) heeft een hogere n dan een bron met één waarde per 3 uur.</li>
                <li><b>MAE</b> = gemiddelde afwijking: hoeveel de verwachting gemiddeld naast de meting zat. Lager is beter; hierop is gesorteerd.</li>
                <li><b>Bias</b> = structureel te hoog (+) of te laag (−). Zitten alle bronnen aan dezelfde kant, dan ligt dat vaak aan de meetplek: boei Schouwenbank ligt verder op zee dan de rekenpunten bij de kust.</li>
                <li><b>RMSE</b> = als MAE, maar grote missers wegen zwaarder. Ligt RMSE dicht bij MAE, dan waren er geen uitschieters.</li>
                <li><b>Grijs</b> = minder dan {MIN_N} vergelijkingen: staat erbij, maar is nog niet betrouwbaar.</li>
                <li>Verschillen van een paar centimeter na een paar dagen zeggen weinig; pas na weken met verschillend weer wordt het een conclusie.</li>
                <li>Dit is de golf <b>op zee</b>, niet op het strand. De spothoogte en kans van NzSurf worden onderaan getoetst met spotrapporten.</li>
              </ul>
            </TableHelp></div>
          </div>

          {/* Fout per vooruitkijktijd */}
          <div>
            <div className="text-xs font-black uppercase text-slate-900 mb-1">MAE per vooruitkijktijd: {prm.label}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-1 pr-2">Bron</th>{LEAD_BUCKETS.map(b => <th key={b.key} className="text-right pr-2">{b.label.replace(/ \(.*\)/, '')}</th>)}
                </tr></thead>
                <tbody>
                  {sources.filter(([id]) => matrix.has(id)).map(([id, s]) => (
                    <tr key={id} className={cn('border-b border-slate-100', s.kind === 'nzsurf' && 'bg-cyan-50 font-bold')}>
                      <td className="py-1 pr-2">{s.label}</td>
                      {LEAD_BUCKETS.map(b => {
                        const c = matrix.get(id)?.get(b.key);
                        return <td key={b.key} className={cn('text-right pr-2', c && c.n < MIN_N && 'text-slate-400')}>{c ? fmtNum(c.mae) : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5"><TableHelp>
              <p>Dezelfde MAE als in de ranglijst, maar uitgesplitst naar hoe ver vooruit de verwachting is gedaan. Zo zie je hoe snel een voorspeller minder nauwkeurig wordt.</p>
              <ul>
                <li><b>Dag 1</b> = verwachtingen voor 0–24 uur na het ophalen, <b>Dag 2</b> = 24–48 uur vooruit, enz.</li>
                <li>Normaal loopt de fout op van links naar rechts. Wie langer laag blijft, is verder vooruit betrouwbaar.</li>
                <li><b>—</b> = nog niet te scoren: een verwachting voor over 5 dagen kan pas vergeleken worden als die dag voorbij en gemeten is. Deze kolommen vullen zich vanzelf.</li>
                <li><b>Grijs</b> = minder dan {MIN_N} vergelijkingen in dat vak.</li>
              </ul>
            </TableHelp></div>
          </div>

          {/* Export */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => download(`nzsurf-audit-vergelijkingen-${stamp}.csv`, toCsv(exportRows(condPairs)), 'text/csv;charset=utf-8')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Vergelijkingen (CSV, gefilterd)</button>
            <button onClick={() => download(`nzsurf-audit-ranglijst-${param}-${stamp}.csv`, toCsv(ranking.map(r => ({ bron: r.label, onderdeel: r.param, n: r.n, mae: r.mae, bias: r.bias, rmse: r.rmse }))), 'text/csv;charset=utf-8')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Ranglijst (CSV)</button>
            <button onClick={() => download(`nzsurf-audit-per-looptijd-${param}-${stamp}.csv`, toCsv(sources.filter(([id]) => matrix.has(id)).map(([id, s]) => Object.fromEntries([
                ['bron', s.label],
                ...LEAD_BUCKETS.flatMap(b => { const c = matrix.get(id)?.get(b.key); return [[`${b.label} mae`, c ? c.mae : ''], [`${b.label} n`, c ? c.n : 0]]; }),
              ]))), 'text/csv;charset=utf-8')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Per looptijd (CSV)</button>
            <button onClick={() => download(`nzsurf-audit-ruw-${stamp}.json`, JSON.stringify({ forecasts, observations }, null, 1), 'application/json')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Ruwe data (JSON)</button>
          </div>
          <p className="text-[10px] text-slate-500">CSV gebruikt puntkomma's en decimale komma's en opent direct in Excel. In de app opent een export het deelmenu: kies "Opslaan in Bestanden", Drive of mail.</p>

          <SpotReportAudit reports={reports} reportsError={reportsError} auditDocs={forecasts} auditSpotId={AUDIT_SPOT_ID} onDownload={download} />
        </>
      )}
    </div>
  );
}
