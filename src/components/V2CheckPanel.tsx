import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, Loader2, RefreshCw, Target, Waves, XCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import type { SurfSpot, UserProfile } from '../types';
import { AuditForecastDoc, AuditObsDoc, AuditParam, Pair, auditView, cleanObservations, PARAMS } from '../utils/forecastAudit';
import { WebcamMeasurement, loadWebcamMeasurements, webcamSpots } from '../services/webcamMeasure';
import { surfWindow, SKILL_LABEL } from '../utils/surfProfile';
import {
  ADVICE_MIN, CHECK_DAYS, CheckDay, CheckRow, Funnel, Score, buildCheckRows, funnelOf, missBreakdown, missReason, outcomeOf, scoreAdvice, scoreSites, seaSummary, tideCheck,
} from '../utils/v2Check';
import { TableHelp } from './TableHelp';
import { cn } from '../lib/utils';

/**
 * Klopt NzSurf v2? Alleen v2 zoals de app hem liet zien, in gewone taal:
 *   1. Klopte mijn advies?      — persoonlijk (profiel) tegen de webcam, voor jouw boards
 *   2. Klopte mijn voorspelling? — algemene kans tegen de webcam, en de zee tegen de boei
 */

const SITE_NAMES: Record<string, string> = { surfline: 'Surfline', breakfinder: 'Breakfinder', wompy: 'Wompy', secretswell: 'Secret Swell' };
// Golfrichting alleen waar de boei hem betrouwbaar meet (niet bij de Maasvlakte).
const seaParams = (spotId: string): AuditParam[] => (spotId === 'maasvlakte' ? ['hs', 'tp', 'windKn', 'windDir'] : ['hs', 'tp', 'dir', 'windKn', 'windDir']);
const CLASS_NL = { longboard: 'longboard', mid: 'mid-length', shortboard: 'shortboard' } as const;
const FLOAT_TO_CLASS = { veel: 'longboard', gemiddeld: 'mid', weinig: 'shortboard' } as const;

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');
const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : '—');
const when = (iso: string) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function sampleNote(n: number) {
  if (n < 10) return { text: `Pas ${n} momenten: hier valt nog niets uit te concluderen.`, cls: 'text-amber-800' };
  if (n < 30) return { text: `${n} momenten: een eerste indicatie, nog geen bewijs (vanaf ±30 wordt het betrouwbaar).`, cls: 'text-amber-800' };
  return { text: `${n} momenten: genoeg om iets te zeggen.`, cls: 'text-emerald-800' };
}

function FunnelLine({ f, day }: { f: Funnel; day: CheckDay }) {
  const steps: [number, string][] = [
    [f.beforeLive, 'vóór v2 live (28 okt)'],
    [f.noRun, `geen v2-verwachting ${day === 1 ? '1 dag' : `${day} dagen`} eerder`],
    [f.incomplete, 'verwachting onvolledig'],
    [f.unusable, 'beeld onbruikbaar'],
    [f.noVerdict, 'geen oordeel van de webcam'],
    [f.matig, 'matig'],
  ];
  const out = steps.filter(([n]) => n > 0);
  return (
    <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
      <b>Telling:</b> {f.total} webcammetingen
      {out.map(([n, l]) => <span key={l}> → <span className="whitespace-nowrap">−{n} {l}</span></span>)}
      {' '}= <b>{f.counted} getoetst</b>
    </p>
  );
}

function ScoreBlock({ s, what, funnel, day }: { s: Score; what: string; funnel: Funnel; day: CheckDay }) {
  const note = sampleNote(s.n);
  return (
    <div className="space-y-1">
      <p className="text-[15px] font-black text-slate-900">
        {s.n ? <>{s.good} van {s.n} keer goed <span className="text-slate-500 font-bold">({pct(s.good, s.n)})</span></> : 'Nog geen momenten om te toetsen'}
      </p>
      {s.n > 0 && (
        <ul className="text-[12px] text-slate-700 list-disc pl-4 space-y-0.5">
          <li><b>{s.falseYes}×</b> {what} "gaan", maar het was niet te surfen</li>
          <li><b>{s.missed}×</b> {what} "niet gaan", maar het was wél te surfen</li>
          {s.matig > 0 && <li><b>{s.matig}×</b> was het matig: telt niet als goed of fout</li>}
        </ul>
      )}
      <FunnelLine f={funnel} day={day} />
      <p className={cn('text-[11px]', note.cls)}>{note.text}</p>
    </div>
  );
}

function Reasons({ rows, day, which }: { rows: CheckRow[]; day: CheckDay; which: 'personal' | 'general' }) {
  const b = missBreakdown(rows, day, which);
  const total = b.zee + b.wind + b.strand + b.onbekend;
  if (!total) return null;
  return (
    <p className="text-[12px] text-slate-700">
      <b>Waarom ernaast?</b> {b.zee}× golf op zee verkeerd · {b.wind}× wind verkeerd · {b.strand}× zee klopte, maar de vertaling naar het strand niet
      {b.onbekend ? ` · ${b.onbekend}× geen boeimeting` : ''}.
    </p>
  );
}

function Moments({ rows, day, which }: { rows: CheckRow[]; day: CheckDay; which: 'personal' | 'general' }) {
  const list = rows.filter(r => r.days[day] && (which === 'personal' ? r.truthMe : r.truthGen));
  if (!list.length) return null;
  return (
    <details>
      <summary className="text-[12px] font-bold text-slate-700 cursor-pointer">Per webcammeting ({list.length})</summary>
      <ul className="mt-1 space-y-1">
        {list.map(r => {
          const c = r.days[day]!;
          const truth = which === 'personal' ? r.truthMe! : r.truthGen!;
          const chance = which === 'personal' ? c.personal : c.general;
          const o = outcomeOf(chance, truth);
          const miss = o === 'onterecht-ja' || o === 'gemist';
          return (
            <li key={r.m.runAt} className="text-[11px] border-t border-slate-100 pt-1">
              <span className="font-mono text-slate-500">{when(r.m.runAt)}</span>{' '}
              {o === 'goed' ? <CheckCircle2 className="inline w-3.5 h-3.5 text-emerald-600" /> : miss ? <XCircle className="inline w-3.5 h-3.5 text-rose-600" /> : <span className="text-amber-700 font-bold">~</span>}{' '}
              v2 zei <b>{typeof chance === 'number' ? `${chance >= ADVICE_MIN ? 'gaan' : 'niet gaan'} (${chance}%)` : '—'}</b>
              {which === 'personal' && c.board ? <> met {c.board}{c.limit ? `, ${c.limit}` : ''}</> : null}
              {' · '}webcam: <b>{truth.y === 1 ? 'te surfen' : truth.y === 0 ? 'niet te surfen' : 'matig'}</b>{' '}
              <span className="text-slate-500">({truth.source === 'oordeel' ? truth.label : `afgeleid: ${truth.label}`})</span>
              {miss && <div className="text-slate-600 pl-4">→ {missReason(c.p, r.obs).text}</div>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function V2CheckPanel({ user, spots, pairs, forecasts, observations, spotId, spotName, periodLabel }: {
  user?: UserProfile; spots: SurfSpot[]; pairs: Pair[]; forecasts: AuditForecastDoc[] | null; observations: AuditObsDoc[];
  spotId: string; spotName: string; periodLabel: string;
}) {
  const [day, setDay] = useState<CheckDay>(1);
  const [data, setData] = useState<{ docs: AuditForecastDoc[]; obs: AuditObsDoc[]; webcam: WebcamMeasurement[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // De webcam staat bij de Maasvlakte: daarvoor altijd de Maasvlakte-verwachtingen, los van de spotkeuze.
  useEffect(() => {
    let cancelled = false;
    setData(null); setErr(null);
    Promise.all([
      getDocs(query(collection(db, 'auditForecasts'), where('spotId', '==', 'maasvlakte'))),
      getDocs(collection(db, 'auditObservations')),
      loadWebcamMeasurements(),
    ]).then(([fc, obs, webcam]) => {
      if (cancelled) return;
      setData({
        docs: auditView(fc.docs.map(d => d.data() as AuditForecastDoc), 'maasvlakte'),
        obs: cleanObservations(obs.docs.map(d => d.data() as AuditObsDoc)),
        webcam,
      });
    }).catch(e => { if (!cancelled) setErr(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [tick]);

  const spot = useMemo(() => webcamSpots(spots).camera, [spots]);
  const rows = useMemo(() => (data ? buildCheckRows(data.webcam, data.docs, data.obs, spot, user) : []), [data, spot, user]);
  const withV2 = rows.filter(r => Object.keys(r.days).length).length;
  const labelOf = (s: string) => SITE_NAMES[s] ?? forecasts?.find(f => f.source === s)?.label ?? data?.docs.find(d => d.source === s)?.label ?? s;
  const sea = useMemo(
    () => (forecasts ? seaParams(spotId).map(p => seaSummary(pairs, forecasts, p, day, labelOf)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pairs, forecasts, day, spotId],
  );
  const tide = useMemo(() => (forecasts ? tideCheck(forecasts, observations, day) : null), [forecasts, observations, day]);
  const sites = useMemo(() => scoreSites(rows, day, labelOf), [rows, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const boards = user?.boards?.length ? user.boards.map(b => ({ b, cls: FLOAT_TO_CLASS[surfWindow(user, b).floatClass] })) : [];

  return (
    <section className="rounded-2xl border-2 border-cyan-600 bg-white p-3 sm:p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-black uppercase text-slate-900 flex items-center gap-1.5"><Target className="w-5 h-5 text-cyan-600" /> Klopt NzSurf v2?</h4>
          <p className="text-[12px] text-slate-600">
            Alleen v2 zoals de app hem echt liet zien (vastgelegd sinds 28 okt 2026). Waarheid aan het strand: het oordeel van de webcam Maasvlakte,
            los van elke voorspelling{data ? ` (${data.webcam.length} metingen, ${withV2} met een v2-verwachting van tevoren)` : ''}.
          </p>
        </div>
        <button onClick={() => setTick(t => t + 1)} className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-300 flex items-center gap-1 cursor-pointer shrink-0"><RefreshCw className="w-3 h-3" /> Vernieuwen</button>
      </div>

      <div role="radiogroup" aria-label="Hoeveel dagen vooruit" className="flex gap-1.5">
        {CHECK_DAYS.map(d => (
          <button key={d} role="radio" aria-checked={d === day} onClick={() => setDay(d)}
            className={cn('min-h-[36px] px-3 rounded-full border text-[13px] cursor-pointer', d === day ? 'bg-slate-900 text-white border-slate-900 font-semibold' : 'bg-white text-slate-700 border-slate-300')}>
            {d === 1 ? '1 dag vooruit' : `${d} dagen vooruit`}
          </button>
        ))}
      </div>

      {err && <p className="text-[12px] text-rose-700">Kon de gegevens niet laden: {err}</p>}
      {!data && !err && <p className="text-[12px] text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Laden…</p>}

      {data && (
        <>
          {/* 1. Persoonlijk advies */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-black text-slate-900">1. Klopte mijn advies?</p>
            {user ? (
              <>
                <p className="text-[12px] text-slate-600">
                  Jouw advies uit je profiel ({SKILL_LABEL[user.skillLevel || 'intermediate']}, {user.weight > 0 ? `${user.weight} kg` : 'gewicht onbekend'}
                  {boards.length ? `, ${boards.map(x => `${x.b.name || x.b.type} (${CLASS_NL[x.cls]})`).join(', ')}` : ', geen boards ingevuld'}),
                  berekend op de v2-verwachting van {day === 1 ? '1 dag' : `${day} dagen`} van tevoren.
                  Gaan = jouw kans {ADVICE_MIN}% of meer. Getoetst aan wat de webcam zag voor jouw beste board.
                </p>
                <ScoreBlock s={scoreAdvice(rows, day, 'personal')} what="je advies zei" funnel={funnelOf(rows, data.docs, day, 'personal')} day={day} />
                <Reasons rows={rows} day={day} which="personal" />
                <Moments rows={rows} day={day} which="personal" />
              </>
            ) : <p className="text-[12px] text-slate-600">Log in om je persoonlijke advies te toetsen.</p>}
          </div>

          {/* 2. Algemene voorspelling */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <p className="text-sm font-black text-slate-900">2. Klopte mijn voorspelling? (algemeen)</p>

            <div className="space-y-2">
              <p className="text-[12px] font-bold text-slate-800">a. Te surfen? — de algemene kans in de app tegen de webcam (gemiddeld board)</p>
              <ScoreBlock s={scoreAdvice(rows, day, 'general')} what="v2 zei" funnel={funnelOf(rows, data.docs, day, 'general')} day={day} />
              <Reasons rows={rows} day={day} which="general" />
              {sites.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[12px] text-slate-700">Naast andere sites met een eigen oordeel, op precies dezelfde momenten:</p>
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-slate-500"><th className="pr-2 font-semibold">Site</th><th className="pr-2 text-right font-semibold">Momenten</th><th className="pr-2 text-right font-semibold">v2 goed</th><th className="text-right font-semibold">Site goed</th></tr></thead>
                    <tbody>
                      {sites.map(s => (
                        <tr key={s.source} className="border-t border-slate-100">
                          <td className="pr-2 py-0.5">{s.label}</td>
                          <td className="pr-2 text-right font-mono">{s.v2.n}</td>
                          <td className={cn('pr-2 text-right font-mono', s.v2.good > s.site.good && 'text-emerald-700 font-bold')}>{s.v2.good} ({pct(s.v2.good, s.v2.n)})</td>
                          <td className={cn('text-right font-mono', s.site.good > s.v2.good && 'text-emerald-700 font-bold')}>{s.site.good} ({pct(s.site.good, s.site.n)})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-500">Onder ±10 momenten per site is een verschil toeval. Matige momenten tellen niet mee.</p>
                </div>
              )}
              <Moments rows={rows} day={day} which="general" />
            </div>

            <div className="space-y-2">
              <p className="text-[12px] font-bold text-slate-800 flex items-center gap-1"><Waves className="w-3.5 h-3.5 text-cyan-600" /> b. Op zee — v2 tegen de metingen ({spotName}, {periodLabel})</p>
              {!forecasts ? <p className="text-[12px] text-slate-500">Laden…</p> : (
                <ul className="space-y-1.5">
                  {sea.map(s => {
                    const prm = PARAMS.find(p => p.key === s.param)!;
                    const d = s.param === 'hs' ? 2 : s.param === 'windDir' ? 0 : 1;
                    return (
                      <li key={s.param} className="text-[12px] text-slate-800 border-t border-slate-100 pt-1">
                        <b>{prm.label}</b>{s.param === 'dir' ? <span className="text-slate-500"> (indicatie)</span> : null}:{' '}
                        {typeof s.rank !== 'number' ? <span className="text-slate-500">nog te weinig momenten met v2 en andere bronnen samen</span> : (
                          <>
                            v2 zit gemiddeld <b>{fmtNum(s.v2!, d)} {prm.unit}</b> ernaast — plek <b>{s.rank} van {s.of}</b>.{' '}
                            {s.better.length ? <span className="text-rose-700">Echt beter dan v2: {s.better.join(', ')}. </span> : null}
                            {s.worse.length ? <span className="text-emerald-700">Echt slechter dan v2: {s.worse.join(', ')}. </span> : null}
                            {s.same.length ? <span className="text-slate-500">Gelijk binnen de onzekerheid: {s.same.join(', ')}.</span> : null}
                            {!s.better.length && !s.worse.length && !s.same.length ? <span className="text-slate-500">Geen andere bron op dezelfde momenten.</span> : null}
                          </>
                        )}
                      </li>
                    );
                  })}
                  {tide && (
                    <li className="text-[12px] text-slate-800 border-t border-slate-100 pt-1">
                      <b>Getij</b>:{' '}
                      {!tide.n ? <span className="text-slate-500">nog geen momenten met v2 en een gemeten waterstand</span> : (
                        <>
                          v2 zit gemiddeld <b>{fmtNum(tide.mae!, 2)} m</b> ernaast. Daarvan is <b>{fmtNum(Math.abs(tide.offset!), 2)} m</b> een vaste verschuiving
                          (v2 structureel {tide.offset! < 0 ? 'lager' : 'hoger'}); zonder die verschuiving nog {fmtNum(tide.shapeMae!, 2)} m.
                          {tide.phaseN > 0 && <> De fase (laag, midden of hoog water) klopte <b>{tide.phaseOk} van {tide.phaseN} keer</b> ({pct(tide.phaseOk, tide.phaseN)}).</>}
                          <span className="text-slate-500"> Alleen v2 heeft een getij, dus geen plek tussen bronnen.</span>
                        </>
                      )}
                    </li>
                  )}
                </ul>
              )}
              <TableHelp title="Zo lees je dit">
                <ul>
                  <li><b>Ernaast</b> = gemiddelde afwijking van de meting (boei Maasgeul 2 voor golven, Europlatform voor wind, Goeree voor de waterstand), {day === 1 ? '1 dag' : `${day} dagen`} vooruit.</li>
                  <li><b>Plek</b> = rang tussen alle bronnen op precies dezelfde momenten (per 3 uur). 1 = het dichtst bij de meting.</li>
                  <li><b>Echt beter/slechter</b>: het verschil met v2 is groter dan toeval (90% zeker). <b>Gelijk</b>: het verschil kan toeval zijn.</li>
                  <li>Bij de golfhoogte doen Surfline, surfnerd, Breakfinder, Secret Swell en Wompy niet mee: die geven de hoogte aan het strand of alleen de swell, een andere grootheid dan de boei meet.</li>
                  <li>Golfperiode: gemiddelde periode tegen de gemeten Tm02.</li>
                  <li>Golfrichting: alleen bij Ouddorp, en als indicatie: de boei ligt 20 km verderop. Bij de Maasvlakte meet de boei de richting niet betrouwbaar. Sites die alleen een swellrichting geven doen niet mee.</li>
                  <li>Getij: tegen de waterstand bij Goeree. De verwachting rekent vanaf gemiddeld zeeniveau en zonder opwaaiing, de meting vanaf NAP mét opwaaiing; dat geeft een vaste verschuiving. De kans in de app gebruikt alleen de fase (laag, midden of hoog binnen de getijslag), dus die verschuiving telt daar niet mee. Fase: laag = onderste 20% van de slag over ±7 uur, hoog = bovenste 20%.</li>
                </ul>
              </TableHelp>
            </div>
          </div>

          <TableHelp title="Hoe deze toets werkt">
            <ul>
              <li>Per webcammeting zoeken we de v2-verwachting die de app 1, 2 of 3 dagen eerder voor dat uur gaf (bron "v2 live").</li>
              <li><b>Persoonlijk</b>: jouw kans uit je huidige profiel (niveau, gewicht, boards, voorkeuren) op die v2-uren. Waarheid: het webcamoordeel voor jouw boardsoort(en), het beste board telt.</li>
              <li><b>Algemeen</b>: de kans zoals de app hem toonde. Waarheid: het webcamoordeel voor een mid-length (de gemiddelde surfer).</li>
              <li>Gaan = kans {ADVICE_MIN}% of meer ("Redelijk" of beter in de app). Matig op de webcam telt niet als goed of fout.</li>
              <li>Ernaast? Dan kijken we naar de zee op dat uur: golf meer dan 0,2 m én 30% naast de boei = golf op zee verkeerd; wind meer dan 6 kn naast = wind verkeerd; anders klopte de zee en zat de vertaling naar het strand ernaast.</li>
              <li>Oudere metingen zonder board-oordeel tellen mee via surfers in het water, plat of closeout (gemarkeerd als "afgeleid").</li>
            </ul>
          </TableHelp>
        </>
      )}
    </section>
  );
}
