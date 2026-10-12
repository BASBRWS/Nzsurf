import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@capgo/inappbrowser';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditForecastDoc, AuditPoint } from '../utils/forecastAudit';

/**
 * Voorspellingsaudit — ophalen via de telefoon van de admin.
 *
 * Surfline en surfnerd zitten achter een Cloudflare-controle die JavaScript in een
 * echte browser verwacht. Servers (GitHub, Strato) en kale app-verzoeken komen er
 * niet door. Daarom opent de app een zichtbaar browservenster (in-app browser):
 * Cloudflare doet daarin zijn controle (verschijnt een vinkje, dan tikt de admin
 * erop), daarna leest een script de pagina uit en stuurt de inhoud terug.
 *
 * Alles wordt ook ruw opgeslagen in auditRaw (om uitlezers te bouwen/controleren).
 * Surfline wordt uitgelezen via de bekende API-opbouw; surfnerd voorlopig alleen ruw.
 */

const SPOT_ID = 'ouddorp-p-noordweg';
const SPOT = { lat: 51.8253, lng: 3.8874 };
const HORIZON_HOURS = 7 * 24;
const STEP_HOURS = 3;
const MAX_RAW_CHARS = 700_000; // Firestore-document max. 1 MiB
const PAGE_TIMEOUT_MS = 60_000; // per pagina, incl. eventuele Cloudflare-controle
const LAST_RUN_KEY = 'nzs_audit_app_collect';

const round = (v: unknown, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined;
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

interface PageResult { status: number; body: string; title?: string; finalUrl?: string }

async function saveRaw(runAt: Date, name: string, url: string, res: PageResult | null, error?: string) {
  const runDate = runAt.toISOString().slice(0, 10);
  await setDoc(doc(db, 'auditRaw', `${runDate}_${name}`), clean({
    runAt: runAt.toISOString(), runDate, name, url,
    status: res?.status, title: res?.title, finalUrl: res?.finalUrl, length: res?.body.length,
    truncated: res ? res.body.length > MAX_RAW_CHARS : undefined,
    body: res?.body.slice(0, MAX_RAW_CHARS),
    error,
  }));
}

// Script dat in elke geladen pagina draait: wacht tot de Cloudflare-controle weg is,
// geeft de pagina even de tijd om te renderen en stuurt de inhoud terug aan de app.
const extractScript = (mode: 'html' | 'text') => `(function () {
  if (window.__nzsAudit) return; window.__nzsAudit = true;
  var start = Date.now();
  function blocked() {
    var t = document.title || '';
    return /just a moment|attention required|een ogenblik|even geduld/i.test(t)
      || !!document.querySelector('#challenge-form, #cf-challenge-running, .cf-turnstile, #challenge-stage');
  }
  function send() {
    var body = ${mode === 'text' ? "document.body ? document.body.innerText : ''" : 'document.documentElement.outerHTML'};
    window.mobileApp.postMessage({ detail: { title: document.title, url: location.href, body: String(body).slice(0, ${MAX_RAW_CHARS}) } });
  }
  function tick() {
    if (!blocked() && document.readyState === 'complete') { setTimeout(send, ${mode === 'html' ? 4000 : 500}); return; }
    if (Date.now() - start < ${PAGE_TIMEOUT_MS - 5000}) setTimeout(tick, 1000);
  }
  tick();
})();`;

/**
 * Eén browservenster voor de hele ophaalronde. visit() laadt een adres en wacht
 * op de inhoud; tussendoor kan de admin een Cloudflare-vinkje aantikken.
 */
async function openBrowserSession(title: string) {
  let pending: { resolve: (r: PageResult) => void; reject: (e: Error) => void; mode: 'html' | 'text' } | null = null;
  let opened = false;
  const handles = await Promise.all([
    InAppBrowser.addListener('messageFromWebview', (e: any) => {
      const d = e?.detail || {};
      pending?.resolve({ status: 200, body: String(d.body || ''), title: d.title, finalUrl: d.url });
      pending = null;
    }),
    InAppBrowser.addListener('browserPageLoaded', () => {
      if (pending) InAppBrowser.executeScript({ code: extractScript(pending.mode) }).catch(() => {});
    }),
    InAppBrowser.addListener('closeEvent', () => {
      pending?.reject(new Error('venster gesloten'));
      pending = null;
    }),
  ]);
  const visit = (url: string, mode: 'html' | 'text') => new Promise<PageResult>((resolve, reject) => {
    const timer = setTimeout(() => { pending = null; reject(new Error('time-out (Cloudflare-controle niet voltooid?)')); }, PAGE_TIMEOUT_MS);
    pending = {
      mode,
      resolve: r => { clearTimeout(timer); resolve(r); },
      reject: e => { clearTimeout(timer); reject(e); },
    };
    const go = opened
      ? InAppBrowser.setUrl({ url })
      : InAppBrowser.openWebView({ url, title, toolbarType: 'compact' as any, isPresentAfterPageLoad: false });
    opened = true;
    go.catch((e: any) => { clearTimeout(timer); pending = null; reject(e instanceof Error ? e : new Error(String(e))); });
  });
  const close = async () => {
    await InAppBrowser.close().catch(() => {});
    await Promise.all(handles.map(h => h.remove().catch(() => {})));
  };
  return { visit, close };
}

type Session = Awaited<ReturnType<typeof openBrowserSession>>;

/** Bezoekt een adres, slaat ruw op en geeft de inhoud terug (of null bij een fout). */
async function visitAndKeep(session: Session, runAt: Date, name: string, url: string, mode: 'html' | 'text'): Promise<string | null> {
  try {
    const res = await session.visit(url, mode);
    await saveRaw(runAt, name, url, res);
    return res.body;
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

async function collectSurfline(session: Session, runAt: Date): Promise<string> {
  const search = await visitAndKeep(session, runAt, 'surfline-search', 'https://services.surfline.com/search/site?q=ouddorp&querySize=10&suggestionSize=10', 'text');
  if (!search) return 'surfline: zoeken mislukt (zie auditRaw)';
  let spotId: string | null = null;
  try { spotId = findSurflineSpotId(JSON.parse(search)); } catch { /* geen JSON: vermoedelijk geblokkeerd */ }
  if (!spotId) return 'surfline: spot Ouddorp niet gevonden in zoekresultaat';
  const api = (type: string) => `https://services.surfline.com/kbyg/spots/forecasts/${type}?spotId=${spotId}&days=5&intervalHours=1`;
  // Na elkaar in hetzelfde venster (één browser, dus niet parallel).
  const wave = await visitAndKeep(session, runAt, 'surfline-wave', api('wave'), 'text');
  const wind = await visitAndKeep(session, runAt, 'surfline-wind', api('wind'), 'text');
  const rating = await visitAndKeep(session, runAt, 'surfline-rating', api('rating'), 'text');
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

async function collectSurfnerd(session: Session, runAt: Date): Promise<string> {
  const html = await visitAndKeep(session, runAt, 'surfnerd', 'https://www.surfnerd.com/surf-forecast/ouddorp', 'html');
  if (!html) return 'surfnerd: ophalen mislukt (zie auditRaw)';
  if (/<title>Just a moment/i.test(html)) return 'surfnerd: Cloudflare-controle (geblokkeerd)';
  return `surfnerd: pagina opgeslagen (${Math.round(html.length / 1024)} kB), uitlezer volgt`;
}

// ── Aansturing ──────────────────────────────────────────────────────────────

export const canCollectInApp = () => Capacitor.isNativePlatform();

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Moet de app vandaag nog vragen om op te halen? */
export function appCollectDueToday(): boolean {
  if (!canCollectInApp()) return false;
  try { return localStorage.getItem(LAST_RUN_KEY) !== todayUtc(); } catch { return true; }
}

/** Vandaag niet meer vragen (na ophalen of "Niet nu"). */
export function markAppCollectHandled() {
  try { localStorage.setItem(LAST_RUN_KEY, todayUtc()); } catch { /* geen opslag */ }
}

/** Opent het browservenster en haalt surfnerd en Surfline op (±20–60 s). */
export async function runAppAuditCollect(): Promise<string[] | null> {
  if (!canCollectInApp()) return null;
  const runAt = new Date();
  const runDate = runAt.toISOString().slice(0, 10);
  markAppCollectHandled();
  const session = await openBrowserSession('NzSurf-audit: ophalen…');
  const results: string[] = [];
  try {
    results.push(await collectSurfnerd(session, runAt).catch((e: any) => `surfnerd: fout ${e?.message || e}`));
    results.push(await collectSurfline(session, runAt).catch((e: any) => `surfline: fout ${e?.message || e}`));
  } finally {
    await session.close();
  }
  await setDoc(doc(db, 'auditRaw', `${runDate}_status`), { runAt: runAt.toISOString(), runDate, results }).catch(() => {});
  return results;
}
