import React, { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { AuditForecastDoc, AuditObsDoc, AuditParam, PARAMS, Pair, buildPairs, cleanObservations } from '../utils/forecastAudit';
import { FAIR_MIN_DAYS, FAIR_MIN_MOMENTS, LEAD_DAYS, RASTERS, Raster, fairDailyTable, fairSurfTable, fairVariableTable } from '../utils/fairCompare';
import { SurfRule, TruthFn } from '../utils/surfVerdict';
import { V2_SOURCE } from '../utils/forecastV2';
import { TableHelp } from './TableHelp';

/** Referentie voor Δ: wat de app laat zien; anders de nagerekende v2; anders v1. */
export const FAIR_REFS = ['nzsurf-v2-live', V2_SOURCE, 'nzsurf'];
type Topic = 'surf' | AuditParam;

const Chips: React.FC<{ label: string; value: string; opts: { v: string; l: string }[]; set: (v: string) => void }> = ({ label, value, opts, set }) => (
  <div className="flex items-start gap-2">
    <span className="w-[64px] shrink-0 pt-2 text-[12px] font-semibold text-slate-500">{label}</span>
    <div role="radiogroup" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1 -mr-3 pr-3 [scrollbar-width:none]">
      {opts.map(o => (
        <button key={o.v} role="radio" aria-checked={o.v === value} onClick={() => set(o.v)}
          className={cn('shrink-0 min-h-[36px] px-3 rounded-full border text-[13px] whitespace-nowrap cursor-pointer',
            o.v === value ? 'bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)] border-[color:var(--tide-ink)] font-semibold' : 'bg-white text-slate-700 border-slate-300')}>
          {o.l}
        </button>
      ))}
    </div>
  </div>
);

const fmt = (x: number, d: number) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (x: number, d: number) => (x > 0 ? '+' : '') + fmt(x, d);

/**
 * Eerlijke vergelijking (zie utils/fairCompare): per onderdeel, per vooruitkijkdag en per
 * raster; alle bronnen in de tabel op precies dezelfde momenten.
 */
export function FairCompare({ forecasts, observations, pairs, rule, truthFn, labelOf, initialTopic = 'hs', title }: {
  forecasts: AuditForecastDoc[]; observations: AuditObsDoc[]; pairs?: Pair[];
  rule: SurfRule; truthFn: TruthFn; labelOf?: (s: string) => string; initialTopic?: Topic; title?: string;
}) {
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [day, setDay] = useState(1);
  const [raster, setRaster] = useState<Raster>(3);
  const allPairs = useMemo(() => pairs ?? buildPairs(forecasts, cleanObservations(observations)), [pairs, forecasts, observations]);
  const prm = PARAMS.find(p => p.key === topic);
  const d = topic === 'hs' ? 2 : topic === 'dir' || topic === 'windDir' ? 0 : 1;

  const table = useMemo(() => topic === 'surf'
    ? fairSurfTable(forecasts, rule, truthFn, { leadDay: day, raster, refs: FAIR_REFS, labelOf })
    : fairVariableTable(allPairs, forecasts, { param: topic, leadDay: day, raster, refs: FAIR_REFS, labelOf }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [topic, day, raster, forecasts, allPairs, rule, truthFn]);
  const daily = useMemo(() => topic === 'surf' ? fairDailyTable(forecasts, rule, truthFn, { leadDay: day, labelOf }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic, day, forecasts, rule, truthFn]);

  const refLabel = table.ref ? (labelOf?.(table.ref) ?? table.ref) : '';
  const isOurs = (s: string) => FAIR_REFS.includes(s);

  return (
    <div className="space-y-3">
      <div className="text-xs font-black uppercase text-slate-900">{title ?? 'Eerlijke vergelijking'}</div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
        <Chips label="Onderdeel" value={topic} set={v => setTopic(v as Topic)}
          opts={[{ v: 'surf', l: 'Te surfen?' }, ...PARAMS.map(p => ({ v: p.key, l: p.key === 'tpPeak' ? 'Piekperiode' : p.label }))]} />
        <Chips label="Vooruit" value={String(day)} set={v => setDay(Number(v))} opts={LEAD_DAYS.map(x => ({ v: String(x), l: `Dag ${x}` }))} />
        <Chips label="Raster" value={String(raster)} set={v => setRaster(Number(v) as Raster)} opts={RASTERS.map(r => ({ v: String(r), l: r === 1 ? 'Elk uur' : `Elke ${r} uur` }))} />
      </div>

      <p className="text-[12px] text-slate-700">
        {table.rows.length
          ? <>Alle bronnen hieronder op <b>dezelfde {table.moments} momenten</b> ({table.days} dagen), alleen verwachtingen van <b>dag {day}</b>, op het raster <b>{raster === 1 ? 'elk uur' : `elke ${raster} uur`}</b>.{topic === 'surf' ? ' Alleen daglichtblokken (midden van het blok tussen 07 en 20 u).' : ''}</>
          : <>Nog geen {FAIR_MIN_MOMENTS} gezamenlijke momenten over {FAIR_MIN_DAYS} dagen voor dag {day} op dit raster.</>}
      </p>

      {table.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 pr-2">#</th><th className="pr-2">Bron</th>
              <th className="pr-2 text-right">{topic === 'surf' ? 'Score' : `Afwijking (${prm?.unit})`}</th>
              {topic === 'surf'
                ? <><th className="pr-2 text-right">Gevangen</th><th className="pr-2 text-right">Terecht nee</th></>
                : <th className="pr-2 text-right">Bias</th>}
              <th className="text-right">Δ {refLabel ? 'v2' : ''} (90%)</th>
            </tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={r.source} className={cn('border-b border-slate-100', isOurs(r.source) && 'bg-cyan-50 font-bold')}>
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="pr-2">{r.label}<span className="text-[10px] font-normal text-slate-400"> · {r.step === 1 ? 'uur' : `${r.step} u`}{raster > 1 && r.offset ? ` · +${String(r.offset).replace('.', ',')} u` : ''}</span></td>
                  <td className="pr-2 text-right">{topic === 'surf' ? `${r.value}%` : fmt(r.value, d)}</td>
                  {topic === 'surf'
                    ? <><td className="pr-2 text-right">{r.caught ?? '–'}%</td><td className="pr-2 text-right">{r.rightNo ?? '–'}%</td></>
                    : <td className="pr-2 text-right">{r.bias !== undefined ? sgn(r.bias, d) : '–'}</td>}
                  <td className="text-right whitespace-nowrap">
                    {r.source === table.ref ? <span className="text-slate-400">referentie</span>
                      : r.delta !== undefined ? <>{topic === 'surf' ? sgn(r.delta, 0) : sgn(r.delta, d)}{r.lo !== undefined && r.hi !== undefined && <span className="text-[10px] text-slate-500"> ({topic === 'surf' ? `${sgn(r.lo, 0)} – ${sgn(r.hi, 0)}` : `${sgn(r.lo, d)} – ${sgn(r.hi, d)}`})</span>}</> : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.dropped.length > 0 && (
        <p className="text-[11px] text-slate-500">Niet in deze tabel: {table.dropped.map(x => `${x.label} (${x.reason})`).join(' · ')}.</p>
      )}

      {daily && (
        <div className="pt-1">
          <div className="text-[11px] font-bold text-slate-700 mb-1">Dagoordelen (bronnen met één oordeel per dag), dag {day}</div>
          {daily.rows.length ? (
            <table className="w-full text-xs tabular-nums">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1 pr-2">Bron</th><th className="pr-2 text-right">Score</th><th className="pr-2 text-right">Gevangen</th><th className="text-right">Terecht nee</th></tr></thead>
              <tbody>{daily.rows.map(r => <tr key={r.source} className="border-b border-slate-100"><td className="py-1 pr-2">{r.label}</td><td className="pr-2 text-right">{r.value}%</td><td className="pr-2 text-right">{r.caught}%</td><td className="text-right">{r.rightNo}%</td></tr>)}</tbody>
            </table>
          ) : <p className="text-[11px] text-slate-500">{daily.dropped.length ? daily.dropped.map(x => `${x.label}: ${x.reason}`).join(' · ') : 'Geen dagoordelen voor deze dag.'}</p>}
          <p className="text-[10px] text-slate-500 mt-1">Op dezelfde {daily.days} dagen; een dag telt als surfbaar bij minstens 2 surfbare daglichtmomenten. Niet te vergelijken met de uurtabel hierboven.</p>
        </div>
      )}

      <TableHelp>
        <ul>
          <li><b>Dezelfde momenten</b>: elke bron in de tabel is beoordeeld op exact dezelfde tijdstippen, alleen waar álle bronnen een verwachting hadden en de werkelijkheid bekend is. Is de overlap te klein (minder dan {FAIR_MIN_MOMENTS} momenten of {FAIR_MIN_DAYS} dagen), dan valt de bron met de minste overlap af; die staat onder de tabel.</li>
          <li><b>Vooruit</b>: alleen verwachtingen van die vooruitkijkdag (dag 1 = binnen 24 uur). Per moment de laatste ophaalronde binnen die dag. Dagen worden nooit samengevoegd.</li>
          <li><b>Raster</b>: "elk uur" = exact hetzelfde uur voor iedereen (alleen bronnen met een waarde per uur). "Elke 3 uur" = blokken van 3 uur op NL-tijd (00–03, 03–06, …), per bron één waarde per blok, zo dicht mogelijk bij het begin. Tot 5 november rekende NzSurf in 3-uursblokken op NL-tijd en sloeg de audit de modellen op UTC-tijd op: die liggen dan 1 uur (winter) of 2 uur (zomer) later in hetzelfde blok; dat staat achter de naam als "+1 u". Sinds 5 november rekent NzSurf elk uur en slaat de audit alles elk uur op: dan doet NzSurf mee in elk raster (elk uur, 3 en 6 uur) en verdwijnt dit verschil. Een bron doet mee als zijn eigen stap in het raster past (sea-forecast, 6 uur, alleen bij "elke 6 uur").</li>
          <li><b>Dagoordelen</b> (Wompy, de dagkaarten van Secret Swell) zijn geen uurverwachting en staan nooit in de uurtabel; bij "Te surfen?" staan ze apart, op dagniveau.</li>
          <li><b>Δ</b> = verschil met NzSurf v2 (live in de app; anders de nagerekende v2) op dezelfde momenten, met 90%-interval (bootstrap per dag). Loopt het interval door 0, dan is het verschil niet aangetoond.</li>
          <li><b>Afwijking</b> = gemiddelde absolute fout tegen de boei; <b>bias</b> + = te hoog. <b>Score</b> (te surfen) = gemiddelde van "gevangen" en "terecht nee"; altijd nee geeft 50%.</li>
        </ul>
      </TableHelp>
    </div>
  );
}
