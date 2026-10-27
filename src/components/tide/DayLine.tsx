import React, { useId, useRef, useState } from 'react';
import { TIDE, GOOD, smoothPath, surfFill, windowsAbove } from './tide';

/**
 * De dag als één lijn: kans van 06 tot 21 uur, groen waar het te surfen is (hoe dieper, hoe zekerder).
 * Groot (Vandaag, met getij, uren en "nu") of klein (één rij in de week).
 */
interface Props {
  hours: number[];          // lokale uren (decimaal) van de punten
  chances: number[];        // 0–100
  tide?: (number | undefined)[]; // 0–1, optioneel
  width: number;
  height: number;
  now?: number;             // lokaal uur voor de nu-markering
  uncertain?: boolean;      // verder vooruit: lijn gestippeld, licht gedempt
  axis?: boolean;
  label?: string;           // schermlezer
  heights?: { h: number; v: number }[]; // golfhoogte aan het strand op een paar uren, onder de lijn
  tips?: { h: number; text: string }[];  // aanwijzen/vegen: tijd en cijfers van het dichtstbijzijnde blok
  values?: number[];        // als gegeven: de lijn is de golfhoogte (m); groen blijft "te surfen" uit chances
  scaleMax?: number;        // bovenkant van de hoogteschaal (m)
  guides?: number[];        // hulplijnen op deze hoogtes (m), met label
}

const H0 = 6, H1 = 21;

export const DayLine: React.FC<Props> = ({ hours, chances, tide, width, height, now, uncertain, axis, label, heights, tips, values, scaleMax = 2.5, guides }) => {
  const clip = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const tideBand = tide ? 34 : 0, axisBand = axis ? 20 : 0, hBand = heights?.length ? 16 : 0;
  const base = height - tideBand - axisBand - hBand - 1, top = 8;
  const x = (h: number) => 2 + ((h - H0) / (H1 - H0)) * (width - 4);
  const y = (c: number) => base - (Math.max(0, Math.min(100, c)) / 100) * (base - top);
  const yH = (m: number) => base - (Math.max(0, Math.min(scaleMax, m)) / scaleMax) * (base - top);
  const yAt = (i: number) => (values ? yH(values[i] ?? 0) : y(chances[i]));
  const pts = hours.map((h, i) => [x(h), yAt(i)] as [number, number]).filter(p => p[0] >= 0 && p[0] <= width);
  if (pts.length < 2) return <svg width={width} height={height} role="img" aria-label={label} />;
  const line = smoothPath(pts, top, base);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  const wins = windowsAbove(hours, chances, GOOD);

  const tidePts = tide ? hours.map((h, i) => [x(h), tide[i]] as const).filter(([px, v]) => typeof v === 'number' && px >= 0 && px <= width)
    .map(([px, v]) => [px, base + 12 + (1 - (v as number)) * (tideBand - 16)] as [number, number]) : [];

  // Aanwijzen (muis) of vegen/tikken (vinger): het dichtstbijzijnde verwachtingsblok.
  const pick = (clientX: number) => {
    if (!tips?.length || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const h = H0 + ((clientX - r.left - 2) / (width - 4)) * (H1 - H0);
    let best = 0;
    tips.forEach((t, i) => { if (Math.abs(t.h - h) < Math.abs(tips[best].h - h)) best = i; });
    window.clearTimeout(hideTimer.current);
    setHover(best);
  };
  const tip = hover !== null && tips ? tips[hover] : null;
  const tipY = tip ? (() => {
    let bi = 0; hours.forEach((hh, i) => { if (Math.abs(hh - tip.h) < Math.abs(hours[bi] - tip.h)) bi = i; });
    return yAt(bi);
  })() : 0;
  const tipW = tip ? Math.min(width, tip.text.length * 6.6 + 18) : 0;
  const tipX = tip ? Math.max(0, Math.min(width - tipW, x(tip.h) - tipW / 2)) : 0;

  return (
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}
      style={{ display: 'block', overflow: 'visible', touchAction: tips ? 'pan-y' : undefined, cursor: tips ? 'crosshair' : undefined }}
      onPointerDown={e => pick(e.clientX)} onPointerMove={e => pick(e.clientX)}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}
      onPointerUp={e => { if (e.pointerType !== 'mouse') hideTimer.current = window.setTimeout(() => setHover(null), 2500); }}>
      <defs>
        <clipPath id={clip}>{wins.map(([a, b], i) => <rect key={i} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={base} />)}</clipPath>
        {/* Groen loopt mee met de kans: licht net boven de grens, diep bij een (bijna) zeker moment. */}
        <linearGradient id={`${clip}g`} gradientUnits="userSpaceOnUse" x1={0} x2={width} y1={0} y2={0}>
          {hours.map((h, i) => <stop key={i} offset={Math.max(0, Math.min(1, x(h) / width))} stopColor={surfFill(chances[i] ?? 0)} />)}
        </linearGradient>
      </defs>
      <path d={area} fill={TIDE.foam} opacity={uncertain ? 0.6 : 1} />
      {wins.length > 0 && <path d={area} fill={`url(#${clip}g)`} opacity={uncertain ? 0.6 : 0.95} clipPath={`url(#${clip})`} />}
      {values && guides?.filter(g => g < scaleMax).map(g => (
        <g key={g}>
          <line x1={0} x2={width} y1={yH(g)} y2={yH(g)} stroke={TIDE.ink} strokeWidth={0.6} opacity={0.35} strokeDasharray="2 4" />
          <text x={width - 2} y={yH(g) - 3} textAnchor="end" fontFamily="DM Mono" fontSize={9.5} letterSpacing={0.6} fill={TIDE.mist}>{String(g).replace('.', ',')} m</text>
        </g>
      ))}
      <path d={line} fill="none" stroke={TIDE.ink} strokeWidth={1.5} strokeDasharray={uncertain ? '3 4' : undefined} strokeLinecap="round" />
      <line x1={0} x2={width} y1={base} y2={base} stroke={TIDE.ink} strokeWidth={1} opacity={axis ? 1 : 0.4} />
      {typeof now === 'number' && now > H0 && now < H1 && (
        <g>
          <line x1={x(now)} x2={x(now)} y1={14} y2={base} stroke={TIDE.ink} strokeWidth={1} strokeDasharray="2 3" />
          <text x={x(now) + 6} y={22} fontFamily="DM Mono" fontSize={10} letterSpacing={1.4} fill={TIDE.ink}>NU</text>
        </g>
      )}
      {tidePts.length > 1 && (
        <g>
          <path d={smoothPath(tidePts)} fill="none" stroke={TIDE.mist} strokeWidth={1.2} />
          <text x={width - 2} y={base + 10} textAnchor="end" fontFamily="DM Mono" fontSize={9.5} letterSpacing={1.4} fill={TIDE.mist}>GETIJ</text>
        </g>
      )}
      {heights?.map(({ h, v }) => (
        <text key={h} x={x(h)} y={base + 13} textAnchor="middle" fontFamily="DM Mono" fontSize={10} letterSpacing={0.6} fill={TIDE.sea}>
          {v.toFixed(1).replace('.', ',')} m
        </text>
      ))}
      {tip && (
        <g pointerEvents="none">
          <line x1={x(tip.h)} x2={x(tip.h)} y1={0} y2={base} stroke={TIDE.ink} strokeWidth={1} />
          <circle cx={x(tip.h)} cy={tipY} r={4.5} fill={TIDE.sand} stroke={TIDE.ink} strokeWidth={1.5} />
          <rect x={tipX} y={-30} width={tipW} height={24} rx={12} fill={TIDE.ink} />
          <text x={tipX + tipW / 2} y={-14} textAnchor="middle" fontFamily="Instrument Sans" fontSize={12} fontWeight={600} fill={TIDE.sand}>{tip.text}</text>
        </g>
      )}
      {axis && [6, 9, 12, 15, 18, 21].map(h => (
        <text key={h} x={x(h)} y={height - 4} textAnchor={h === 6 ? 'start' : h === 21 ? 'end' : 'middle'} fontFamily="DM Mono" fontSize={10} letterSpacing={1} fill={TIDE.sea}>{String(h).padStart(2, '0')}</text>
      ))}
    </svg>
  );
};
