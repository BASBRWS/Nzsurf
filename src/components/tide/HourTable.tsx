import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { ForecastData, SurfSpot } from '../../types';
import type { DayPlan } from '../home/AnswerCard';
import { computeSurfChance, degreesToCompass16 } from '../../utils/spotKnowledge';
import { reasonSentence, windTypeNl } from '../../utils/surfMoments';
import { OK, TIDE, hourOf, surfFill } from './tide';

/**
 * Uurstaat: dagen bovenaan (met een tijdlijn waar het te surfen is), daaronder per uur
 * een kolom met eerst het oordeel en dan de cijfers. Groen = te surfen, licht → diep naar zekerheid.
 */
interface Props {
  spot: SurfSpot;
  forecasts: ForecastData[];
  plans: DayPlan[];
  chance: (f: ForecastData) => number;
  personal: boolean;
  focusDay?: string | null;          // yyyy-MM-dd
  onSelectHour?: (f: ForecastData) => void;
}

const COL = 76;            // breedte van een uurkolom
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');
const word = (h: number) => (h < 0.3 ? 'vlak' : h < 0.5 ? 'knie' : h < 0.75 ? 'heup' : h < 1.0 ? 'borst' : h < 1.3 ? 'schouder' : h < 1.7 ? 'hoofd' : 'overhead');
const darkText = (c: number) => c >= 68; // vanaf hier is het groen donker genoeg voor lichte tekst
const windShort: Record<string, string> = { offshore: 'aflandig', 'side-offshore': 'zij-afl.', 'cross-shore': 'zij', 'side-onshore': 'zij-aanl.', onshore: 'aanlandig' };
const isOff = (t?: string) => t === 'offshore' || t === 'side-offshore';
const Mono: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <span className={`tide-mono text-[10px] text-[color:var(--tide-sea)] ${className}`} style={{ letterSpacing: '0.06em', ...style }}>{children}</span>
);

/** Pijl in de richting waarin het water of de wind gáát (graden = waar het vandaan komt). */
const Arrow: React.FC<{ deg: number; color?: string; size?: number }> = ({ deg, color = TIDE.ink, size = 14 }) => (
  <svg width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true" style={{ transform: `rotate(${deg + 180}deg)`, flex: 'none' }}>
    <path d="M0,-6 L4,4 L0,2 L-4,4 Z" fill={color} />
  </svg>
);

export const HourTable: React.FC<Props> = ({ spot, forecasts, plans, chance, personal, focusDay, onSelectHour }) => {
  const firstWithData = Math.max(0, plans.findIndex(p => p.items.length));
  const [sel, setSel] = useState(firstWithData);
  useEffect(() => {
    if (!focusDay) return;
    const i = plans.findIndex(p => format(p.day, 'yyyy-MM-dd') === focusDay);
    if (i >= 0) setSel(i);
  }, [focusDay, plans]);

  const plan = plans[sel];
  const now = new Date();
  const isToday = plan ? isSameDay(plan.day, now) : false;

  // Alle daglichturen van de gekozen dag (ook al voorbij bij vandaag: dan zie je de hele dag).
  const items = useMemo(() => !plan ? [] : forecasts
    .filter(f => isSameDay(parseISO(f.timestamp), plan.day) && hourOf(f) >= 6 && hourOf(f) <= 21 && f.isDaylight !== false)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [forecasts, plan]);
  const rows = useMemo(() => items.map(f => {
    const c = computeSurfChance(spot, f);
    return { f, k: chance(f), beach: c.spotWave };
  }), [items, spot, chance]);
  const nowIdx = isToday && rows.length
    ? rows.reduce((bi, r, i) => (Math.abs(hourOf(r.f) - (now.getHours() + now.getMinutes() / 60)) < Math.abs(hourOf(rows[bi].f) - (now.getHours() + now.getMinutes() / 60)) ? i : bi), 0)
    : -1;

  // Bij het wisselen van dag: naar "nu" of naar het begin van het surfvenster scrollen.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const target = nowIdx >= 0 ? nowIdx : Math.max(0, rows.findIndex(r => r.k >= OK));
    el.scrollTo({ left: Math.max(0, (target - 1) * COL), behavior: 'smooth' });
  }, [sel, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Getijlijn: tideLevel 0 (laag) – 1 (hoog) per kolom; HW/LW uit dayTideTurns als die er zijn.
  const tideH = 56;
  const tidePts = rows.map((r, i) => (typeof r.f.tideLevel === 'number' ? [i * COL + COL / 2, 8 + (1 - r.f.tideLevel) * (tideH - 18)] as [number, number] : null));
  const tidePath = tidePts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(' ');
  const turns = (rows[0]?.f.dayTideTurns || []).map(t => {
    const [hh, mm] = t.time.split(':').map(Number);
    const h = hh + (mm || 0) / 60;
    if (!rows.length || h < hourOf(rows[0].f) - 0.5 || h > hourOf(rows[rows.length - 1].f) + 0.5) return null;
    // x tussen de kolommen interpoleren
    let i = 0; while (i < rows.length - 1 && hourOf(rows[i + 1].f) < h) i++;
    const h0 = hourOf(rows[i].f), h1 = rows[i + 1] ? hourOf(rows[i + 1].f) : h0 + 1;
    const x = i * COL + COL / 2 + ((h - h0) / Math.max(0.01, h1 - h0)) * COL;
    return { x, label: `${t.isHigh ? 'HW' : 'LW'} ${t.time}`, high: t.isHigh };
  }).filter((t): t is { x: number; label: string; high: boolean } => !!t);

  if (!plan) return null;
  const win = plan.peak && plan.peakChance >= OK && plan.start && plan.end;

  const dayRange = (p: DayPlan) => {
    if (!p.items.length) return null;
    const hs = p.items.map(f => computeSurfChance(spot, f).spotWave);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    return Math.abs(hi - lo) < 0.05 ? `${fmt1(hi)} m` : `${fmt1(lo)}–${fmt1(hi)} m`;
  };

  const th = 'sticky left-0 z-[1] bg-[color:var(--tide-paper)] pl-1 pr-2 text-left align-middle';
  const colCls = (i: number) => (i === nowIdx ? 'bg-[color:var(--tide-sand)]' : '');

  return (
    <section aria-label="Uurstaat" className="text-[color:var(--tide-ink)]">
      {/* Dagen */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-2 [scrollbar-width:none]" role="tablist" aria-label="Kies een dag">
        {plans.map((p, i) => {
          const on = i === sel, range = dayRange(p);
          const peakType = p.peak?.windType;
          return (
            <button key={i} role="tab" aria-selected={on} disabled={!p.items.length} onClick={() => setSel(i)}
              className={`shrink-0 w-[112px] rounded-2xl border px-3 py-2.5 text-left cursor-pointer disabled:opacity-40 disabled:cursor-default ${on ? 'bg-[color:var(--tide-ink)] border-[color:var(--tide-ink)] text-[color:var(--tide-sand)]' : 'bg-[color:var(--tide-sand)] border-[color:var(--tide-line)]'}`}
              aria-label={`${i === 0 ? 'Vandaag' : format(p.day, 'EEEE d MMMM', { locale: nl })}${p.peakChance >= OK && p.start ? `, te surfen ${format(p.start, 'HH')} tot ${format(p.end!, 'HH')} uur` : ', niet te surfen'}`}>
              <Mono className={on ? '!text-[#b9cdc8]' : ''}>{i === 0 ? 'vandaag' : format(p.day, 'EEEEEE d', { locale: nl })}</Mono>
              <span className="block mt-1 text-[18px] font-semibold tracking-[-0.02em] leading-tight">{range ?? '–'}</span>
              <span className={`block text-[12.5px] leading-tight ${on ? 'text-[#cfe0da]' : 'text-[color:var(--tide-sea)]'}`}>{peakType ? windTypeNl(peakType) : ' '}</span>
              {/* Tijdlijn 06–21 met groen waar het te surfen is */}
              <span className={`relative block mt-2 h-2 rounded overflow-hidden ${on ? 'bg-[#2b4547]' : 'bg-[color:var(--tide-foam)]'}`} aria-hidden="true">
                {p.items.map((f, j) => {
                  const c = chance(f); if (c < OK) return null;
                  const h = hourOf(f), next = p.items[j + 1] ? hourOf(p.items[j + 1]) : h + 1;
                  return <i key={j} className="absolute top-0 bottom-0" style={{ left: `${((h - 6) / 15) * 100}%`, width: `${(Math.max(0.6, next - h) / 15) * 100}%`, background: surfFill(c) }} />;
                })}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kop en antwoord */}
      <h3 className="mt-4 text-[28px] leading-[1.05] tracking-[-0.02em] first-letter:uppercase">{isToday ? 'Vandaag' : format(plan.day, 'EEEE d MMMM', { locale: nl })}</h3>
      <Mono className="block mt-1.5 text-[color:var(--tide-mist)]">{personal ? 'kans voor jou' : 'algemene kans'} · golf aan het strand</Mono>
      {plan.peak && (
        <p className="mt-3 text-[16px] leading-snug text-[color:var(--tide-sea)]">
          <b className="text-[color:var(--tide-ink)] font-semibold">{win ? `Surfen tussen ${format(plan.start!, 'HH')} en ${format(plan.end!, 'HH')} uur.` : 'Niet te surfen.'}</b>{' '}
          {reasonSentence(spot, plan.peak)}
        </p>
      )}

      {/* Uren */}
      {rows.length ? (
        <div ref={scroller} className="mt-4 overflow-x-auto -mx-1 [scrollbar-width:thin]">
          <table className="border-separate border-spacing-0" style={{ minWidth: 60 + rows.length * COL }}>
            <colgroup><col style={{ width: 60 }} />{rows.map((_, i) => <col key={i} style={{ width: COL }} />)}</colgroup>
            <tbody>
              <tr>
                <th className={th} />
                {rows.map((r, i) => (
                  <td key={i} className={`h-8 text-center text-[13px] font-semibold ${colCls(i)} rounded-t-xl`}>
                    {i === nowIdx ? <span className="tide-mono text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)]">NU</span> : format(parseISO(r.f.timestamp), 'HH:mm')}
                  </td>
                ))}
              </tr>
              <tr>
                <th className={th}><Mono>KANS</Mono></th>
                {rows.map((r, i) => {
                  const ok = r.k >= OK;
                  return (
                    <td key={i} className={`h-[66px] px-[3px] ${colCls(i)}`}>
                      <button onClick={() => onSelectHour?.(r.f)} aria-label={`${format(parseISO(r.f.timestamp), 'HH:mm')}: ${r.k}%, ${ok ? 'te surfen' : 'niet te surfen'}. Details`}
                        className="w-full h-[58px] rounded-xl flex flex-col items-center justify-center cursor-pointer"
                        style={ok ? { background: surfFill(r.k), color: darkText(r.k) ? TIDE.sand : TIDE.ink } : { background: 'var(--tide-sand)', border: '1px solid var(--tide-line)' }}>
                        <span className="text-[17px] font-semibold tracking-[-0.02em] leading-none">{r.k}%</span>
                        <span className="tide-mono text-[9px] mt-1 opacity-85" style={{ letterSpacing: '0.08em' }}>{ok ? (r.k >= 70 ? 'goed' : 'kan') : 'nee'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th className={th}><Mono>STRAND</Mono></th>
                {rows.map((r, i) => (
                  <td key={i} className={`h-[60px] text-center ${colCls(i)}`}>
                    <span className="block text-[21px] font-semibold tracking-[-0.03em] leading-none">{fmt1(r.beach)}</span>
                    <Mono className="block mt-1">{word(r.beach)}</Mono>
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${th} border-t border-[color:var(--tide-line)]`}><Mono>ZEE</Mono></th>
                {rows.map((r, i) => (
                  <td key={i} className={`h-[50px] text-center border-t border-[color:var(--tide-line)] ${colCls(i)}`}>
                    <span className="block text-[14px] font-medium leading-none">{fmt1(r.f.waveHeight)} m</span>
                    <Mono className="block mt-1">{Math.round(r.f.swellPeriod)} s</Mono>
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${th} border-t border-[color:var(--tide-line)]`}><Mono>SWELL</Mono></th>
                {rows.map((r, i) => (
                  <td key={i} className={`h-[44px] border-t border-[color:var(--tide-line)] ${colCls(i)}`}>
                    <span className="flex items-center justify-center gap-1 text-[13px]"><Arrow deg={r.f.swellDirection} color={TIDE.sea} />{degreesToCompass16(r.f.swellDirection)}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${th} border-t border-[color:var(--tide-line)]`}><Mono>WIND</Mono></th>
                {rows.map((r, i) => (
                  <td key={i} className={`h-[64px] text-center border-t border-[color:var(--tide-line)] ${colCls(i)}`}>
                    <span className="flex items-center justify-center gap-1">
                      <Arrow deg={r.f.windDirection} />
                      <span className="text-[17px] font-semibold leading-none">{Math.round(r.f.windSpeed)}</span>
                      <span className="text-[10px] text-[color:var(--tide-sea)]">kn</span>
                    </span>
                    <span style={{ letterSpacing: '0.02em' }} className={`inline-block mt-1.5 px-1 py-0.5 rounded-md tide-mono text-[9px] ${isOff(r.f.windType) ? 'bg-[#dceadb] text-[#1f5f35]' : 'text-[color:var(--tide-sea)]'}`}>
                      {windShort[r.f.windType || ''] || degreesToCompass16(r.f.windDirection)}
                    </span>
                  </td>
                ))}
              </tr>
              {tidePath && (
                <tr>
                  <th className={`${th} border-t border-[color:var(--tide-line)]`}><Mono>GETIJ</Mono></th>
                  <td colSpan={rows.length} className="border-t border-[color:var(--tide-line)] p-0">
                    <svg width={rows.length * COL} height={tideH} role="img" aria-label={`Getij${turns.length ? ': ' + turns.map(t => t.label).join(', ') : ''}`} style={{ display: 'block' }}>
                      {nowIdx >= 0 && <rect x={nowIdx * COL} y={0} width={COL} height={tideH} fill={TIDE.sand} />}
                      <path d={tidePath} fill="none" stroke={TIDE.sea} strokeWidth={1.6} strokeLinejoin="round" />
                      {turns.map((t, k) => (
                        <g key={k}>
                          <line x1={t.x} x2={t.x} y1={t.high ? 10 : tideH - 12} y2={t.high ? 16 : tideH - 6} stroke={TIDE.sea} strokeWidth={1.2} />
                          <text x={Math.min(rows.length * COL - 30, Math.max(30, t.x))} y={t.high ? 8 : tideH - 1} textAnchor="middle" fontFamily="DM Mono" fontSize={9} letterSpacing={0.8} fill={TIDE.sea}>{t.label}</text>
                        </g>
                      ))}
                    </svg>
                  </td>
                </tr>
              )}
              <tr>
                <th className={`${th} border-t border-[color:var(--tide-line)]`}><Mono>LUCHT</Mono></th>
                {rows.map((r, i) => (
                  <td key={i} className={`h-[44px] text-center border-t border-[color:var(--tide-line)] text-[13px] ${colCls(i)} rounded-b-xl`}>
                    {Math.round(r.f.airTemp)}°
                    {(r.f.precipitation ?? 0) >= 0.2 && <Mono className="block">{fmt1(r.f.precipitation!)} mm</Mono>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-[15px] text-[color:var(--tide-sea)]">Geen uren met daglicht voor deze dag.</p>}

      <div className="mt-2 flex justify-between gap-3">
        <Mono className="!text-[color:var(--tide-mist)]">tik een uur: details</Mono>
        {rows.length > 4 && <Mono className="!text-[color:var(--tide-mist)]">veeg voor meer →</Mono>}
      </div>
    </section>
  );
};
