import { InAppBrowser } from '@capgo/inappbrowser';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateViaServer, aiProviderLabel } from './aiServer';
import { fetchForecast } from './weatherService';
import { SPOT_CATALOG, toSurfSpot } from '../data/spotCatalog';
import { ForecastData, SurfSpot } from '../types';

/**
 * Beta: webcammeting Maasvlakte.
 *
 * De admin drukt op de knop; de app opent de YouTube-livestream van Strandweer.nu
 * (camera op 10 m hoogte op de post van de Rotterdamse Reddingsbrigade) in een
 * browservenster en legt 60 s lang elke 5 s een beeld vast. de AI schat daaruit
 * de brekende golf aan het strand. De boei Maasgeul 2 ligt vlak voor de Maasvlakte,
 * dus samen geven ze "golf op zee → golf aan het strand".
 *
 * Opslag in auditRaw (kind 'webcam'): daar mag de admin-app al schrijven, er is
 * geen regelwijziging in Firestore nodig.
 */

export const WEBCAM = {
  id: 'strandweer-maasvlakte',
  spotId: 'maasvlakte',
  label: 'Webcam Maasvlakte (Strandweer.nu)',
  defaultVideoId: 'Ud7I4jprFN0',
  lat: 51.9292, lng: 3.9766, // reddingspost Maasvlaktestrand
};
export const NEARBY_KM = 20;
const VIDEO_KEY = 'nzs_webcam_video';
const WAIT_FOR_VIDEO_MS = 90_000; // tijd om evt. YouTube-toestemming te geven / op ▶ te tikken
const DURATION_S = 60;
const EVERY_S = 5;

export const HEIGHT_CLASSES = [
  { key: 'plat', label: 'Plat', m: 0 },
  { key: 'enkel', label: 'Enkel', m: 0.2 },
  { key: 'knie', label: 'Knie', m: 0.4 },
  { key: 'heup', label: 'Heup', m: 0.7 },
  { key: 'borst', label: 'Borst', m: 1.0 },
  { key: 'schouder', label: 'Schouder', m: 1.3 },
  { key: 'hoofd', label: 'Hoofd', m: 1.6 },
  { key: 'overhead', label: 'Over hoofd', m: 2.0 },
] as const;

export interface WebcamResult {
  framesUsable: number;          // beelden waarop de branding goed te zien is
  waveFaceM?: number;            // typische setgolf, hoogte van de golfwand in m
  rangeM?: [number, number];
  heightClass?: string;
  breakingLines?: number;        // aantal schuimlijnen / brekende banken
  quality?: 'plat' | 'schoon' | 'redelijk' | 'rommelig' | 'closeout';
  waterSurface?: string;         // glad / gerimpeld / schuimkoppen
  surfers?: number;
  confidence?: number;           // 0–1
  note?: string;
  /** Surfbaar per soort board, volgens wat de beelden laten zien (los van elke voorspelling). */
  verdict?: { longboard?: WebcamVerdict; mid?: WebcamVerdict; shortboard?: WebcamVerdict };
}
export type WebcamVerdict = 'nee' | 'matig' | 'ja';

/** NzSurf-verwachting voor één spot op het uur van de meting. */
export interface SpotForecastSnap {
  spotId: string; name: string; distKm: number; t: string;
  modelHs: number;      // Open-Meteo op zee bij de spot
  spotHs?: number;      // NzSurf: hoogte op de spot (demping × richting × plafond)
  period?: number; swellDir?: number; windKn?: number; windDir?: number; chance?: number;
  // Volledig uur (sinds Beta "kans tegen werkelijkheid"): nodig om elke kans exact te herberekenen.
  windQuality?: number; tideFactor?: number; swellExposure?: number;
}

export interface WebcamMeasurement {
  kind: 'webcam'; name: string; camera: string; spotId: string; videoId: string;
  runAt: string; runDate: string; durationS: number; frames: number;
  result: WebcamResult; thumb?: string; error?: string;
  forecast?: SpotForecastSnap;      // de spot van de camera
  forecastError?: string;           // waarom de verwachting ontbreekt
  nearby?: SpotForecastSnap[];      // overige spots binnen NEARBY_KM
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, D = Math.PI / 180;
  const dLat = (b.lat - a.lat) * D, dLng = (b.lng - a.lng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * De spot van de camera (eigen spot binnen 2 km, anders een spot op de camerapositie)
 * en alle andere spots (eigen + catalogus) binnen NEARBY_KM.
 */
export function webcamSpots(userSpots: SurfSpot[] = []) {
  const byId = new Map<string, SurfSpot>();
  [...SPOT_CATALOG.map(toSurfSpot), ...userSpots].forEach(s => {
    if (s && typeof s.lat === 'number' && typeof s.lng === 'number') byId.set(s.id, s);
  });
  const withDist = [...byId.values()].map(s => ({ s, d: distanceKm(WEBCAM, s) })).sort((a, b) => a.d - b.d);
  const own = withDist.find(x => x.d <= 2);
  const camera: SurfSpot = own?.s ?? {
    id: 'webcam-maasvlakte', name: 'Maasvlakte (webcam)', lat: WEBCAM.lat, lng: WEBCAM.lng,
    type: 'beachbreak', bestWind: [], bestSwell: [], coastlineAngle: 300,
  };
  // Dezelfde plek onder twee namen (eigen spot + catalogus, < 300 m uit elkaar) maar één keer.
  const kept: typeof withDist = [];
  for (const x of withDist) {
    if (x.s.id === camera.id || x.d > NEARBY_KM) continue;
    if (kept.some(k => distanceKm(k.s, x.s) < 0.3)) continue;
    kept.push(x);
  }
  const nearby = kept.map(x => ({ spot: x.s, distKm: x.d }));
  return { camera, cameraDistKm: own?.d ?? 0, nearby };
}

function snapAt(spot: SurfSpot, distKm: number, hours: ForecastData[], at: number): SpotForecastSnap | undefined {
  let best: ForecastData | undefined, bd = Infinity;
  for (const h of hours) { const d = Math.abs(Date.parse(h.timestamp) - at); if (d < bd) { bd = d; best = h; } }
  if (!best || bd > 90 * 60e3) return undefined;
  const r = (v: unknown, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined);
  const snap: SpotForecastSnap = {
    spotId: spot.id, name: spot.name, distKm: r(distKm, 1)!, t: best.timestamp, modelHs: r(best.waveHeight)!,
    spotHs: r(best.spotWaveHeight), period: r(best.swellPeriod, 1), swellDir: r(best.swellDirection, 0),
    windKn: r(best.windSpeed, 1), windDir: r(best.windDirection, 0), chance: r(best.surfChance, 0),
    windQuality: r(best.windQuality, 0), tideFactor: r(best.tideFactor, 2), swellExposure: r(best.swellExposure, 2),
  };
  return Object.fromEntries(Object.entries(snap).filter(([, v]) => v !== undefined)) as unknown as SpotForecastSnap;
}

/** NzSurf-verwachting voor de cameraspot en de spots eromheen, op tijdstip `at`. */
export async function forecastSnapshots(userSpots: SurfSpot[], at: number) {
  const { camera, cameraDistKm, nearby } = webcamSpots(userSpots);
  const errors: string[] = [];
  const one = async (spot: SurfSpot, distKm: number, tries = 1): Promise<SpotForecastSnap | undefined> => {
    for (let i = 0; i < tries; i++) {
      try {
        const snap = snapAt(spot, distKm, await fetchForecast(spot), at);
        if (snap) return snap;
        errors.push(`${spot.name}: geen uur binnen 90 min`); return undefined;
      } catch (e: any) {
        if (i === tries - 1) errors.push(`${spot.name}: ${e?.message || e}`);
      }
    }
    return undefined;
  };
  // Eerst de cameraspot (met een herkansing), daarna de buurspots.
  const forecast = await one(camera, cameraDistKm, 2);
  const rest = await Promise.all(nearby.map(n => one(n.spot, n.distKm)));
  return { forecast, nearby: rest.filter((x): x is SpotForecastSnap => !!x), errors };
}

export function getVideoId(): string {
  try { return localStorage.getItem(VIDEO_KEY) || WEBCAM.defaultVideoId; } catch { return WEBCAM.defaultVideoId; }
}
/** Accepteert een ID of een YouTube-adres (watch, live, youtu.be, embed). */
export function setVideoId(input: string): string {
  const s = input.trim();
  const m = s.match(/(?:v=|live\/|youtu\.be\/|embed\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  const id = m ? m[1] : WEBCAM.defaultVideoId;
  try { localStorage.setItem(VIDEO_KEY, id); } catch { /* geen opslag */ }
  return id;
}

// Draait in de YouTube-pagina: wacht tot de video speelt en stuurt elke EVERY_S s een beeld.
// Het tekenen van de video op een canvas mag hier, omdat het script in de pagina zelf draait.
export const captureScript = `(function () {
  if (window.__nzsCam) return; window.__nzsCam = true;
  function post(d) { try { window.mobileApp.postMessage({ detail: d }); } catch (e) {} }
  var DUR = ${DURATION_S * 1000}, EVERY = ${EVERY_S * 1000}, total = ${Math.round(DURATION_S / EVERY_S)};
  var start = Date.now(), lastT = -1, playingSince = 0, n = 0, t0 = 0, ended = false;
  var hint, ov, cv, ctx, lbl, bar, sub;
  function video() { var v = document.querySelector('video'); return v && v.videoWidth ? v : null; }
  function el(tag, css, text) { var e = document.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; }

  // Hint tijdens het wachten (toestemming / play).
  hint = el('div', 'position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483647;background:#0f172a;color:#fff;padding:12px 14px;border-radius:14px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4)',
    'NzSurf: tik zo nodig op "Alles accepteren" of op ▶. De meting van 60 s start vanzelf zodra de stream speelt.');
  (document.body || document.documentElement).appendChild(hint);

  // Volledig scherm: het livebeeld groot, met afteller en voortgangsbalk.
  function overlay() {
    if (hint) hint.remove();
    ov = el('div', 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;flex-direction:column;color:#fff;font-family:system-ui,sans-serif');
    var top = el('div', 'padding:14px 16px 8px;display:flex;align-items:flex-end;justify-content:space-between;gap:8px');
    top.appendChild(el('div', 'font-size:13px;font-weight:700;opacity:.8;line-height:1.3', 'NzSurf meting\\nWebcam Maasvlakte'));
    top.lastChild.style.whiteSpace = 'pre-line';
    lbl = el('div', 'font-size:48px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1', '60');
    top.appendChild(lbl);
    var track = el('div', 'height:6px;background:#334155;margin:0 16px;border-radius:3px;overflow:hidden');
    bar = el('div', 'height:100%;width:0;background:#06b6d4;transition:width .25s linear');
    track.appendChild(bar);
    cv = el('canvas', 'flex:1;width:100%;min-height:0;object-fit:contain;margin-top:10px');
    sub = el('div', 'padding:10px 16px 22px;font-size:13px;opacity:.8', 'beeld 0/' + total);
    ov.appendChild(top); ov.appendChild(track); ov.appendChild(cv); ov.appendChild(sub);
    document.body.appendChild(ov);
    ctx = cv.getContext('2d');
    draw(); tick();
  }
  function draw() {
    var v = video();
    if (v && ctx) {
      if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
      try { ctx.drawImage(v, 0, 0); } catch (e) {}
    }
    if (!ended) requestAnimationFrame(draw);
  }
  function tick() {
    if (ended) return;
    var el2 = Date.now() - t0, left = Math.max(0, Math.ceil((DUR - el2) / 1000));
    lbl.textContent = String(left);
    bar.style.width = Math.min(100, el2 / DUR * 100) + '%';
    setTimeout(tick, 250);
  }
  function grab(v, w, q) {
    var c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  function fail(msg) { ended = true; if (sub) sub.textContent = '✗ ' + msg; post({ type: 'error', msg: msg }); }
  function shoot() {
    var v = video();
    if (!v) { fail('video verdwenen'); return; }
    try {
      n++;
      post({ type: 'frame', i: n, total: total, left: Math.max(0, Math.ceil((DUR - (Date.now() - t0)) / 1000)),
        data: grab(v, 768, 0.72), thumb: n === Math.ceil(total / 2) ? grab(v, 420, 0.6) : null });
      sub.textContent = 'beeld ' + n + '/' + total + ' vastgelegd';
    } catch (e) { fail('beeld niet vast te leggen: ' + (e && e.message || e)); return; }
    if (n < total) { setTimeout(shoot, EVERY); return; }
    setTimeout(function () {
      ended = true; lbl.textContent = '✓'; bar.style.width = '100%';
      sub.textContent = 'Klaar — Gemini schat de golven…';
      post({ type: 'done' });
    }, Math.max(0, DUR - (Date.now() - t0)));
  }
  function wait() {
    var v = video();
    if (v) {
      try { v.muted = true; if (v.paused) v.play().catch(function () {}); } catch (e) {}
      if (!v.paused && v.currentTime !== lastT) { if (!playingSince) playingSince = Date.now(); }
      else playingSince = 0;
      lastT = v.currentTime;
      if (playingSince && Date.now() - playingSince > 2500) {
        t0 = Date.now(); overlay(); post({ type: 'status', msg: 'opname loopt' });
        setTimeout(shoot, EVERY / 2); // beelden op 2,5 / 7,5 / … / 57,5 s
        return;
      }
    }
    if (Date.now() - start > ${WAIT_FOR_VIDEO_MS}) { if (hint) hint.remove(); fail('stream speelt niet (live gestopt of ander adres?)'); return; }
    if (Date.now() - start > 8000 && !v) post({ type: 'status', msg: 'wacht op video — tik zo nodig op "Alles accepteren" of ▶' });
    setTimeout(wait, 1000);
  }
  wait();
})();`;

/** Opent de stream, legt 60 s beelden vast en sluit het venster weer. */
export async function captureWebcamFrames(videoId: string, onStatus: (s: string) => void): Promise<{ frames: string[]; thumb?: string }> {
  const frames: string[] = [];
  let thumb: string | undefined;
  let finish: (err?: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => { finish = err => (err ? reject(err) : resolve()); });
  const timer = setTimeout(() => finish(new Error('time-out')), WAIT_FOR_VIDEO_MS + DURATION_S * 1000 + 20_000);
  const handles = await Promise.all([
    InAppBrowser.addListener('messageFromWebview', (e: any) => {
      const d = e?.detail || {};
      if (d.type === 'frame') { frames.push(d.data); if (d.thumb) thumb = d.thumb; onStatus(`nog ${d.left ?? '?'} s · beeld ${d.i}/${d.total}`); }
      else if (d.type === 'status') onStatus(d.msg);
      else if (d.type === 'done') finish();
      else if (d.type === 'error') finish(new Error(d.msg));
    }),
    // Na een toestemmingspagina laadt YouTube opnieuw: script opnieuw plaatsen.
    InAppBrowser.addListener('browserPageLoaded', () => { InAppBrowser.executeScript({ code: captureScript }).catch(() => {}); }),
    InAppBrowser.addListener('closeEvent', () => finish(frames.length >= 4 ? undefined : new Error('venster gesloten'))),
  ]);
  try {
    onStatus('stream openen…');
    await InAppBrowser.openWebView({
      url: `https://m.youtube.com/watch?v=${videoId}`, title: 'Webcam Maasvlakte — meting 60 s',
      toolbarType: 'compact' as any, isPresentAfterPageLoad: false,
    });
    await done;
    await new Promise(r => setTimeout(r, 1200)); // ✓ even laten zien
  } finally {
    clearTimeout(timer);
    await InAppBrowser.close().catch(() => {});
    await Promise.all(handles.map(h => h.remove().catch(() => {})));
  }
  return { frames, thumb };
}

/**
 * Gemini schat de golf aan het strand. Bewust zonder voorspelling of boeiwaarde
 * in de vraag, zodat de schatting daar niet door gekleurd wordt.
 */
export async function analyzeWebcamFrames(frames: string[]): Promise<WebcamResult> {
  const prompt = `Je bent een ervaren surf-analist. Je krijgt ${frames.length} beelden, ${EVERY_S} seconden na elkaar, van een vaste webcam
op ongeveer 10 meter hoogte op de reddingspost aan het Maasvlaktestrand (Nederlandse Noordzeekust). De camera draait: niet op elk beeld is de zee goed te zien.

Werkwijze:
1. Gebruik alleen beelden waarop de branding (waar golven breken) duidelijk in beeld is. Tel die.
2. Schat de typische hoogte van de golfwand van de grotere golven die breken (setgolven), in meters. Gebruik mensen, palen of strandobjecten als maat waar mogelijk.
   Overdrijf niet: Noordzeegolven zijn vaak 0,3–1,2 m. Schuimrollers ver uit de kust zijn geen hoogte aan de waterlijn.
3. Tel het aantal brekende lijnen/zandbanken dat je ziet.
4. Beoordeel de kwaliteit: plat, schoon (nette lijnen, breken netjes), redelijk, rommelig (onshore, chaotisch), closeout (breekt in één keer over de hele breedte).
5. Tel de surfers in het water.
6. Oordeel per soort board of je hier NU zou gaan surfen, alleen op basis van wat je ziet (kracht, vorm, rijdbare schouders, stroming/chaos):
   - longboard (veel drijfvermogen, ook kleine zachte golven)
   - mid (fish/funboard, gemiddeld drijfvermogen)
   - shortboard (weinig drijfvermogen, heeft kracht en steilte nodig)
   "ja" = de moeite waard, "matig" = surfbaar maar niet goed, "nee" = niet de moeite of onverantwoord.

Antwoord ALLEEN met JSON:
{"framesUsable": number, "waveFaceM": number|null, "rangeM": [min, max]|null,
 "heightClass": "plat"|"enkel"|"knie"|"heup"|"borst"|"schouder"|"hoofd"|"overhead"|null,
 "breakingLines": number|null, "quality": "plat"|"schoon"|"redelijk"|"rommelig"|"closeout"|null,
 "waterSurface": "glad"|"gerimpeld"|"schuimkoppen"|null, "surfers": number, "confidence": number tussen 0 en 1,
 "verdict": {"longboard": "nee"|"matig"|"ja", "mid": "nee"|"matig"|"ja", "shortboard": "nee"|"matig"|"ja"} | null,
 "note": "1–2 zinnen in het Nederlands over wat je ziet"}
Is de branding op geen enkel beeld te zien: framesUsable 0 en de rest null.`;
  const text = await generateViaServer({
    model: 'gemini-3.7-flash',
    contents: [
      ...frames.map(f => ({ inlineData: { data: f.split(',')[1] || f, mimeType: 'image/jpeg' } })),
      { text: prompt },
    ],
    config: { responseMimeType: 'application/json' },
  });
  const raw = JSON.parse(String(text || '{}').replace(/```json|```/g, '').trim());
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const out: WebcamResult = {
    framesUsable: num(raw.framesUsable) ?? 0,
    waveFaceM: num(raw.waveFaceM),
    rangeM: Array.isArray(raw.rangeM) && raw.rangeM.length === 2 && raw.rangeM.every((x: unknown) => typeof x === 'number') ? [raw.rangeM[0], raw.rangeM[1]] : undefined,
    heightClass: typeof raw.heightClass === 'string' ? raw.heightClass : undefined,
    breakingLines: num(raw.breakingLines),
    quality: typeof raw.quality === 'string' ? raw.quality : undefined,
    waterSurface: typeof raw.waterSurface === 'string' ? raw.waterSurface : undefined,
    surfers: num(raw.surfers),
    confidence: num(raw.confidence),
    note: typeof raw.note === 'string' ? raw.note : undefined,
    verdict: (() => {
      const ok = (v: unknown): v is WebcamVerdict => v === 'nee' || v === 'matig' || v === 'ja';
      const v = raw.verdict;
      if (!v || typeof v !== 'object') return undefined;
      const o: WebcamResult['verdict'] = {};
      if (ok(v.longboard)) o.longboard = v.longboard;
      if (ok(v.mid)) o.mid = v.mid;
      if (ok(v.shortboard)) o.shortboard = v.shortboard;
      return Object.keys(o).length ? o : undefined;
    })(),
  };
  // Firestore weigert undefined-velden.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as unknown as WebcamResult;
}

/** Volledige meting: opnemen → analyseren → opslaan. */
export async function runWebcamMeasurement(userSpots: SurfSpot[], onStatus: (s: string) => void): Promise<WebcamMeasurement> {
  const videoId = getVideoId();
  const runAt = new Date();
  // Verwachtingen ophalen terwijl de camera opneemt.
  const { frames, thumb } = await captureWebcamFrames(videoId, onStatus);
  if (frames.length < 4) throw new Error(`te weinig beelden (${frames.length})`);
  onStatus(`${frames.length} beelden — ${aiProviderLabel()} analyseert, verwachtingen ophalen…`);
  // Verwachtingen pas ophalen als de app weer op de voorgrond is (tijdens de opname
  // staat de app op de achtergrond en kan Android verzoeken stilzetten).
  const fc = forecastSnapshots(userSpots, runAt.getTime() + 30_000)
    .catch((e: any) => ({ forecast: undefined, nearby: [] as SpotForecastSnap[], errors: [String(e?.message || e)] }));
  const result = await analyzeWebcamFrames(frames);
  const m: WebcamMeasurement = {
    kind: 'webcam', name: WEBCAM.id, camera: WEBCAM.label, spotId: WEBCAM.spotId, videoId,
    runAt: runAt.toISOString(), runDate: runAt.toISOString().slice(0, 10),
    durationS: DURATION_S, frames: frames.length, result,
    ...(thumb ? { thumb } : {}),
  };
  const { forecast, nearby, errors } = await fc;
  if (forecast) m.forecast = forecast;
  else m.forecastError = errors[0] || 'onbekend';
  if (nearby.length) m.nearby = nearby;
  await setDoc(doc(db, 'auditRaw', `webcam_${m.runAt.replace(/[:.]/g, '-')}`), m);
  return m;
}

export async function loadWebcamMeasurements(): Promise<WebcamMeasurement[]> {
  const snap = await getDocs(query(collection(db, 'auditRaw'), where('kind', '==', 'webcam')));
  return snap.docs.map(d => d.data() as WebcamMeasurement).sort((a, b) => b.runAt.localeCompare(a.runAt));
}
