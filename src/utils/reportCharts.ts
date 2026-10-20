// Grafieken voor het rapport: statische SVG (scherp in HTML én PDF, geen bibliotheek).
//
// Vaste kleur per entiteit (gevalideerd op kleurenblindheid, lichte achtergrond):
//   NzSurf = blauw, Hybride = oranje, beste andere bron = aqua; meting = donkergrijs;
//   overige bronnen = lichtgrijs. Aqua heeft weinig contrast → altijd een label of tabel erbij.
// Eén y-as per grafiek; lijnen 2 px, markers ≥ 8 px; staven dun met afgeronde kop.

export const C = {
  nz: '#2a78d6', hybrid: '#eb6834', best: '#1baf7a', obs: '#52514e', other: '#c9c8c2',
  text: '#0b0b0b', text2: '#52514e', grid: '#e7e6e2', surface: '#fcfcfb',
};
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (x: number, d: number) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "Mooie" bovengrens en stapgrootte voor een as vanaf 0. */
function niceMax(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}
const decOf = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export interface BarRow { label: string; value: number; role?: 'nz' | 'hybrid' | 'best' | 'other' }

/**
 * Liggende staven, kleinste afwijking bovenaan (lager = beter). Eigen bronnen in hun kleur,
 * de rest lichtgrijs; waarde rechts van de staaf in tekstkleur.
 */
export function barChart(title: string, unit: string, rows: BarRow[], decimals = 2, note?: string): string {
  if (!rows.length) return '';
  const sorted = [...rows].sort((a, b) => a.value - b.value).slice(0, 16);
  const W = 640, labelW = 210, valW = 70, rowH = 22, top = 34, plotW = W - labelW - valW;
  const H = top + sorted.length * rowH + 26;
  const { top: max, step } = niceMax(Math.max(...sorted.map(r => r.value)));
  const x = (v: number) => labelW + (v / max) * plotW;
  const ticks: string[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) {
    ticks.push(`<line x1="${x(v)}" y1="${top - 4}" x2="${x(v)}" y2="${H - 22}" stroke="${C.grid}" stroke-width="1"/>`
      + `<text x="${x(v)}" y="${H - 8}" font-size="10" fill="${C.text2}" text-anchor="middle">${fmt(v, decOf(step))}</text>`);
  }
  const bars = sorted.map((r, i) => {
    const y = top + i * rowH, w = Math.max(2, x(r.value) - labelW), color = C[r.role || 'other'];
    const bold = r.role && r.role !== 'other' ? ' font-weight="700"' : '';
    return `<text x="${labelW - 8}" y="${y + 14}" font-size="11" fill="${C.text}" text-anchor="end"${bold}>${esc(r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label)}</text>`
      + `<path d="M${labelW},${y + 5} h${w - 4} a4,4 0 0 1 4,4 v4 a4,4 0 0 1 -4,4 h${-(w - 4)} z" fill="${color}"/>`
      + `<text x="${x(r.value) + 6}" y="${y + 14}" font-size="11" fill="${C.text}"${bold}>${fmt(r.value, decimals)}</text>`;
  }).join('');
  return `<figure class="chart"><figcaption>${esc(title)} <span>(gem. afwijking in ${esc(unit)}; korter = beter)</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}" font-family="${FONT}" style="max-width:${W}px">
${ticks.join('')}<line x1="${labelW}" y1="${top - 4}" x2="${labelW}" y2="${H - 22}" stroke="${C.text2}" stroke-width="1"/>${bars}
</svg>${note ? `<p class="meta">${esc(note)}</p>` : ''}</figure>`;
}

export interface LineSeries { name: string; color: string; values: (number | undefined)[]; dashed?: boolean }

/** Lijngrafiek over categorieën (bv. looptijden), met legenda en label aan het eind van elke lijn. */
export function lineChart(title: string, unit: string, xLabels: string[], series: LineSeries[], decimals = 2): string {
  // Lege categorieën aan het eind (geen enkele reeks heeft er data) weglaten.
  let last = xLabels.length - 1;
  while (last > 0 && !series.some(s => typeof s.values[last] === 'number')) last--;
  xLabels = xLabels.slice(0, last + 1);
  series = series.map(s => ({ ...s, name: s.name.split(' ')[0].slice(0, 12), values: s.values.slice(0, last + 1) }));
  const live = series.filter(s => s.values.some(v => typeof v === 'number'));
  if (!live.length || xLabels.length < 2) return '';
  const W = 330, H = 200, L = 40, R = 96, T = 14, B = 34, pw = W - L - R, ph = H - T - B;
  const all = live.flatMap(s => s.values.filter((v): v is number => typeof v === 'number'));
  const { top: max, step } = niceMax(Math.max(...all));
  const x = (i: number) => L + (i / (xLabels.length - 1)) * pw;
  const y = (v: number) => T + ph - (v / max) * ph;
  const grid: string[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid.push(`<line x1="${L}" y1="${y(v)}" x2="${L + pw}" y2="${y(v)}" stroke="${C.grid}"/><text x="${L - 6}" y="${y(v) + 3}" font-size="9" fill="${C.text2}" text-anchor="end">${fmt(v, decOf(step))}</text>`);
  }
  const xl = xLabels.map((l, i) => `<text x="${x(i)}" y="${H - 18}" font-size="9" fill="${C.text2}" text-anchor="middle">${esc(l)}</text>`).join('');
  // Eindlabels zonder overlap: op volgorde van y, minstens 11 px uit elkaar.
  const ends = live.map(s => { let i = s.values.length - 1; while (i >= 0 && typeof s.values[i] !== 'number') i--; return { s, i, yv: i >= 0 ? y(s.values[i] as number) : 0 }; })
    .filter(e => e.i >= 0).sort((a, b) => a.yv - b.yv);
  for (let k = 1; k < ends.length; k++) if (ends[k].yv - ends[k - 1].yv < 11) ends[k].yv = ends[k - 1].yv + 11;
  const lines = live.map(s => {
    const pts = s.values.map((v, i) => (typeof v === 'number' ? [x(i), y(v)] : null));
    let d = '', pen = false;
    pts.forEach(p => { if (!p) { pen = false; return; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `; pen = true; });
    const dots = pts.map(p => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color}" stroke="${C.surface}" stroke-width="2"/>` : '')).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="5 3"' : ''}/>${dots}`;
  }).join('');
  const labels = ends.map(e => {
    const v = e.s.values[e.i] as number;
    return `<text x="${x(e.i) + 8}" y="${e.yv + 3}" font-size="10" fill="${C.text}"><tspan fill="${e.s.color}">●</tspan> ${esc(e.s.name)} ${fmt(v, decimals)}</text>`;
  }).join('');
  return `<figure class="chart small"><figcaption>${esc(title)} <span>(${esc(unit)})</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}" font-family="${FONT}" style="max-width:${W}px">
${grid.join('')}${xl}${lines}${labels}</svg></figure>`;
}

export interface TimePoint { t: number; v: number }
export interface TimeSeries { name: string; color: string; points: TimePoint[]; dashed?: boolean; width?: number }

/** Tijdreeks (bv. golfhoogte: meting vs verwachting), dagen op de x-as, legenda boven. */
export function timeChart(title: string, unit: string, series: TimeSeries[], decimals = 1): string {
  const live = series.filter(s => s.points.length > 1);
  if (!live.length) return '';
  const W = 640, H = 230, L = 40, R = 14, T = 30, B = 30, pw = W - L - R, ph = H - T - B;
  const ts = live.flatMap(s => s.points.map(p => p.t));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const { top: max, step } = niceMax(Math.max(...live.flatMap(s => s.points.map(p => p.v))));
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * pw;
  const y = (v: number) => T + ph - (v / max) * ph;
  const grid: string[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid.push(`<line x1="${L}" y1="${y(v)}" x2="${L + pw}" y2="${y(v)}" stroke="${C.grid}"/><text x="${L - 6}" y="${y(v) + 3}" font-size="9" fill="${C.text2}" text-anchor="end">${fmt(v, decOf(step))}</text>`);
  }
  // Daglijnen om 00:00 lokale tijd.
  const days: string[] = [];
  const d = new Date(t0); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1);
  for (; d.getTime() <= t1; d.setDate(d.getDate() + 1)) {
    const xx = x(d.getTime());
    days.push(`<line x1="${xx}" y1="${T}" x2="${xx}" y2="${T + ph}" stroke="${C.grid}" stroke-dasharray="2 3"/>`
      + `<text x="${xx + 3}" y="${H - 12}" font-size="9" fill="${C.text2}">${esc(d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' }))}</text>`);
  }
  const lines = live.map(s => {
    const pts = [...s.points].sort((a, b) => a.t - b.t);
    let path = '', prev: TimePoint | null = null;
    for (const p of pts) { path += `${!prev || p.t - prev.t > 7 * 3600e3 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} `; prev = p; }
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2}"${s.dashed ? ' stroke-dasharray="5 3"' : ''} stroke-linejoin="round"/>`;
  }).join('');
  let lx = L;
  const legend = live.map(s => {
    const item = `<line x1="${lx}" y1="12" x2="${lx + 18}" y2="12" stroke="${s.color}" stroke-width="${s.width ?? 2}"${s.dashed ? ' stroke-dasharray="5 3"' : ''}/><text x="${lx + 23}" y="15" font-size="10" fill="${C.text}">${esc(s.name)}</text>`;
    lx += 30 + s.name.length * 5.6;
    return item;
  }).join('');
  return `<figure class="chart"><figcaption>${esc(title)} <span>(${esc(unit)})</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}" font-family="${FONT}" style="max-width:${W}px">
${grid.join('')}${days.join('')}${lines}${legend}</svg></figure>`;
}

/** Staaf 0–100% met eigen bronnen gekleurd (voor "Te surfen?"), hoogste bovenaan. */
export function pctChart(title: string, rows: { label: string; pct: number; role?: BarRow['role']; sub?: string }[], note?: string): string {
  if (!rows.length) return '';
  const sorted = [...rows].sort((a, b) => b.pct - a.pct).slice(0, 16);
  const W = 640, labelW = 210, rowH = 28, top = 26, plotW = 300;
  const H = top + sorted.length * rowH + 24;
  const x = (v: number) => labelW + v / 100 * plotW;
  const ticks = [0, 25, 50, 75, 100].map(v => `<line x1="${x(v)}" y1="${top - 4}" x2="${x(v)}" y2="${H - 20}" stroke="${v === 50 ? C.text2 : C.grid}"${v === 50 ? ' stroke-dasharray="3 3"' : ''}/><text x="${x(v)}" y="${H - 6}" font-size="10" fill="${C.text2}" text-anchor="middle">${v}%</text>`).join('');
  const bars = sorted.map((r, i) => {
    const y = top + i * rowH, w = Math.max(2, x(r.pct) - labelW), bold = r.role && r.role !== 'other' ? ' font-weight="700"' : '';
    return `<text x="${labelW - 8}" y="${y + 12}" font-size="11" fill="${C.text}" text-anchor="end"${bold}>${esc(r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label)}</text>`
      + `<path d="M${labelW},${y + 4} h${w - 4} a4,4 0 0 1 4,4 v2 a4,4 0 0 1 -4,4 h${-(w - 4)} z" fill="${C[r.role || 'other']}"/>`
      + `<text x="${x(r.pct) + 6}" y="${y + 12}" font-size="11" fill="${C.text}"${bold}>${r.pct}%</text>`
      + (r.sub ? `<text x="${labelW}" y="${y + 25}" font-size="9" fill="${C.text2}">${esc(r.sub)}</text>` : '');
  }).join('');
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}" font-family="${FONT}" style="max-width:${W}px">${ticks}${bars}</svg>${note ? `<p class="meta">${esc(note)}</p>` : ''}</figure>`;
}
