import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Waves, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { saveFileOrAlert } from '../utils/saveFile';
import { TableHelp } from './TableHelp';
import { degreesToCompass16 } from '../utils/spotKnowledge';
import { knotsToBft } from '../utils/surfMoments';
import { AuditForecastDoc, AuditObsDoc, MIN_N, SpotReportLike, toCsv } from '../utils/forecastAudit';
import {
  COMPONENTS, ComponentKey, DEFAULT_RULE, FULL_PARTS, OWN_VERDICT_SOURCES, SurfRule, TM02_TO_TP, TruthFn,
  combinedTruth, componentRanking, consensusTruth, obsTruth, overallRanking, partialComparison, reportTruth, reportsAt,
  componentScores, daySlots, forecastVerdict, obsIndex, observedVerdict, outlook, pointFor, stability, windAngle,
} from '../utils/surfVerdict';

/**
 * Beta → Voorspellingsaudit: "Is er te surfen?" — vier tabellen.
 * 1 Verwachting (5 dagen), 2 Variabelen achter het oordeel, 3 Werkelijkheid (RWS),
 * 4 Score per onderdeel + hoe vroeg het oordeel klopte en of het bleef staan.
 * Alles wordt berekend uit de dagelijks opgeslagen historie (auditForecasts/-Observations).
 */

type Src = { source: string; label: string; kind: string };
type Tab = 'outlook' | 'vars' | 'truth' | 'score';
const TABS: { key: Tab; label: string }[] = [
  { key: 'outlook', label: '1 Verwachting' },
  { key: 'vars', label: '2 Variabelen' },
  { key: 'truth', label: '3 Werkelijkheid' },
  { key: 'score', label: '4 Ranglijst' },
];
// v2: standaard max zijwind 25 → 20 kn; een oude opgeslagen regel telt niet meer.
const RULE_KEY = 'nzs_audit_rule_v2';
const TRUTH_KEY = 'nzs_audit_truth';
type TruthMode = 'combined' | 'reports' | 'obs' | 'consensus';
const TRUTH_MODES: { key: TruthMode; label: string; help: string }[] = [
  { key: 'combined', label: 'Surfers, dan metingen, dan groep', help: 'Is er een spotrapport met oordeel (binnen 1,5 uur), dan telt de surfer; anders de meting; anders het eindoordeel van de groep.' },
  { key: 'reports', label: 'Alleen surfers (spotrapporten)', help: 'Alleen momenten met een spotrapport met oordeel ("Redelijk"/"Goed" = te surfen) tellen mee. De eerlijkste toets, maar er zijn nog weinig rapporten.' },
  { key: 'obs', label: 'Alleen metingen (RWS)', help: 'Alleen tijdstippen met een meting tellen mee.' },
  { key: 'consensus', label: 'Eindoordeel van de groep', help: 'Meerderheid van de voorspellers op het moment zelf (zonder de beoordeelde voorspeller).' },
];

const nl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const fmtDay = (d: Date) => d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dash = <span className="text-slate-300">—</span>;

function Verdict({ ok, own }: { ok?: boolean; own?: boolean }) {
  if (ok === undefined) return dash;
  return (
    <span className={cn('inline-block rounded-full px-1.5 py-0.5 font-bold', ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>
      {ok ? 'ja' : 'nee'}{own === false && <sup className="font-normal">r</sup>}
    </span>
  );
}

const thCls = 'text-right px-1.5 font-semibold';
const stickyTd = (nz: boolean) => cn('py-1 pr-2 sticky left-0 whitespace-nowrap', nz ? 'bg-cyan-50 font-bold' : 'bg-white');

export function SurfAuditBoard({ forecasts, observations, sources, reports = [], spotId, initialTab = 'outlook' }: {
  forecasts: AuditForecastDoc[];
  observations: AuditObsDoc[];
  sources: Src[];
  /** Spotrapporten (alle spots); alleen die van `spotId` met een oordeel tellen. */
  reports?: SpotReportLike[];
  spotId: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [dayOffset, setDayOffset] = useState(0);
  const [slotIdx, setSlotIdx] = useState(0);
  const [leadFilter, setLeadFilter] = useState(0); // 0 = alle vooruitkijkdagen
  const [rule, setRule] = useState<SurfRule>(() => {
    try { return { ...DEFAULT_RULE, ...JSON.parse(localStorage.getItem(RULE_KEY) || '{}') }; } catch { return DEFAULT_RULE; }
  });
  useEffect(() => { try { localStorage.setItem(RULE_KEY, JSON.stringify(rule)); } catch { /* geen opslag */ } }, [rule]);
  const [truthMode, setTruthMode] = useState<TruthMode>(() => {
    try { return (localStorage.getItem(TRUTH_KEY) as TruthMode) || 'combined'; } catch { return 'combined'; }
  });
  useEffect(() => { try { localStorage.setItem(TRUTH_KEY, truthMode); } catch { /* geen opslag */ } }, [truthMode]);
  const [rankKey, setRankKey] = useState<ComponentKey>('total');

  const now = Date.now();
  const ids = sources.map(s => s.source);
  const labelOf = (id: string) => sources.find(s => s.source === id)?.label || id;
  const isNz = (id: string) => sources.find(s => s.source === id)?.kind === 'nzsurf';

  const day = useMemo(() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);
  const slots = useMemo(() => daySlots(day), [day]);
  const slot = slots[Math.min(slotIdx, slots.length - 1)];
  const idx = useMemo(() => obsIndex(observations), [observations]);

  const outlookDays = useMemo(() => [0, 1, 2, 3, 4].map(o => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + o); return d; }), []);
  const out = useMemo(() => outlook(forecasts, ids, outlookDays, now, rule),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, ids.join(), rule]);
  // Werkelijkheid voor "te surfen?" (de variabelen gaan altijd tegen de metingen).
  const consensus = useMemo(() => consensusTruth(forecasts, ids, rule, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, ids.join(), rule]);
  const measured = useMemo(() => obsTruth(observations, rule), [observations, rule]);
  const surfers = useMemo(() => reportTruth(reports, spotId), [reports, spotId]);
  const ratedReports = useMemo(() => reports.filter(r => r.spotId === spotId && r.userRating).length, [reports, spotId]);
  const truthFn: TruthFn = useMemo(
    () => (truthMode === 'obs' ? measured : truthMode === 'consensus' ? consensus : truthMode === 'reports' ? surfers : combinedTruth(surfers, measured, consensus)),
    [truthMode, measured, consensus, surfers],
  );
  const scores = useMemo(() => componentScores(forecasts, observations, rule, truthFn, leadFilter || undefined), [forecasts, observations, rule, truthFn, leadFilter]);
  const stab = useMemo(() => stability(forecasts, ids, rule, truthFn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, ids.join(), rule, truthFn]);
  const overall = useMemo(() => overallRanking(scores).filter(r => r.parts >= FULL_PARTS), [scores]);
  const nzId = sources.find(s => s.kind === 'nzsurf')?.source || 'nzsurf';
  const partial = useMemo(() => partialComparison(scores, nzId), [scores, nzId]);
  const perComponent = useMemo(() => componentRanking(scores, rankKey), [scores, rankKey]);

  const DayNav = (
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => setDayOffset(o => Math.max(-14, o - 1))} className="p-1.5 rounded-lg border border-slate-200 cursor-pointer" aria-label="Vorige dag"><ChevronLeft className="w-4 h-4" /></button>
      <div className="text-sm font-bold text-slate-900">
        {day.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
        {dayOffset === 0 ? ' (vandaag)' : dayOffset === -1 ? ' (gisteren)' : dayOffset === 1 ? ' (morgen)' : ''}
      </div>
      <button onClick={() => setDayOffset(o => Math.min(6, o + 1))} className="p-1.5 rounded-lg border border-slate-200 cursor-pointer" aria-label="Volgende dag"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );

  const pct = (hit = 0, n = 0) => (n ? `${Math.round(hit / n * 100)}%` : '—');
  const scoreRows = sources
    .map(s => ({ s, r: scores.get(s.source) }))
    .filter(x => x.r)
    .sort((a, b) => {
      const pa = (a.r!.hit.total || 0) / (a.r!.n.total || 1), pb = (b.r!.hit.total || 0) / (b.r!.n.total || 1);
      return (b.r!.n.total ? pb : -1) - (a.r!.n.total ? pa : -1);
    });

  return (
    <div className="rounded-2xl border border-cyan-200 p-3 space-y-3">
      <div>
        <div className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5 text-cyan-600" /> Is er te surfen? Voorspellers vergeleken</div>
        <p className="text-[11px] text-slate-600 mt-1">
          NzSurf, breakfinder, Surfline, Wompy en Secret Swell geven een eigen oordeel. Voor de anderen geldt de regel hieronder op hún cijfers (<sup>r</sup>).
          Werkelijkheid voor "te surfen?": kies hieronder. Golf, wind enz. worden altijd tegen de metingen van Rijkswaterstaat getoetst (op zee, niet het strand).
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-1">
        <div className="text-[11px] font-bold text-slate-700">Werkelijkheid "te surfen?"</div>
        <div className="flex flex-wrap gap-1.5">
          {TRUTH_MODES.map(m => (
            <button key={m.key} onClick={() => setTruthMode(m.key)}
              className={cn('text-[11px] px-2 py-1 rounded-full border cursor-pointer', truthMode === m.key ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white border-slate-300 text-slate-700')}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">{TRUTH_MODES.find(m => m.key === truthMode)!.help} Spotrapporten met oordeel voor deze spot: {ratedReports}.</p>
      </div>

      <details className="rounded-xl bg-slate-50 border border-slate-200 p-2">
        <summary className="text-[11px] font-bold text-slate-700 cursor-pointer flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Regel "te surfen" (aanpasbaar)</summary>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
          {([
            ['minWave', 'Golf minimaal (m)', 0.1],
            ['minPeriod', 'Periode minimaal (s)', 0.5],
            ['maxOnshoreKn', 'Max wind aanlandig (kn)', 1],
            ['maxOtherKn', 'Max wind zij/aflandig (kn)', 1],
          ] as const).map(([k, label, step]) => (
            <label key={k} className="flex flex-col gap-0.5">
              <span className="text-slate-600">{label}</span>
              <input type="number" step={step} value={rule[k]} onChange={e => setRule(r => ({ ...r, [k]: Number(e.target.value) || 0 }))}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white" />
            </label>
          ))}
        </div>
        <button onClick={() => setRule(DEFAULT_RULE)} className="mt-2 text-[11px] underline text-slate-600 cursor-pointer">Standaard herstellen</button>
      </details>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('text-[11px] font-bold px-2.5 py-1.5 rounded-full border cursor-pointer',
              tab === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 1 — Wat voorspelt iedereen de komende 5 dagen */}
      {tab === 'outlook' && (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-600">Aantal daglichtmomenten (07–20 u) met "te surfen" volgens de laatste verwachting. Tik een dag voor de cijfers erachter.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
              <thead><tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 pr-2 sticky left-0 bg-white">Voorspeller</th>
                {outlookDays.map((d, i) => <th key={i} className={thCls}>{i === 0 ? 'vandaag' : fmtDay(d)}</th>)}
              </tr></thead>
              <tbody>
                {sources.filter(s => out[s.source]?.some(Boolean)).map(s => (
                  <tr key={s.source} className={cn('border-b border-slate-100', isNz(s.source) && 'bg-cyan-50')}>
                    <td className={stickyTd(isNz(s.source))}>{s.label}{!OWN_VERDICT_SOURCES.has(s.source) && <sup className="text-slate-400"> r</sup>}</td>
                    {out[s.source].map((c, i) => (
                      <td key={i} className="text-right px-1.5">
                        {c ? (
                          <button onClick={() => { setDayOffset(i); setSlotIdx(0); setTab('vars'); }}
                            className={cn('rounded-md px-1.5 py-0.5 font-bold cursor-pointer', c.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>
                            {c.ok}/{c.total}
                          </button>
                        ) : dash}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableHelp>
            <ul>
              <li>Per voorspeller en per dag: op hoeveel momenten overdag (07–20 u, elke 3 uur) het "te surfen" is volgens de nieuwste verwachting. <b>3/5</b> = 3 van de 5 momenten.</li>
              <li><b>Groen</b> = minstens één moment te surfen; <b>grijs</b> = de hele dag niet.</li>
              <li>NzSurf en breakfinder: kans ≥ 45%. Surfline: rating ≥ "poor to fair". Wompy: dagoordeel OK, GOOD of EPIC (geldt voor de hele dag en de hele NL-kust). Secret Swell: groene of oranje stip (rood = no-go). De anderen geven geen eigen oordeel; daar geldt de aanpasbare regel hierboven op hún cijfers (<sup>r</sup>).</li>
              <li>Tik op een cel om de cijfers achter dat oordeel te zien (tabblad 2).</li>
            </ul>
          </TableHelp>
        </div>
      )}

      {/* 2 — De variabelen achter het oordeel */}
      {tab === 'vars' && (
        <div className="space-y-2">
          {DayNav}
          <div className="flex flex-wrap gap-1">
            {slots.map((t, i) => (
              <button key={t} onClick={() => setSlotIdx(i)}
                className={cn('text-[11px] px-2 py-1 rounded-full border cursor-pointer', slot === t ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white border-slate-300 text-slate-700')}>
                {fmtTime(t)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-600">De laatste verwachting die elke voorspeller vóór dit moment gaf.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
              <thead><tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 pr-2 sticky left-0 bg-white">Voorspeller</th>
                <th className={thCls}>Golf m</th><th className={thCls}>Per. s</th><th className={thCls}>Swell</th>
                <th className={thCls}>Wind kn</th><th className={thCls}>Windhoek</th><th className={thCls}>Te surfen?</th>
              </tr></thead>
              <tbody>
                {slot !== undefined && sources.map(s => {
                  const p = pointFor(forecasts, s.source, slot, now);
                  if (!p) return null;
                  const v = forecastVerdict(s.source, p, rule);
                  return (
                    <tr key={s.source} className={cn('border-b border-slate-100', isNz(s.source) && 'bg-cyan-50')}>
                      <td className={stickyTd(isNz(s.source))}>{s.label}</td>
                      <td className="text-right px-1.5">{typeof p.hs === 'number' ? nl(p.hs) : dash}{typeof p.spotHs === 'number' && <span className="text-cyan-700"> ({nl(p.spotHs)} spot)</span>}</td>
                      <td className="text-right px-1.5">{typeof p.tp === 'number' ? nl(p.tp) : dash}</td>
                      <td className="text-right px-1.5">{typeof p.dir === 'number' ? degreesToCompass16(p.dir) : dash}</td>
                      <td className="text-right px-1.5">{typeof p.windKn === 'number' ? `${Math.round(p.windKn)} (${knotsToBft(p.windKn)} Bft)` : dash}</td>
                      <td className="text-right px-1.5">{typeof p.windDir === 'number' ? `${degreesToCompass16(p.windDir)} · ${windAngle(p.windDir)}` : dash}</td>
                      <td className="text-right px-1.5"><Verdict ok={v.ok} own={v.own} />{typeof p.chance === 'number' && <span className="text-slate-500"> {p.chance}%</span>}{p.rating && <span className="text-slate-500"> {p.rating.toLowerCase().replace(/_/g, ' ')}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TableHelp>
            <ul>
              <li>Kies een dag (pijltjes) en een tijdstip. Elke rij is de <b>laatste verwachting die een voorspeller vóór dat moment gaf</b>; voor een dag in het verleden dus wat ze toen dachten.</li>
              <li><b>Golf m</b> = golfhoogte op zee; bij NzSurf tussen haakjes de hoogte op de spot (na correctie voor de ondiepe kust).</li>
              <li><b>Per. s</b> = golfperiode (piekperiode). <b>Swell</b> = richting waar de golven vandaan komen.</li>
              <li><b>Wind kn</b> = windsnelheid in knopen (Beaufort). <b>Windhoek</b> = windrichting en of die aflandig, zij- of aanlandig is voor deze kust.</li>
              <li><b>Te surfen?</b> = het oordeel; erachter de NzSurf/breakfinder-kans of de Surfline-rating. <sup>r</sup> = beoordeeld met de regel hierboven.</li>
              <li><b>—</b> = deze voorspeller levert dit onderdeel niet.</li>
            </ul>
          </TableHelp>
        </div>
      )}

      {/* 3 — Wat het werd */}
      {tab === 'truth' && (
        <div className="space-y-2">
          {DayNav}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
              <thead><tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 pr-2">Tijd</th>
                <th className={thCls}>Golf m</th><th className={thCls}>Per. s*</th><th className={thCls}>Swell</th>
                <th className={thCls}>Wind kn</th><th className={thCls}>Windhoek</th><th className={thCls}>Meting</th>
                <th className={thCls}>Surfer</th><th className={thCls}>Groep</th><th className={thCls}>Geldt</th>
              </tr></thead>
              <tbody>
                {slots.map(t => {
                  const o = idx.get(new Date(t).toISOString().slice(0, 13));
                  return (
                    <tr key={t} className="border-b border-slate-100">
                      <td className="py-1 pr-2 font-bold">{fmtTime(t)}</td>
                      {o ? (<>
                        <td className="text-right px-1.5">{typeof o.hs === 'number' ? nl(o.hs) : dash}</td>
                        <td className="text-right px-1.5">{typeof o.tm02 === 'number' ? `${nl(o.tm02)} (≈${nl(o.tm02 * TM02_TO_TP)})` : dash}</td>
                        <td className="text-right px-1.5">{typeof o.dir === 'number' ? degreesToCompass16(o.dir) : dash}</td>
                        <td className="text-right px-1.5">{typeof o.windKn === 'number' ? `${Math.round(o.windKn)} (${knotsToBft(o.windKn)} Bft)` : dash}</td>
                        <td className="text-right px-1.5">{typeof o.windDir === 'number' ? `${degreesToCompass16(o.windDir)} · ${windAngle(o.windDir)}` : dash}</td>
                        <td className="text-right px-1.5"><Verdict ok={observedVerdict(o, rule)} /></td>
                      </>) : <td colSpan={6} className="text-right px-1.5 text-slate-400">{t > now ? 'nog niet gemeten' : 'nog niet opgehaald (wordt aangevuld)'}</td>}
                      <td className="text-right px-1.5">{(() => {
                        const r = reportsAt(reports, spotId, t);
                        if (!r.yes && !r.no) return dash;
                        return <><Verdict ok={r.yes === r.no ? undefined : r.yes > r.no} />{r.yes + r.no > 1 && <span className="text-slate-500"> {r.yes}/{r.yes + r.no}</span>}</>;
                      })()}</td>
                      <td className="text-right px-1.5"><Verdict ok={consensus(t, '')} /></td>
                      <td className="text-right px-1.5"><Verdict ok={truthFn(t, '')} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">
            Rijkswaterstaat: golven Maasgeul 2 (20 km van Ouddorp; oudere dagen Schouwenbank), wind Europlatform; de ophaalronde vult de laatste dagen 4× per dag aan. *De boei meet de gemiddelde periode (Tm02); tussen haakjes ≈ piekperiode zoals voorspellers die geven.
            <b> Surfer</b> = oordeel uit spotrapporten (±1,5 uur). <b>Groep</b> = meerderheid van alle voorspellers op het moment zelf. <b>Geldt</b> = wat telt voor de score (gekozen werkelijkheid).
          </p>
          <TableHelp>
            <ul>
              <li>Wat er écht gemeten is, per tijdstip overdag. Hiermee worden de verwachtingen uit tabblad 2 vergeleken.</li>
              <li><b>Golf, Per., Swell, Wind, Windhoek</b> = metingen van Rijkswaterstaat op zee (niet op het strand).</li>
              <li><b>Meting</b> = "te surfen?" volgens de regel hierboven, toegepast op de metingen.</li>
              <li><b>Surfer</b> = wat surfers in een spotrapport antwoordden op "Hoe is het om te surfen?" (binnen 1,5 uur; "Redelijk"/"Goed" = ja). Bij meerdere rapporten staat erachter hoeveel er ja zeiden.</li>
              <li><b>Groep</b> = wat de meerderheid van de voorspellers op het moment zelf zei (minstens 3 stemmen; bij gelijkspel —).</li>
              <li><b>Geldt</b> = het antwoord waartegen de score wordt berekend, volgens de keuze "Werkelijkheid" bovenaan.</li>
              <li>"nog niet opgehaald" = de meting komt bij de volgende ophaalronde (4× per dag); "nog niet gemeten" = ligt in de toekomst.</li>
            </ul>
          </TableHelp>
        </div>
      )}

      {/* 4 — Score */}
      {tab === 'score' && (
        <div className="space-y-3">
          {truthMode === 'reports' && ratedReports === 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900">
              Werkelijkheid staat op <b>"Alleen surfers"</b>, maar er zijn nog geen spotrapporten met een oordeel voor deze spot.
              Daarom blijven de "te surfen?"-scores leeg (—).{' '}
              <button onClick={() => setTruthMode('combined')} className="underline font-bold cursor-pointer">Zet op "Surfers, dan metingen, dan groep"</button>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-600">Vooruitkijktijd:</span>
            <select value={leadFilter} onChange={e => setLeadFilter(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1 bg-white">
              <option value={0}>alle</option>
              {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d} dag{d > 1 ? 'en' : ''} vooruit</option>)}
            </select>
          </div>
          {/* Totaalranglijst */}
          <div>
            <div className="text-xs font-black uppercase text-slate-900 mb-1">🏆 Totaalranglijst</div>
            <p className="text-[11px] text-slate-600 mb-1">Voorspellers die (bijna) alle {COMPONENTS.length} onderdelen leveren, op gelijke voet. Gemiddelde % goed; "te surfen?" telt dubbel. Zet bovenaan de periode op "Alles" voor de stand over alle tijd.</p>
            {overall.length ? (
              <ol className="space-y-1">
                {overall.map((r, i) => (
                  <li key={r.source} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]', isNz(r.source) ? 'bg-cyan-50 font-bold' : 'bg-slate-50', r.n < MIN_N && 'opacity-60')}>
                    <span className="w-6 text-right font-black">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <span className="flex-1 min-w-0 truncate">{labelOf(r.source)}</span>
                    <span className="tabular-nums font-black">{r.score}%</span>
                    <span className="tabular-nums text-[10px] text-slate-500 w-24 text-right whitespace-nowrap">{r.parts} onderd. · n {r.n}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-slate-500">Nog geen verwachtingen waarvan de uitkomst bekend is.</p>}
            {partial.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] font-bold text-slate-700 mb-1">Gedeeltelijke voorspellers — vergeleken met NzSurf op dezelfde onderdelen</div>
                <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
                  <thead><tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1 pr-2">Voorspeller</th><th className="text-left pr-2">Onderdelen</th>
                    <th className={thCls}>Zij</th><th className={thCls}>NzSurf</th>
                  </tr></thead>
                  <tbody>
                    {partial.map(r => (
                      <tr key={r.source} className={cn('border-b border-slate-100', r.n < MIN_N && 'text-slate-400')}>
                        <td className="py-1 pr-2">{labelOf(r.source)}</td>
                        <td className="pr-2 text-slate-500 whitespace-normal">{r.keys.map(k => COMPONENTS.find(c => c.key === k)!.label.toLowerCase()).join(', ')}</td>
                        <td className="text-right px-1.5 font-bold">{r.score}%</td>
                        <td className={cn('text-right px-1.5 font-bold', r.refScore !== null && r.refScore >= r.score ? 'text-emerald-700' : 'text-slate-700')}>{r.refScore !== null ? `${r.refScore}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-1.5"><TableHelp>
              <ul>
                <li><b>Score %</b> = gemiddeld percentage goed over alle onderdelen die de voorspeller levert (golf, periode, swellrichting, wind, windrichting, windhoek); "te surfen?" telt dubbel.</li>
                <li><b>onderd.</b> = op hoeveel onderdelen hij is beoordeeld. Alleen voorspellers met minstens {FULL_PARTS} van de {COMPONENTS.length} onderdelen staan in de ranglijst: wie alleen wind levert, scoort anders makkelijk hoog.</li>
                <li><b>Gedeeltelijke voorspellers</b> (alleen wind, alleen golf, …) staan eronder, met naast hun score die van NzSurf op precies dezelfde onderdelen. Groen = NzSurf minstens zo goed.</li>
                <li><b>n</b> = aantal beoordeelde momenten. Vaag weergegeven = minder dan {MIN_N}: nog niet betrouwbaar.</li>
                <li>Met "Vooruitkijktijd" bovenaan zie je de stand voor bijvoorbeeld alleen verwachtingen van 3 dagen vooruit.</li>
              </ul>
            </TableHelp></div>
          </div>

          {/* Ranglijst per onderdeel */}
          <div>
            <div className="text-xs font-black uppercase text-slate-900 mb-1">Per onderdeel: wie zat het vaakst goed?</div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {COMPONENTS.map(c => (
                <button key={c.key} onClick={() => setRankKey(c.key)}
                  className={cn('text-[11px] px-2 py-1 rounded-full border cursor-pointer', rankKey === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-700')}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mb-1">Goed als: {COMPONENTS.find(c => c.key === rankKey)!.rule}.</p>
            {perComponent.length ? (
              <ol className="space-y-1">
                {perComponent.map((r, i) => (
                  <li key={r.source} className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-[12px]', isNz(r.source) ? 'bg-cyan-50 font-bold' : 'bg-white border border-slate-100', r.n < MIN_N && 'opacity-60')}>
                    <span className="w-6 text-right font-bold">{i + 1}.</span>
                    <span className="flex-1 min-w-0 truncate">{labelOf(r.source)}</span>
                    <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${r.pct}%` }} /></div>
                    <span className="tabular-nums font-bold w-10 text-right">{r.pct}%</span>
                    <span className="tabular-nums text-[10px] text-slate-500 w-10 text-right">n {r.n}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-slate-500">Geen voorspeller levert dit onderdeel, of er is nog niets gemeten.</p>}
            <p className="text-[10px] text-slate-500 mt-1">Vaag = minder dan {MIN_N} vergelijkingen. Alleen daglicht (07–20 u).</p>
            <div className="mt-1.5"><TableHelp>
              <ul>
                <li>Kies een onderdeel. De balk en het % tonen hoe vaak de voorspelling binnen de marge bleef ("goed als …" hierboven).</li>
                <li><b>n</b> = aantal vergelijkingen. Vaag = minder dan {MIN_N}.</li>
                <li>Anders dan bij de MAE-tabellen telt hier niet hóéveel iemand ernaast zat, alleen of het binnen de marge viel.</li>
              </ul>
            </TableHelp></div>
          </div>

          <div className="text-xs font-black uppercase text-slate-900">Alle onderdelen in één tabel</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
              <thead><tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 pr-2 sticky left-0 bg-white">Voorspeller</th>
                {COMPONENTS.map(c => <th key={c.key} className={thCls} title={c.rule}>{c.label}</th>)}
                <th className={thCls}>n</th>
              </tr></thead>
              <tbody>
                {scoreRows.map(({ s, r }) => (
                  <tr key={s.source} className={cn('border-b border-slate-100', isNz(s.source) && 'bg-cyan-50')}>
                    <td className={stickyTd(isNz(s.source))}>{s.label}{!OWN_VERDICT_SOURCES.has(s.source) && <sup className="text-slate-400"> r</sup>}</td>
                    {COMPONENTS.map(c => (
                      <td key={c.key} className={cn('text-right px-1.5', (r!.n[c.key] || 0) < MIN_N && 'text-slate-400', c.key === 'total' && 'font-bold')}>
                        {pct(r!.hit[c.key], r!.n[c.key])}
                      </td>
                    ))}
                    <td className="text-right px-1.5 text-slate-500">{r!.n.total || r!.n.hs || r!.n.wind || 0}</td>
                  </tr>
                ))}
                {!scoreRows.length && <tr><td colSpan={9} className="py-2 text-slate-500">Nog geen verwachtingen waarvan de uitkomst gemeten is.</td></tr>}
              </tbody>
            </table>
          </div>
          <ul className="text-[10px] text-slate-500 space-y-0.5">
            {COMPONENTS.map(c => <li key={c.key}><b>{c.label}</b> goed als: {c.rule}</li>)}
            <li>Grijs = minder dan {MIN_N} vergelijkingen. Alleen daglicht (07–20 u).</li>
          </ul>
          <TableHelp>
            <ul>
              <li>Hetzelfde als de ranglijst per onderdeel, maar alles naast elkaar: per voorspeller het % goed per onderdeel. Gesorteerd op "Te surfen?".</li>
              <li><b>—</b> = de voorspeller levert dit onderdeel niet, of er is nog niets gemeten.</li>
              <li><b>n</b> = aantal beoordeelde momenten. <sup>r</sup> = "te surfen?" bepaald met de regel hierboven.</li>
            </ul>
          </TableHelp>

          <div>
            <div className="text-xs font-black uppercase text-slate-900 mb-1">Hoe vroeg wist je het, en bleef het zo?</div>
            <p className="text-[11px] text-slate-600 mb-1">
              % juist "te surfen?" per aantal dagen vooruit. <b>Omslag</b> = hoe vaak het oordeel veranderde tussen opeenvolgende dagen (lager = stabieler).
              <b> Dagen vooraf</b> = gemiddeld vanaf hoeveel dagen vooruit het oordeel juist was en niet meer veranderde.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums [&_td]:whitespace-nowrap">
                <thead><tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-1 pr-2 sticky left-0 bg-white">Voorspeller</th>
                  {[5, 4, 3, 2, 1].map(d => <th key={d} className={thCls}>{d}d</th>)}
                  <th className={thCls}>Omslag</th><th className={thCls}>Dagen vooraf</th>
                </tr></thead>
                <tbody>
                  {stab.filter(r => r.targets || r.flipPct !== null).map(r => (
                    <tr key={r.source} className={cn('border-b border-slate-100', isNz(r.source) && 'bg-cyan-50')}>
                      <td className={stickyTd(isNz(r.source))}>{labelOf(r.source)}</td>
                      {[5, 4, 3, 2, 1].map(d => {
                        const c = r.byLead.find(x => x.day === d);
                        return <td key={d} className={cn('text-right px-1.5', c && c.n < MIN_N && 'text-slate-400')}>{c ? `${c.pct}%` : '—'}</td>;
                      })}
                      <td className="text-right px-1.5">{r.flipPct !== null ? `${r.flipPct}%` : '—'}</td>
                      <td className="text-right px-1.5 font-bold">{r.daysAhead !== null ? nl(r.daysAhead) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5"><TableHelp>
              <ul>
                <li><b>5d … 1d</b> = hoe vaak "te surfen?" klopte als het 5, 4, … 1 dag van tevoren voorspeld werd. Normaal loopt dit op naar rechts.</li>
                <li><b>Omslag</b> = hoe vaak het oordeel voor hetzelfde moment veranderde tussen twee opeenvolgende dagen. Lager = rustiger, minder heen en weer.</li>
                <li><b>Dagen vooraf</b> = gemiddeld vanaf hoeveel dagen vooruit het oordeel goed was én zo bleef. Hoger = eerder zeker.</li>
                <li><b>—</b> = nog geen verwachting van zo ver vooruit waarvan de uitkomst bekend is. Dit vult zich na een paar dagen. Staat alles op —, kijk dan bovenaan bij "Werkelijkheid": met "Alleen surfers" en zonder spotrapporten valt er niets te scoren.</li>
                <li><b>Omslag</b> heeft geen werkelijkheid nodig (het kijkt alleen of het oordeel veranderde) en is daarom wel gevuld.</li>
              </ul>
            </TableHelp></div>
          </div>

          <button
            onClick={() => {
              const rows = scoreRows.map(({ s, r }) => Object.fromEntries([
                ['voorspeller', s.label],
                ...COMPONENTS.flatMap(c => [[`${c.label} %`, r!.n[c.key] ? Math.round((r!.hit[c.key] || 0) / r!.n[c.key]! * 100) : ''], [`${c.label} n`, r!.n[c.key] || 0]]),
              ]));
              saveFileOrAlert(`nzsurf-audit-score-${leadFilter ? `dag${leadFilter}` : 'alle'}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
            }}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Score (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
