import React, { useId } from 'react';
import { TIDE, GOOD, smoothPath, windowsAbove } from './tide';

/**
 * De dag als één lijn: kans van 06 tot 21 uur, licht waar het ≥ 65% is.
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
}

const H0 = 6, H1 = 21;

export const DayLine: React.FC<Props> = ({ hours, chances, tide, width, height, now, uncertain, axis, label }) => {
  const clip = useId().replace(/:/g, '');
  const tideBand = tide ? 34 : 0, axisBand = axis ? 20 : 0;
  const base = height - tideBand - axisBand - 1, top = 8;
  const x = (h: number) => 2 + ((h - H0) / (H1 - H0)) * (width - 4);
  const y = (c: number) => base - (Math.max(0, Math.min(100, c)) / 100) * (base - top);
  const pts = hours.map((h, i) => [x(h), y(chances[i])] as [number, number]).filter(p => p[0] >= 0 && p[0] <= width);
  if (pts.length < 2) return <svg width={width} height={height} role="img" aria-label={label} />;
  const line = smoothPath(pts, top, base);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  const wins = windowsAbove(hours, chances, GOOD);

  const tidePts = tide ? hours.map((h, i) => [x(h), tide[i]] as const).filter(([px, v]) => typeof v === 'number' && px >= 0 && px <= width)
    .map(([px, v]) => [px, base + 12 + (1 - (v as number)) * (tideBand - 16)] as [number, number]) : [];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={clip}>{wins.map(([a, b], i) => <rect key={i} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={base} />)}</clipPath>
      </defs>
      <path d={area} fill={TIDE.foam} opacity={uncertain ? 0.6 : 1} />
      {wins.length > 0 && <path d={area} fill={TIDE.sun} opacity={uncertain ? 0.55 : 0.92} clipPath={`url(#${clip})`} />}
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
      {axis && [6, 9, 12, 15, 18, 21].map(h => (
        <text key={h} x={x(h)} y={height - 4} textAnchor={h === 6 ? 'start' : h === 21 ? 'end' : 'middle'} fontFamily="DM Mono" fontSize={10} letterSpacing={1} fill={TIDE.sea}>{String(h).padStart(2, '0')}</text>
      ))}
    </svg>
  );
};
