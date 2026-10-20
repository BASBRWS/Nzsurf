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
      // Surfline 'power' (kJ) per uur, of opgeteld over de deelsystemen.
      const pw = typeof w.power === 'number' ? w.power
        : parts.some((s: any) => typeof s.power === 'number') ? parts.reduce((a: number, s: any) => a + (typeof s.power === 'number' ? s.power : 0), 0) : undefined;
      if (typeof pw === 'number' && pw >= 0) p.energyKj = Math.round(pw);
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
// Sinds okt 2026 ook metrisch en 24-uurs, zonder spaties in de kop:
//   "💨Windkm/h 🌊Wavesm ⏱️Periods. ⚡️EnergykJ Su 18 Mo 19 … 00 27 36 1.4 6.5s. 260 01 …"
// Beide formaten worden gelezen.
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
  const head = text.search(/Energy\s*kJ/i);
  if (head < 0) return [];
  const before = text.slice(Math.max(0, head - 200), head);
  const windUnit = before.match(/Wind\s*(mph|km\/h|kts|kn|m\/s)/i)?.[1] || 'mph';
  const waveUnit = before.match(/Waves\s*(ft|m)(?![a-z])/i)?.[1] || 'ft';

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

  // Uur als "12am"/"01pm" (oud) of "00".."23" (nieuw), dan wind, vlagen, golf, periode + "s.", energie.
  const rowRe = /(?<![\d.])(\d{1,2})(am|pm)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*s\.\s+(\d+(?:\.\d+)?)/gi;
  const points: AuditPoint[] = [];
  let dayOffset = 0;
  let prevHour = -1;
  for (const m of rest.slice(firstDay.index!).matchAll(rowRe)) {
    const hour = m[2] ? (Number(m[1]) % 12) + (m[2].toLowerCase() === 'pm' ? 12 : 0) : Number(m[1]);
    if (hour > 23) continue;
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
      energyKj: Math.round(Number(m[7])),
    });
  }
  return keepWindow(points);
}

// ── Wompy (wompy.nl/spot/<spot>) ─────────────────────────────────────────────
// Server-side HTML (Next.js). Per dag in de zichtbare tekst:
//   "WO 14 okt OK 6.8 <tekst> … Golven 0.3 m uit NW Periode 3 s Wind 1–4 Bft luwte–vlagen uit ZW …"
// Het oordeel (FLAT/POOR/OK/GOOD/EPIC) en de score gelden volgens Wompy voor de
// Nederlandse kust als geheel; golven en wind zijn voor de spot. Dagwaarden: we
// zetten ze op elk 3-uurs tijdstip van die (lokale) dag.

const NL_DAY = '(?:MA|DI|WO|DO|VR|ZA|ZO)';
const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const COMPASS_NL: Record<string, number> = {
  N: 0, NNO: 22.5, NO: 45, ONO: 67.5, O: 90, OZO: 112.5, ZO: 135, ZZO: 157.5,
  Z: 180, ZZW: 202.5, ZW: 225, WZW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};
// Gemiddelde windsnelheid (kn) per Beaufort-kracht.
const BFT_KN = [0, 2, 5, 8.5, 13.5, 19, 24.5, 30.5, 37, 44, 51.5, 59.5, 64];
export const WOMPY_VERDICTS = ['FLAT', 'POOR', 'OK', 'GOOD', 'EPIC'] as const;

export function parseWompy(html: string, runAt: Date): AuditPoint[] {
  const text = htmlToText(html);
  const num = (s: string) => Number(s.replace(',', '.'));
  const dayRe = new RegExp(`\\b${NL_DAY} (\\d{1,2}) (${NL_MONTHS.join('|')}) (${WOMPY_VERDICTS.join('|')}) (\\d+(?:[.,]\\d+)?)`, 'g');
  const heads = [...text.matchAll(dayRe)];
  const points: AuditPoint[] = [];
  heads.forEach((h, i) => {
    const block = text.slice(h.index!, heads[i + 1]?.index ?? h.index! + 3000);
    // Jaar: de datum rond het ophaalmoment (jaarwisseling).
    const month = NL_MONTHS.indexOf(h[2]);
    let year = runAt.getFullYear();
    if (month < runAt.getMonth() - 6) year++; else if (month > runAt.getMonth() + 6) year--;
    const day = new Date(year, month, Number(h[1]));
    const g = block.match(/Golven ([\d.,]+) m uit ([A-Z]+) Periode ([\d.,]+) s/);
    const w = block.match(/Wind (\d+)(?:\s*[–-]\s*(\d+))? Bft[^.]*? uit ([A-Z]+)/);
    const lo = w ? Number(w[1]) : undefined, hi = w?.[2] ? Number(w[2]) : lo;
    for (let hr = 0; hr < 24; hr++) {
      const local = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hr);
      if (local.getUTCHours() % STEP_HOURS) continue;
      const t = local.toISOString();
      points.push({
        t, lead: Math.round((local.getTime() - runAt.getTime()) / 3600e3),
        rating: h[3], chance: Math.round(num(h[4]) * 10),
        hs: g ? round(num(g[1])) : undefined,
        dir: g ? COMPASS_NL[g[2]] : undefined,
        tp: g ? round(num(g[3]), 1) : undefined,
        // "4–7 Bft luwte–vlagen": gemiddelde ligt dichter bij de luwte; vlagen = bovengrens.
        windKn: lo !== undefined && hi !== undefined ? round((2 * BFT_KN[lo] + BFT_KN[hi]) / 3, 1) : undefined,
        gustKn: hi !== undefined ? BFT_KN[hi] : undefined,
        windDir: w ? COMPASS_NL[w[3]] : undefined,
      });
    }
  });
  return keepWindow(points);
}

// ── Secret Swell (alleen een app; schermafbeelding → AI → deze omzetting) ────
// Twee schermen:
// 1. Dashboard: "Huidige condities" (swell m @ s, golven, wind kt + aanlandig/aflandig/zij,
//    GO/NO-GO) en "Voorspelling" per dag (VANDAAG, DO, …) met golf- en windbereik en een
//    gekleurde stip (rood = no-go). Vergrendelde dagen (slotje) worden overgeslagen.
// 2. Spotpagina: dagkaarten (Vandaag/Morgen/"za, okt. 17" met golfbereik) en een
//    uurtabel onder een kop als "DONDERDAG 15 OKTOBER": golf (m), swell (m + s, richting),
//    wind (kt + vlagen, richting) en getij, met per uur een oordeel ("GEEN GO" = rood);
//    dagkaarten hebben een gekleurde balk (rood/oranje/groen).
// Secret Swell telt alleen met zijn eigen oordeel; zonder oordeel geen "te surfen?".
// "Golf" = hoogte aan de kust (surfMin/surfMax); "swell" = zee (hs), zoals bij Surfline.

export type SecretSwellVerdict = 'GO' | 'MAYBE' | 'NO-GO';
export interface SecretSwellRead {
  spot?: string;
  current?: { verdict?: SecretSwellVerdict; swellM?: number; periodS?: number; wavesM?: number; windKt?: number; windAngle?: 'onshore' | 'offshore' | 'cross' };
  days?: { label: string; waveMin?: number; waveMax?: number; windMin?: number; windMax?: number; verdict?: SecretSwellVerdict; locked?: boolean }[];
  /** Kop boven de uurtabel, bv. "DONDERDAG 15 OKTOBER". */
  tableDate?: string;
  hours?: { time: string; verdict?: SecretSwellVerdict; waveM?: number; swellM?: number; periodS?: number; swellDir?: string; windKt?: number; gustKt?: number; windDir?: string }[];
}

const NL_WEEKDAYS = ['ZO', 'MA', 'DI', 'WO', 'DO', 'VR', 'ZA'];
const NL_MONTHS_FULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const mid = (a?: number, b?: number) =>
  typeof a === 'number' && typeof b === 'number' ? (a + b) / 2 : typeof a === 'number' ? a : b;
const compass = (c?: string) => (c ? COMPASS_NL[c.trim().toUpperCase().replace(/E/g, 'O').replace(/S/g, 'Z')] : undefined);

// Spots waarvoor Secret Swell-schermafbeeldingen worden herkend (naam bovenaan, soms afgekapt: "MAAS...").
export const SECRETSWELL_SPOTS: { spotId: string; name: string; names: string[]; suffix: string }[] = [
  { spotId: 'ouddorp-p-noordweg', name: 'Ouddorp', names: ['ouddorp', 'goeree', 'westhoofd', 'kwade hoek'], suffix: '' },
  { spotId: 'maasvlakte', name: 'Maasvlakte', names: ['maasvlakte', 'maasvlaktestrand', 'slufter'], suffix: '_maasvlakte' },
];

/**
 * Bij welke spot hoort deze schermafbeelding? spotId, null = een andere spot,
 * undefined = naam niet leesbaar.
 */
export function secretSwellSpotOf(read: SecretSwellRead): string | null | undefined {
  if (!read.spot || !read.spot.trim()) return undefined;
  const name = read.spot.trim().toLowerCase();
  const base = name.replace(/(\.{2,}|…)\s*$/, '').trim();
  for (const sp of SECRETSWELL_SPOTS) {
    if (sp.names.some(n => name.includes(n))) return sp.spotId;
    if (base.length >= 3 && sp.names.some(n => n.startsWith(base))) return sp.spotId;
  }
  return null;
}

/** Spotnaam op de schermafbeelding past bij Ouddorp (of is niet leesbaar). */
export function secretSwellSpotOk(read: SecretSwellRead): boolean {
  const s = secretSwellSpotOf(read);
  return s === undefined || s === 'ouddorp-p-noordweg';
}

/** Dagkaart-label → datum: VANDAAG, MORGEN, MA…ZO of "za, okt. 17". */
function dayFromLabel(label: string, today: Date): Date | undefined {
  const l = label.trim().toUpperCase();
  if (/^(VANDAAG|TODAY)/.test(l)) return today;
  if (/^(MORGEN|TOMORROW)/.test(l)) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const dayNum = l.match(/\b(\d{1,2})\b/);
  const wd = NL_WEEKDAYS.findIndex(w => l.startsWith(w));
  if (dayNum) {
    for (let off = 0; off <= 10; off++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
      if (d.getDate() === Number(dayNum[1])) return d;
    }
  }
  if (wd < 0) return undefined;
  const off = (wd - today.getDay() + 7) % 7 || 7; // niet vandaag → eerstvolgende
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
}

/** "DONDERDAG 15 OKTOBER" → datum rond het ophaalmoment. */
function dateFromHeading(text: string | undefined, runAt: Date): Date | undefined {
  const m = text?.toLowerCase().match(/(\d{1,2})\s+([a-z]+)/);
  if (!m) return undefined;
  const month = NL_MONTHS_FULL.findIndex(n => n.startsWith(m[2].slice(0, 3)));
  if (month < 0) return undefined;
  let year = runAt.getFullYear();
  if (month < runAt.getMonth() - 6) year++; else if (month > runAt.getMonth() + 6) year--;
  return new Date(year, month, Number(m[1]));
}

export function secretSwellToPoints(read: SecretSwellRead, runAt: Date): AuditPoint[] {
  const byT = new Map<string, AuditPoint>();
  const put = (local: Date, p: Omit<AuditPoint, 't' | 'lead'>) => {
    const t = local.toISOString();
    byT.set(t, { ...byT.get(t), ...p, t, lead: Math.round((local.getTime() - runAt.getTime()) / 3600e3) });
  };
  const today = new Date(runAt.getFullYear(), runAt.getMonth(), runAt.getDate());

  // 1. Dagbereiken op elk 3-uurs tijdstip van die dag.
  for (const d of read.days || []) {
    if (d.locked || (d.waveMin === undefined && d.waveMax === undefined)) continue;
    const day = dayFromLabel(d.label, today);
    if (!day) continue;
    for (let hr = 0; hr < 24; hr++) {
      const local = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hr);
      if (local.getUTCHours() % STEP_HOURS) continue;
      put(local, {
        hs: round(mid(d.waveMin, d.waveMax)), surfMin: round(d.waveMin), surfMax: round(d.waveMax),
        windKn: round(mid(d.windMin, d.windMax), 1), gustKn: round(d.windMax, 1), rating: d.verdict,
      });
    }
  }

  // 2. Uurtabel: preciezer dan het dagbereik.
  const tableDay = dateFromHeading(read.tableDate, runAt) ?? today;
  for (const h of read.hours || []) {
    const m = h.time.match(/(\d{1,2})[:.](\d{2})/);
    if (!m) continue;
    const local = new Date(tableDay.getFullYear(), tableDay.getMonth(), tableDay.getDate(), Number(m[1]), Number(m[2]));
    put(local, {
      hs: round(h.swellM ?? h.waveM), tp: round(h.periodS, 1), dir: compass(h.swellDir),
      surfMin: round(h.waveM), surfMax: round(h.waveM),
      windKn: round(h.windKt, 1), gustKn: round(h.gustKt, 1), windDir: compass(h.windDir),
      rating: h.verdict,
    });
  }

  // 3. Huidige condities (dashboard) voor het 3-uurs tijdstip van de schermafbeelding.
  const c = read.current;
  if (c && (c.swellM !== undefined || c.windKt !== undefined)) {
    // Dichtstbijzijnde 3-uurs tijdstip (UTC-uren deelbaar door 3).
    const step = STEP_HOURS * 3600e3;
    const hour = new Date(Math.round(runAt.getTime() / step) * step);
    const prev = byT.get(hour.toISOString());
    put(hour, {
      hs: round(c.swellM), tp: round(c.periodS, 1), surfMin: round(c.wavesM), surfMax: round(c.wavesM),
      windKn: round(c.windKt, 1), gustKn: undefined, rating: c.verdict ?? prev?.rating,
    });
  }
  return keepWindow([...byT.values()]).sort((a, b) => a.t.localeCompare(b.t));
}

/** Punten van meerdere schermafbeeldingen samenvoegen (latere gaan voor, per veld). */
export function mergeAuditPoints(...sets: AuditPoint[][]): AuditPoint[] {
  const byT = new Map<string, AuditPoint>();
  for (const set of sets) for (const p of set) byT.set(p.t, { ...byT.get(p.t), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as AuditPoint);
  return [...byT.values()].sort((a, b) => a.t.localeCompare(b.t));
}
