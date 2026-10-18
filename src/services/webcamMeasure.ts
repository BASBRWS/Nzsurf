import { InAppBrowser } from '@capgo/inappbrowser';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { callGenerateContent } from './geminiService';

/**
 * Beta: webcammeting Maasvlakte.
 *
 * De admin drukt op de knop; de app opent de YouTube-livestream van Strandweer.nu
 * (camera op 10 m hoogte op de post van de Rotterdamse Reddingsbrigade) in een
 * browservenster en legt 60 s lang elke 5 s een beeld vast. Gemini schat daaruit
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
};
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
}

export interface WebcamMeasurement {
  kind: 'webcam'; name: string; camera: string; spotId: string; videoId: string;
  runAt: string; runDate: string; durationS: number; frames: number;
  result: WebcamResult; thumb?: string; error?: string;
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
const captureScript = `(function () {
  if (window.__nzsCam) return; window.__nzsCam = true;
  function post(d) { try { window.mobileApp.postMessage({ detail: d }); } catch (e) {} }
  var start = Date.now(), lastT = -1, playingSince = 0, n = 0, total = ${Math.round(DURATION_S / EVERY_S)};
  function video() { var v = document.querySelector('video'); return v && v.videoWidth ? v : null; }
  function grab(v, w, q) {
    var c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  function shoot() {
    var v = video();
    if (!v) { post({ type: 'error', msg: 'video verdwenen' }); return; }
    try {
      n++;
      post({ type: 'frame', i: n, total: total, data: grab(v, 768, 0.72), thumb: n === Math.ceil(total / 2) ? grab(v, 420, 0.6) : null });
    } catch (e) { post({ type: 'error', msg: 'beeld niet vast te leggen: ' + (e && e.message || e) }); return; }
    if (n >= total) post({ type: 'done' }); else setTimeout(shoot, ${EVERY_S * 1000});
  }
  function wait() {
    var v = video();
    if (v) {
      try { v.muted = true; if (v.paused) v.play().catch(function () {}); } catch (e) {}
      if (!v.paused && v.currentTime !== lastT) { if (!playingSince) playingSince = Date.now(); }
      else playingSince = 0;
      lastT = v.currentTime;
      if (playingSince && Date.now() - playingSince > 2500) { post({ type: 'status', msg: 'opname loopt' }); shoot(); return; }
    }
    if (Date.now() - start > ${WAIT_FOR_VIDEO_MS}) { post({ type: 'error', msg: 'stream speelt niet (live gestopt of ander adres?)' }); return; }
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
      if (d.type === 'frame') { frames.push(d.data); if (d.thumb) thumb = d.thumb; onStatus(`beeld ${d.i}/${d.total}`); }
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

Antwoord ALLEEN met JSON:
{"framesUsable": number, "waveFaceM": number|null, "rangeM": [min, max]|null,
 "heightClass": "plat"|"enkel"|"knie"|"heup"|"borst"|"schouder"|"hoofd"|"overhead"|null,
 "breakingLines": number|null, "quality": "plat"|"schoon"|"redelijk"|"rommelig"|"closeout"|null,
 "waterSurface": "glad"|"gerimpeld"|"schuimkoppen"|null, "surfers": number, "confidence": number tussen 0 en 1,
 "note": "1–2 zinnen in het Nederlands over wat je ziet"}
Is de branding op geen enkel beeld te zien: framesUsable 0 en de rest null.`;
  const res = await callGenerateContent({
    model: 'gemini-3.7-flash',
    contents: [
      ...frames.map(f => ({ inlineData: { data: f.split(',')[1] || f, mimeType: 'image/jpeg' } })),
      { text: prompt },
    ],
    config: { responseMimeType: 'application/json' },
  });
  const raw = JSON.parse(String(res.text || '{}').replace(/```json|```/g, '').trim());
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
  };
  // Firestore weigert undefined-velden.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as unknown as WebcamResult;
}

/** Volledige meting: opnemen → analyseren → opslaan. */
export async function runWebcamMeasurement(onStatus: (s: string) => void): Promise<WebcamMeasurement> {
  const videoId = getVideoId();
  const runAt = new Date();
  const { frames, thumb } = await captureWebcamFrames(videoId, onStatus);
  if (frames.length < 4) throw new Error(`te weinig beelden (${frames.length})`);
  onStatus(`${frames.length} beelden — Gemini analyseert…`);
  const result = await analyzeWebcamFrames(frames);
  const m: WebcamMeasurement = {
    kind: 'webcam', name: WEBCAM.id, camera: WEBCAM.label, spotId: WEBCAM.spotId, videoId,
    runAt: runAt.toISOString(), runDate: runAt.toISOString().slice(0, 10),
    durationS: DURATION_S, frames: frames.length, result,
    ...(thumb ? { thumb } : {}),
  };
  await setDoc(doc(db, 'auditRaw', `webcam_${m.runAt.replace(/[:.]/g, '-')}`), m);
  return m;
}

export async function loadWebcamMeasurements(): Promise<WebcamMeasurement[]> {
  const snap = await getDocs(query(collection(db, 'auditRaw'), where('kind', '==', 'webcam')));
  return snap.docs.map(d => d.data() as WebcamMeasurement).sort((a, b) => b.runAt.localeCompare(a.runAt));
}
