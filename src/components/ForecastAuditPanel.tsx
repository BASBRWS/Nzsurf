import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Download, Loader2, Trophy, Filter, Camera, Eye } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { db } from '../lib/firebase';
import { SpotReportAudit } from './SpotReportAudit';
import { SurfAuditBoard } from './SurfAuditBoard';
import { canCollectInApp, runAppAuditCollect } from '../services/auditCollector';
import { importSecretSwellScreenshots } from '../services/secretSwellImport';
import { canScanApp, scanAndImportSecretSwell } from '../services/secretSwellAppScan';
import { processSecretSwellScan, scanSecretSwell } from '../services/secretSwellScan';
import { cn } from '../lib/utils';
import { saveFileOrAlert, saveBinaryFile } from '../utils/saveFile';
import { TableHelp } from './TableHelp';
import { buildV2Docs, V2_SOURCE } from '../utils/forecastV2';
import { buildFullReport } from '../utils/auditReport';
import { htmlToPdfBase64 } from '../utils/reportPdf';
import { FileText } from 'lucide-react';
import { WebcamPanel } from './WebcamPanel';
import { loadWebcamMeasurements } from '../services/webcamMeasure';
import { SurfSpot, UserProfile } from '../types';
import { ChanceTestPanel } from './ChanceTestPanel';
import {
  AuditForecastDoc, AuditObsDoc, AuditParam, auditView, cleanObservations, SpotReportLike, PARAMS, LEAD_BUCKETS, LeadBucket, MIN_N,
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
// Auditspots (zie scripts/forecast-audit.ts). Metingen gedeeld (boei Maasgeul 2, wind Europlatform).
// Alle bronnen tellen mee (de aan/uit-knoppen per bron zijn weg).
const hidden = new Set<string>();

const AUDIT_SPOTS = [
  { id: 'ouddorp-p-noordweg', name: 'Ouddorp', buoy: 'boei Maasgeul 2, 20 km van Ouddorp — oudere dagen Schouwenbank, 41 km' },
  { id: 'maasvlakte', name: 'Maasvlakte', buoy: 'boei Maasgeul 2, vlak voor de Maasvlakte (±5 km) — oudere dagen Schouwenbank' },
] as const;
type AuditSpotId = typeof AUDIT_SPOTS[number]['id'];

const fmtNum = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

// Website: download; app: deelmenu (opslaan in Bestanden/Drive, mailen).
const download = saveFileOrAlert;

export function ForecastAuditPanel({ spots = [], user }: { spots?: SurfSpot[]; user?: UserProfile } = {}) {
  const [period, setPeriod] = useState(30);
  const [spotId, setSpotId] = useState<AuditSpotId>(() => {
    try { return (localStorage.getItem('nzs_audit_spot') as AuditSpotId) || 'ouddorp-p-noordweg'; } catch { return 'ouddorp-p-noordweg'; }
  });
  const AUDIT_SPOT_ID = spotId;
  const auditSpot = AUDIT_SPOTS.find(s => s.id === spotId) ?? AUDIT_SPOTS[0];
  const chooseSpot = (id: AuditSpotId) => { setSpotId(id); try { localStorage.setItem('nzs_audit_spot', id); } catch { /* geen opslag */ } };
  const [param, setParam] = useState<AuditParam>('hs');
  const [bucket, setBucket] = useState<LeadBucket | 'all'>('all');
  const [minWind, setMinWind] = useState(0);
  const [minWave, setMinWave] = useState(0);
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
  const [swell, setSwell] = useState<{ busy: boolean; lines?: string[] }>({ busy: false });
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
        // Alleen de gekozen spot (oude documenten zonder spotId horen bij Ouddorp).
        const fc = auditView(fcSnap.docs.map(d => d.data() as AuditForecastDoc)
          .filter(f => (f.spotId || 'ouddorp-p-noordweg') === spotId), spotId);
        const obs = cleanObservations(obsSnap.docs.map(d => d.data() as AuditObsDoc));
        // NzSurf v2: open modellen afgesteld op metingen, per ophaaldag berekend met alleen
        // de kennis van vóór dat moment (zie utils/forecastV2.ts). Vervangt hybride en concept.
        let v2: AuditForecastDoc[] = [];
        try { v2 = buildV2Docs(fc, obs); } catch (e) { console.warn('NzSurf v2 niet berekend', e); }
        setForecasts([...fc, ...v2]);
        setObservations(obs);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [period, spotId]);

  const allPairs = useMemo(() => (forecasts ? buildPairs(forecasts, observations) : []), [forecasts, observations]);
  const sources = useMemo(() => {
    const m = new Map<string, { label: string; kind: string }>();
    // v2 is het live algoritme; v1 blijft in de audit als vast vergelijkingspunt.
    const labelFor = (f: AuditForecastDoc) => f.kind === 'nzsurf' ? 'NzSurf v1 (basis)' : f.source === V2_SOURCE ? 'NzSurf v2 (live in de app)' : f.label;
    (forecasts || []).forEach(f => m.set(f.source, { label: labelFor(f), kind: f.kind }));
    const rank = (id: string, kind: string) => (id === V2_SOURCE ? 0 : kind === 'nzsurf' ? 1 : 2);
    return [...m.entries()].sort((a, b) => rank(a[0], a[1].kind) - rank(b[0], b[1].kind) || a[1].label.localeCompare(b[1].label));
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

  // Rapport over alle auditspots (Ouddorp én Maasvlakte), met grafieken; als PDF of HTML.
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const makeReport = async (kind: 'pdf' | 'html') => {
    setReportBusy('gegevens laden…');
    try {
      // Het rapport gaat altijd over alle gemeten data, los van het periodefilter hierboven.
      const [snap, obsSnap, webcam] = await Promise.all([
        getDocs(collection(db, 'auditForecasts')),
        getDocs(collection(db, 'auditObservations')),
        loadWebcamMeasurements().catch(() => [] as Awaited<ReturnType<typeof loadWebcamMeasurements>>),
      ]);
      const docs = snap.docs.map(d => d.data() as AuditForecastDoc);
      const allObs = cleanObservations(obsSnap.docs.map(d => d.data() as AuditObsDoc));
      const dates = allObs.map(o => o.date).sort();
      const fmtD = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');
      const periodLabel = `alle gemeten data (${fmtD(dates[0])} t/m ${fmtD(dates[dates.length - 1])})`;
      setReportBusy('rekenen…');
      const spots = AUDIT_SPOTS.map(sp => {
        const fc = auditView(docs.filter(f => (f.spotId || 'ouddorp-p-noordweg') === sp.id), sp.id);
        let extra: AuditForecastDoc[] = [];
        try { extra = buildV2Docs(fc, allObs); } catch (e) { console.warn('NzSurf v2 niet berekend', e); }
        return { id: sp.id, name: sp.name, forecasts: [...fc, ...extra], buoyNote: sp.buoy };
      });
      const webcamSites = [...docs.filter(f => f.spotId === 'maasvlakte'), ...(spots.find(x => x.id === 'maasvlakte')?.forecasts.filter(f => f.source === V2_SOURCE) || [])];
      const { html } = buildFullReport({ spots, observations: allObs, reports: reports || [], webcam, webcamSites, periodLabel });
      if (kind === 'html') { download(`nzsurf-rapport-${stamp}.html`, html, 'text/html;charset=utf-8'); return; }
      const b64 = await htmlToPdfBase64(html, st => setReportBusy(st));
      setReportBusy('opslaan…');
      await saveBinaryFile(`nzsurf-rapport-${stamp}.pdf`, b64, 'application/pdf');
    } catch (e: any) {
      window.alert(`Rapport maken mislukt: ${e?.message || e}`);
    } finally {
      setReportBusy(null);
    }
  };

  return (
    <div className="bg-white/90 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-5">
      <div>
        <h3 className="text-lg font-black uppercase text-slate-900 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Voorspellingsaudit — {auditSpot.name}</h3>
        <div className="flex gap-1 mt-2">
          {AUDIT_SPOTS.map(sp => (
            <button key={sp.id} onClick={() => chooseSpot(sp.id)}
              className={cn('text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer', sp.id === spotId ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300')}>
              {sp.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Elke dag legt een workflow de verwachtingen van alle bronnen vast (de eerste ophaalronde van de dag); 4× per dag vult hij de metingen van Rijkswaterstaat aan (golven: {auditSpot.buoy}; wind: Europlatform). De Maasvlakte wordt sinds 20 okt 2026 vastgelegd.
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
          <p className="text-[11px] text-slate-500">Opent ±40–120 s een browservenster (Ouddorp én Maasvlakte). Verschijnt er een Cloudflare-vinkje ("Ik ben een mens"), tik dat dan aan. De app vraagt hier ook 1x per dag om bij openen.</p>
          {appCollect.results && <ul className="text-[11px] font-mono text-slate-700">{appCollect.results.map(r => <li key={r}>{r}</li>)}</ul>}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Surfline en surfnerd worden opgehaald door de Android-app (browservenster, 1x per dag); op de website kan dat niet.</p>
      )}

      {/* Secret Swell heeft alleen een app: schermafbeelding → AI → bron "secretswell". */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
        {canScanApp() && (
          <button disabled={swell.busy} onClick={async () => {
            setSwell({ busy: true, lines: ['Even toestemming geven…'] });
            try {
              const r = await scanAndImportSecretSwell(st => setSwell({ busy: true, lines: [st] }));
              setSwell({ busy: false, lines: [`✓ ${r.points} punten opgeslagen (meegekeken)`, ...r.summary] });
            } catch (err: any) {
              setSwell({ busy: false, lines: String(err?.message || err).split(' | ').map(l => (l.startsWith('✗') ? l : `✗ ${l}`)) });
            }
          }} className="mr-2 mb-1 text-xs font-bold px-3 py-2 rounded-xl bg-cyan-700 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            {swell.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Scan Secret Swell
          </button>
        )}
        {Capacitor.isNativePlatform() && (
          <>
            <button disabled={swell.busy} onClick={async () => {
              setSwell({ busy: true, lines: ['Secret Swell open: log in, open Ouddorp en de Maasvlakte en scroll rustig door de verwachting. Sluit het venster als je klaar bent.'] });
              try {
                const snaps = await scanSecretSwell(n => setSwell({ busy: true, lines: [`${n} scherm${n === 1 ? '' : 'en'} gezien…`] }));
                setSwell({ busy: true, lines: [`${snaps.length} schermen gezien; aflezen…`] });
                const r = await processSecretSwellScan(snaps, step => setSwell({ busy: true, lines: [step] }));
                setSwell({ busy: false, lines: [`✓ ${r.points} punten opgeslagen (meegekeken)`, ...r.summary] });
              } catch (err: any) {
                setSwell({ busy: false, lines: String(err?.message || err).split(' | ').map(l => (l.startsWith('✗') ? l : `✗ ${l}`)) });
              }
            }} className="mr-2 text-xs font-bold px-3 py-2 rounded-xl bg-cyan-700 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {swell.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Scan Secret Swell
            </button>
          </>
        )}
        <label className={cn('text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 text-white inline-flex items-center gap-1.5 cursor-pointer', swell.busy && 'opacity-50 pointer-events-none')}>
          {swell.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Secret Swell: schermafbeelding(en) toevoegen
          <input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
            const files = [...(e.target.files || [])];
            e.target.value = '';
            if (!files.length) return;
            setSwell({ busy: true });
            try {
              const r = await importSecretSwellScreenshots(files);
              setSwell({ busy: false, lines: [`✓ ${r.points} punten opgeslagen`, ...r.summary] });
            } catch (err: any) {
              // Eén regel per overgeslagen schermafbeelding, zonder dubbel ✗.
              setSwell({ busy: false, lines: String(err?.message || err).split(' | ').map(l => (l.startsWith('✗') ? l : `✗ ${l}`)) });
            }
          }} />
        </label>
        <p className="text-[11px] text-slate-500">
          <b>Scan</b> (Android-app): opent de Secret Swell-webapp in NzSurf; scroll door Ouddorp en de Maasvlakte, NzSurf leest mee. Sluit het venster om op te slaan.
          Lukt dat niet, of op de website: maak 's ochtends in Secret Swell schermafbeeldingen van Ouddorp en/of de Maasvlakte: het dashboard en/of de spotpagina met de uurtabel
          (doorscrollen mag; kies ze allemaal in één keer, beide spots door elkaar). De AI leest de spotnaam en de getallen en koppelt elke
          schermafbeelding aan de juiste spot; controleer ze hieronder. Andere spots worden overgeslagen. Latere uploads op dezelfde dag vullen aan.
        </p>
        {swell.lines && <ul className="text-[11px] font-mono text-slate-700">{swell.lines.map(l => <li key={l}>{l}</li>)}</ul>}
      </div>

      {/* Webcam Maasvlakte: golf aan het strand naast de boei Maasgeul 2. */}
      <WebcamPanel observations={observations} onDownload={download} enabled={canCollectInApp()} spots={spots} />

      {/* Kans tegen werkelijkheid: NzSurf nu, test (persoonlijk) en NzSurf v2 tegen het webcamoordeel. */}
      {user && <ChanceTestPanel user={user} spots={spots} audit={forecasts || []} />}

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

          {/* Filters: per regel één keuze, direct zichtbaar (geen uitklaplijsten). */}
          {(() => {
            const short = (l: string) => l.replace(/^Wind ≥ /, '≥ ').replace(/^Golf ≥ /, '≥ ').replace(/^Alle wind$|^Alle golven$|^Alle looptijden$/, 'Alles').replace(/ \(.*\)$/, '');
            const rows: { name: string; value: string; set: (v: string) => void; opts: { v: string; l: string }[] }[] = [
              { name: 'Variabele', value: param, set: v => setParam(v as AuditParam), opts: PARAMS.map(p => ({ v: p.key, l: p.key === 'tpPeak' ? 'Piekperiode' : p.label })) },
              { name: 'Periode', value: String(period), set: v => setPeriod(Number(v)), opts: PERIODS.map(p => ({ v: String(p.key), l: p.label })) },
              { name: 'Vooruit', value: bucket, set: v => setBucket(v as LeadBucket | 'all'), opts: [{ v: 'all', l: 'Alles' }, ...LEAD_BUCKETS.map(b => ({ v: b.key, l: short(b.label) }))] },
              { name: 'Wind', value: String(minWind), set: v => setMinWind(Number(v)), opts: WIND_FILTERS.map(f => ({ v: String(f.key), l: short(f.label) })) },
              { name: 'Golf', value: String(minWave), set: v => setMinWave(Number(v)), opts: WAVE_FILTERS.map(f => ({ v: String(f.key), l: short(f.label) })) },
            ];
            const changed = period !== 30 || bucket !== 'all' || minWind !== 0 || minWave !== 0;
            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"><Filter className="w-3.5 h-3.5" /> Filters</div>
                  {changed && (
                    <button onClick={() => { setPeriod(30); setBucket('all'); setMinWind(0); setMinWave(0); }}
                      className="text-[12px] underline underline-offset-2 text-slate-600 cursor-pointer">standaard</button>
                  )}
                </div>
                {rows.map(r => (
                  <div key={r.name} className="flex items-start gap-2">
                    <span className="w-[64px] shrink-0 pt-2 text-[12px] font-semibold text-slate-500">{r.name}</span>
                    <div role="radiogroup" aria-label={r.name} className="flex gap-1.5 overflow-x-auto pb-1 -mr-3 pr-3 [scrollbar-width:none]">
                      {r.opts.map(o => {
                        const on = o.v === r.value;
                        return (
                          <button key={o.v} role="radio" aria-checked={on} onClick={() => r.set(o.v)}
                            className={cn('shrink-0 min-h-[36px] px-3 rounded-full border text-[13px] whitespace-nowrap cursor-pointer transition-colors',
                              on ? 'bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)] border-[color:var(--tide-ink)] font-semibold' : 'bg-white text-slate-700 border-slate-300')}>
                            {o.l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

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
                <li><b>Bias</b> = structureel te hoog (+) of te laag (−). Zitten alle bronnen aan dezelfde kant, dan ligt dat vaak aan de meetplek: de boei ligt verder op zee dan de rekenpunten bij de kust.</li>
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
            <button disabled={!!reportBusy} onClick={() => makeReport('pdf')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-cyan-600 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              {reportBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} {reportBusy || 'Rapport (PDF)'}</button>
            <button disabled={!!reportBusy} onClick={() => makeReport('html')}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-cyan-600 text-cyan-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"><FileText className="w-3.5 h-3.5" /> Rapport (HTML)</button>
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
          <p className="text-[10px] text-slate-500">Het rapport (PDF/HTML) gaat altijd over alle gemeten data van Ouddorp en de Maasvlakte; de periode en filters hierboven gelden alleen voor dit scherm en de CSV-exports.</p>
          <p className="text-[10px] text-slate-500">CSV gebruikt puntkomma's en decimale komma's en opent direct in Excel. In de app opent een export het deelmenu: kies "Opslaan in Bestanden", Drive of mail.</p>

          <SpotReportAudit reports={reports} reportsError={reportsError} auditDocs={forecasts} auditSpotId={AUDIT_SPOT_ID} onDownload={download} />
        </>
      )}
    </div>
  );
}
