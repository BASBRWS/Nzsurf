import { AuditPoint } from './forecastAudit';

/**
 * Uitlezers voor surfsites die de admin-app ophaalt (Surfline, surfnerd).
 * Puur (geen I/O), zodat de app en de controle-workflow (audit-raw-dump)
 * precies dezelfde uitkomst geven.
 */

const HORIZON_HOURS = 7 * 24;
const STEP_HOURS = 3;

const round = (v: unknown, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined;
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const keepWindow = (points: AuditPoint[]) => points
  .map(p => clean(p))
  .filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS && new Date(p.t).getUTCHours() % STEP_HOURS === 0);

export const toMeters = (v: unknown, unit?: string) =>
  typeof v === 'number' ? (/^(ft|feet)$/i.test(String(unit)) ? v * 0.3048 : v) : undefined;
export const toKnots = (v: unknown, unit?: string) => {
  if (typeof v !== 'number') return undefined;
  switch (String(unit).toLowerCase().replace(/\s/g, '')) {
    case 'mph': return v * 0.868976;
    case 'kph': case 'km/h': case 'kmh': return v / 1.852;
    case 'ms': case 'm/s': return v * 1.943844;
    default: return v; // kts / kn
  }
};

// ── Surfline (services.surfline.com/kbyg) ───────────────────────────────────
// swells: data.swells[].swells[] {height, period, direction}  (eenheid associated.units.swellHeight)
// surf:   data.surf[].surf {min, max}                         (eenheid associated.units.surfHeight/waveHeight)
// wind:   data.wind[] {speed, direction, gust}                (eenheid associated.units.windSpeed)
// rating: data.rating[].rating.key
// De oude 'wave'-API (swells + surf samen) wordt ook nog gelezen als die er is.

export function parseSurfline(src: { wave?: any; swells?: any; surf?: any; wind?: any; rating?: any }, runAt: Date): AuditPoint[] {
  const byT = new Map<number, AuditPoint>();
  const at = (ts: number) => {
    if (!byT.has(ts)) byT.set(ts, { t: new Date(ts * 1000).toISOString(), lead: Math.round((ts * 1000 - runAt.getTime()) / 3600e3) });
    return byT.get(ts)!;
  };

  const swellSets = [
    { rows: src.swells?.data?.swells, unit: src.swells?.associated?.units?.swellHeight },
    { rows: src.wave?.data?.wave, unit: src.wave?.associated?.units?.swellHeight },
  ];
  for (const { rows, unit } of swellSets) {
    for (const w of rows || []) {
      if (typeof w?.timestamp !== 'number') continue;
      const parts = (w.swells || []).filter((s: any) => typeof s?.height === 'number' && s.height > 0);
      if (!parts.length) continue;
      const p = at(w.timestamp);
      // Totale significante hoogte uit de deelsystemen; periode/richting van de sterkste (≈ H²·T²).
      p.hs = round(Math.sqrt(parts.reduce((a: number, s: any) => a + toMeters(s.height, unit)! ** 2, 0)));
      const dom = parts.reduce((a: any, s: any) => (s.height ** 2 * (s.period || 1) ** 2 > a.height ** 2 * (a.period || 1) ** 2 ? s : a));
      p.tp = round(dom.period, 1);
      p.dir = round(dom.direction, 0);
    }
  }

  const surfSets = [
    { rows: src.surf?.data?.surf, unit: src.surf?.associated?.units?.surfHeight ?? src.surf?.associated?.units?.waveHeight },
    { rows: src.wave?.data?.wave, unit: src.wave?.associated?.units?.waveHeight },
  ];
  for (const { rows, unit } of surfSets) {
    for (const w of rows || []) {
      if (typeof w?.timestamp !== 'number' || !w.surf) continue;
      const p = at(w.timestamp);
      p.surfMin = round(toMeters(w.surf.min, unit));
      p.surfMax = round(toMeters(w.surf.max, unit));
    }
  }

  const windUnit = src.wind?.associated?.units?.windSpeed;
  for (const w of src.wind?.data?.wind || []) {
    if (typeof w?.timestamp !== 'number') continue;
    const p = at(w.timestamp);
    p.windKn = round(toKnots(w.speed, windUnit), 1);
    p.windDir = round(w.direction, 0);
    p.gustKn = round(toKnots(w.gust, windUnit), 1);
  }

  for (const r of src.rating?.data?.rating || []) {
    if (typeof r?.timestamp !== 'number') continue;
    if (typeof r.rating?.key === 'string') at(r.timestamp).rating = r.rating.key;
  }

  return keepWindow([...byT.values()]);
}

// ── surfnerd (surfnerd.com/surf-forecast/<spot>) ────────────────────────────
// Server-side HTML met een uurtabel ("SN Unity"). Zichtbare tekst na de kop:
//   "💨 Wind mph 🌊 Waves ft ⏱️ Period s. ⚡️ Energy kJ  Su 11 Mo 12 …  12am 26 35 6.4 6.4s. 452  01am …"
// per uur: wind, vlagen, golfhoogte (dominante golf, spot-gecorrigeerd), periode, energie.
// Tijden zijn lokale tijd van de spot (Europe/Amsterdam; app en workflow draaien op NL-tijd).

const DAY_ABBR = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

export function parseSurfnerd(html: string, runAt: Date): AuditPoint[] {
  const text = htmlToText(html);
  const head = text.search(/Energy\s+kJ/i);
  if (head < 0) return [];
  const before = text.slice(Math.max(0, head - 200), head);
  const windUnit = before.match(/Wind\s+(mph|km\/h|kts|kn|m\/s)/i)?.[1] || 'mph';
  const waveUnit = before.match(/Waves\s+(ft|m)\b/i)?.[1] || 'ft';

  const rest = text.slice(head);
  const firstDay = rest.match(new RegExp(`${DAY_ABBR}\\s+(\\d{1,2})\\b`));
  if (!firstDay) return [];
  // Eerste dag van de tabel: de datum rond het ophaalmoment met dit dagnummer.
  const dayNum = Number(firstDay[1]);
  let base: Date | null = null;
  for (let off = -3; off <= 3 && !base; off++) {
    const d = new Date(runAt.getFullYear(), runAt.getMonth(), runAt.getDate() + off);
    if (d.getDate() === dayNum) base = d;
  }
  if (!base) return [];

  const rowRe = /(\d{1,2})(am|pm)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*s\.\s+(\d+(?:\.\d+)?)/gi;
  const points: AuditPoint[] = [];
  let dayOffset = 0;
  let prevHour = -1;
  for (const m of rest.slice(firstDay.index!).matchAll(rowRe)) {
    const h12 = Number(m[1]) % 12;
    const hour = m[2].toLowerCase() === 'pm' ? h12 + 12 : h12;
    if (hour <= prevHour) dayOffset++;
    prevHour = hour;
    const local = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour);
    const t = local.toISOString();
    points.push({
      t, lead: Math.round((local.getTime() - runAt.getTime()) / 3600e3),
      windKn: round(toKnots(Number(m[3]), windUnit), 1),
      gustKn: round(toKnots(Number(m[4]), windUnit), 1),
      hs: round(toMeters(Number(m[5]), waveUnit)),
      tp: round(Number(m[6]), 1),
    });
  }
  return keepWindow(points);
}
