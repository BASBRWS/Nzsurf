import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Waves, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { degreesToCompass16 } from '../utils/spotKnowledge';
import { knotsToBft } from '../utils/surfMoments';
import { AuditForecastDoc, AuditObsDoc, MIN_N, toCsv } from '../utils/forecastAudit';
import {
  COMPONENTS, DEFAULT_RULE, OWN_VERDICT_SOURCES, SurfRule, TM02_TO_TP,
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
  { key: 'score', label: '4 Score' },
];
const RULE_KEY = 'nzs_audit_rule';

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

export function SurfAuditBoard({ forecasts, observations, sources, initialTab = 'outlook' }: {
  forecasts: AuditForecastDoc[];
  observations: AuditObsDoc[];
  sources: Src[];
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
  const scores = useMemo(() => componentScores(forecasts, observations, rule, leadFilter || undefined), [forecasts, observations, rule, leadFilter]);
  const stab = useMemo(() => stability(forecasts, observations, ids, rule),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecasts, observations, ids.join(), rule]);

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
          NzSurf, breakfinder en Surfline geven een eigen oordeel. Voor de anderen geldt de regel hieronder op hún cijfers (<sup>r</sup>).
          De werkelijkheid is dezelfde regel op de metingen van Rijkswaterstaat (op zee, niet het strand; spotrapporten blijven de echte strandtoets).
        </p>
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
                <th className={thCls}>Wind kn</th><th className={thCls}>Windhoek</th><th className={thCls}>Te surfen?</th>
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
                      </>) : <td colSpan={6} className="text-right px-1.5 text-slate-400">{t > now ? 'nog niet gemeten' : 'geen meting'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">Rijkswaterstaat: golven Schouwenbank, wind Europlatform. *De boei meet de gemiddelde periode (Tm02); tussen haakjes ≈ piekperiode zoals voorspellers die geven.</p>
        </div>
      )}

      {/* 4 — Score */}
      {tab === 'score' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-600">Vooruitkijktijd:</span>
            <select value={leadFilter} onChange={e => setLeadFilter(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1 bg-white">
              <option value={0}>alle</option>
              {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d} dag{d > 1 ? 'en' : ''} vooruit</option>)}
            </select>
          </div>
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
          </div>

          <button
            onClick={() => {
              const rows = scoreRows.map(({ s, r }) => Object.fromEntries([
                ['voorspeller', s.label],
                ...COMPONENTS.flatMap(c => [[`${c.label} %`, r!.n[c.key] ? Math.round((r!.hit[c.key] || 0) / r!.n[c.key]! * 100) : ''], [`${c.label} n`, r!.n[c.key] || 0]]),
              ]));
              const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `nzsurf-audit-score-${leadFilter ? `dag${leadFilter}` : 'alle'}-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
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
