import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditForecastDoc, AuditPoint } from '../utils/forecastAudit';

/**
 * Voorspellingsaudit — ophalen via de telefoon van de admin.
 *
 * Surfline en surfnerd weren servers in datacenters (Cloudflare), dus de GitHub-
 * workflow komt er niet bij. De app op de telefoon gaat via een gewone wifi- of
 * 4G-aansluiting en kan het wél. Alleen in de Android-app (native HTTP, geen CORS),
 * alleen voor de admin, hooguit één keer per dag.
 *
 * Ronde 1: alles wordt ook ruw opgeslagen in auditRaw (om de uitlezers te kunnen
 * bouwen/controleren). Surfline wordt al uitgelezen via de bekende API-opbouw.
 */

const SPOT_ID = 'ouddorp-p-noordweg';
const SPOT = { lat: 51.8253, lng: 3.8874 };
const HORIZON_HOURS = 7 * 24;
const STEP_HOURS = 3;
const MAX_RAW_CHARS = 700_000; // Firestore-document max. 1 MiB
const LAST_RUN_KEY = 'nzs_audit_app_collect';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

const round = (v: unknown, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined;
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

async function httpGet(url: string, accept: string): Promise<{ status: number; body: string }> {
  const r = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8' },
    responseType: 'text',
    connectTimeout: 20000,
    readTimeout: 30000,
  });
  const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  return { status: r.status, body };
}

async function saveRaw(runAt: Date, name: string, url: string, res: { status: number; body: string } | null, error?: string) {
  const runDate = runAt.toISOString().slice(0, 10);
  await setDoc(doc(db, 'auditRaw', `${runDate}_${name}`), clean({
    runAt: runAt.toISOString(), runDate, name, url,
    status: res?.status, length: res?.body.length,
    truncated: res ? res.body.length > MAX_RAW_CHARS : undefined,
    body: res?.body.slice(0, MAX_RAW_CHARS),
    error,
  }));
}

/** Haalt op, slaat ruw op en geeft de tekst terug (of null bij een fout). */
async function fetchAndKeep(runAt: Date, name: string, url: string, accept: string): Promise<string | null> {
  try {
    const res = await httpGet(url, accept);
    await saveRaw(runAt, name, url, res);
    return res.status >= 200 && res.status < 300 ? res.body : null;
  } catch (e: any) {
    await saveRaw(runAt, name, url, null, e?.message || String(e)).catch(() => {});
    return null;
  }
}

// ── Surfline (services.surfline.com/kbyg) ───────────────────────────────────

/** Zoekt in het zoekresultaat (willekeurig genest) naar de Ouddorp-spot die het dichtst bij ligt. */
function findSurflineSpotId(search: unknown): string | null {
  const found: { id: string; dist: number }[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const name = o._source?.name;
    if (typeof o._id === 'string' && typeof name === 'string' && /ouddorp/i.test(name)) {
      const loc = o._source?.location;
      const lat = loc?.lat ?? loc?.coordinates?.[1];
      const lon = loc?.lon ?? loc?.coordinates?.[0];
      const dist = typeof lat === 'number' && typeof lon === 'number' ? Math.hypot(lat - SPOT.lat, lon - SPOT.lng) : 99;
      found.push({ id: o._id, dist });
    }
    Object.values(o).forEach(walk);
  };
  walk(search);
  return found.sort((a, b) => a.dist - b.dist)[0]?.id ?? null;
}

const toMeters = (v: unknown, unit?: string) =>
  typeof v === 'number' ? (String(unit).toUpperCase() === 'FT' ? v * 0.3048 : v) : undefined;
const toKnots = (v: unknown, unit?: string) => {
  if (typeof v !== 'number') return undefined;
  switch (String(unit).toUpperCase()) {
    case 'MPH': return v * 0.868976;
    case 'KPH': return v / 1.852;
    case 'MS': case 'M/S': return v * 1.943844;
    default: return v; // KTS
  }
};

export function parseSurfline(waveJson: any, windJson: any, ratingJson: any, runAt: Date): AuditPoint[] {
  const byT = new Map<number, AuditPoint>();
  const at = (ts: number) => {
    if (!byT.has(ts)) {
      const t = new Date(ts * 1000).toISOString();
      byT.set(ts, { t, lead: Math.round((ts * 1000 - runAt.getTime()) / 3600e3) });
    }
    return byT.get(ts)!;
  };
  const wu = waveJson?.associated?.units || {};
  for (const w of waveJson?.data?.wave || []) {
    if (typeof w?.timestamp !== 'number') continue;
    const p = at(w.timestamp);
    const swells = (w.swells || []).filter((s: any) => typeof s?.height === 'number' && s.height > 0);
    if (swells.length) {
      const hs = Math.sqrt(swells.reduce((a: number, s: any) => a + toMeters(s.height, wu.swellHeight)! ** 2, 0));
      // Dominante swell: meeste energie (≈ hoogte² × periode²).
      const dom = swells.reduce((a: any, s: any) => (s.height ** 2 * (s.period || 1) ** 2 > a.height ** 2 * (a.period || 1) ** 2 ? s : a));
      p.hs = round(hs); p.tp = round(dom.period, 1); p.dir = round(dom.direction, 0);
    }
    p.surfMin = round(toMeters(w.surf?.min, wu.waveHeight));
    p.surfMax = round(toMeters(w.surf?.max, wu.waveHeight));
  }
  const windUnit = windJson?.associated?.units?.windSpeed;
  for (const w of windJson?.data?.wind || []) {
    if (typeof w?.timestamp !== 'number') continue;
    const p = at(w.timestamp);
    p.windKn = round(toKnots(w.speed, windUnit), 1);
    p.windDir = round(w.direction, 0);
    p.gustKn = round(toKnots(w.gust, windUnit), 1);
  }
  for (const r of ratingJson?.data?.rating || []) {
    if (typeof r?.timestamp !== 'number') continue;
    const key = r.rating?.key;
    if (typeof key === 'string') at(r.timestamp).rating = key;
  }
  return [...byT.values()]
    .map(p => clean(p))
    .filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS && new Date(p.t).getUTCHours() % STEP_HOURS === 0);
}

async function collectSurfline(runAt: Date): Promise<string> {
  const search = await fetchAndKeep(runAt, 'surfline-search', 'https://services.surfline.com/search/site?q=ouddorp&querySize=10&suggestionSize=10', 'application/json');
  if (!search) return 'surfline: zoeken mislukt (zie auditRaw)';
  let spotId: string | null = null;
  try { spotId = findSurflineSpotId(JSON.parse(search)); } catch { /* geen JSON: vermoedelijk geblokkeerd */ }
  if (!spotId) return 'surfline: spot Ouddorp niet gevonden in zoekresultaat';
  const api = (type: string) => `https://services.surfline.com/kbyg/spots/forecasts/${type}?spotId=${spotId}&days=5&intervalHours=1`;
  const [wave, wind, rating] = await Promise.all([
    fetchAndKeep(runAt, 'surfline-wave', api('wave'), 'application/json'),
    fetchAndKeep(runAt, 'surfline-wind', api('wind'), 'application/json'),
    fetchAndKeep(runAt, 'surfline-rating', api('rating'), 'application/json'),
  ]);
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  const points = parseSurfline(parse(wave), parse(wind), parse(rating), runAt);
  if (!points.length) return `surfline: spot ${spotId} gevonden, maar 0 punten uitgelezen`;
  const runDate = runAt.toISOString().slice(0, 10);
  const docData: AuditForecastDoc = {
    runAt: runAt.toISOString(), runDate, spotId: SPOT_ID,
    source: 'surfline', label: 'Surfline', kind: 'site', points,
    note: `opgehaald via de app (Surfline-spot ${spotId})`,
  };
  await setDoc(doc(db, 'auditForecasts', `${runDate}_surfline`), docData);
  return `surfline: ${points.length} punten`;
}

// ── surfnerd (ronde 1: alleen ruw opslaan) ──────────────────────────────────

async function collectSurfnerd(runAt: Date): Promise<string> {
  const html = await fetchAndKeep(runAt, 'surfnerd', 'https://www.surfnerd.com/surf-forecast/ouddorp', 'text/html,application/xhtml+xml');
  if (!html) return 'surfnerd: ophalen mislukt (zie auditRaw)';
  if (/<title>Just a moment/i.test(html)) return 'surfnerd: Cloudflare-controle (geblokkeerd)';
  return `surfnerd: pagina opgeslagen (${Math.round(html.length / 1024)} kB), uitlezer volgt`;
}

// ── Aansturing ──────────────────────────────────────────────────────────────

export const canCollectInApp = () => Capacitor.isNativePlatform();

/** Haalt Surfline en surfnerd op. Zonder force hooguit één keer per (UTC-)dag. */
export async function runAppAuditCollect(force = false): Promise<string[] | null> {
  if (!canCollectInApp()) return null;
  const runAt = new Date();
  const runDate = runAt.toISOString().slice(0, 10);
  try {
    if (!force && localStorage.getItem(LAST_RUN_KEY) === runDate) return null;
    localStorage.setItem(LAST_RUN_KEY, runDate);
  } catch { /* geen opslag: dan gewoon draaien */ }
  const results = await Promise.all([
    collectSurfline(runAt).catch((e: any) => `surfline: fout ${e?.message || e}`),
    collectSurfnerd(runAt).catch((e: any) => `surfnerd: fout ${e?.message || e}`),
  ]);
  await setDoc(doc(db, 'auditRaw', `${runDate}_status`), { runAt: runAt.toISOString(), runDate, results }).catch(() => {});
  return results;
}
