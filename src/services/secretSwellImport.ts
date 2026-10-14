import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { API_BASE, apiUrl } from '../lib/api';
import { SecretSwellRead, secretSwellToPoints } from '../utils/siteParsers';

/**
 * Secret Swell heeft geen website; de admin maakt een schermafbeelding van het
 * Ouddorp-dashboard in die app. De AI (zelfde server-route als de spotrapport-foto's)
 * leest de getallen eruit; we slaan ze op als bron "secretswell" in auditForecasts.
 */

const SPOT_ID = 'ouddorp-p-noordweg';
// In de APK is er geen eigen server; de website draait dezelfde /api-route.
const SITE = 'https://www.noordzeesurf.nl';

const PROMPT = `Dit is een schermafbeelding van de surf-app Secret Swell (spot Ouddorp).
Lees de getallen precies af. Verzin niets: laat een veld weg als je het niet zeker ziet.
Geef ALLEEN JSON (geen markdown) in deze vorm:
{
  "current": { "verdict": "GO" | "MAYBE" | "NO-GO", "swellM": getal, "periodS": getal, "wavesM": getal, "windKt": getal, "windAngle": "onshore" | "offshore" | "cross" },
  "days": [ { "label": "VANDAAG" | "MA" | "DI" | "WO" | "DO" | "VR" | "ZA" | "ZO", "waveMin": getal, "waveMax": getal, "windMin": getal, "windMax": getal, "verdict": "GO" | "MAYBE" | "NO-GO", "locked": true | false } ]
}
- "Huidige condities": regel "0.7m @ 6s" = swellM en periodS; "0.5m Golven" = wavesM; "5.0kt Onshore" = windKt en windAngle; het gekleurde vak (bv. NO-GO) = verdict.
- "Voorspelling": per dag het golfbereik in meters ("0.6-0.8m" → waveMin 0.6, waveMax 0.8) en het windbereik in knopen ("5-8kt").
- Kleur van de stip boven een dag: rood = "NO-GO", oranje/geel = "MAYBE", groen = "GO". Een dag met een slotje en zonder getallen: "locked": true.`;

async function generate(body: unknown): Promise<string> {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    // Native HTTP: geen CORS-beperking van de webview.
    const res = await CapacitorHttp.post({ url: `${SITE}/api/gemini/generateContent`, headers: { 'Content-Type': 'application/json' }, data: body });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.status >= 400) throw new Error(data?.error || `HTTP ${res.status}`);
    return data?.text || '';
  }
  const res = await fetch(apiUrl('/api/gemini/generateContent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data?.text || '';
}

/** Afbeelding verkleinen naar JPEG (max 1600 px) en als base64 teruggeven. */
async function toJpegBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

export async function importSecretSwellScreenshot(file: File): Promise<{ read: SecretSwellRead; points: number; summary: string[] }> {
  // Tijdstip van de verwachting = wanneer de schermafbeelding gemaakt is (bestandsdatum), anders nu.
  const runAt = file.lastModified && Date.now() - file.lastModified < 36 * 3600e3 ? new Date(file.lastModified) : new Date();
  const text = await generate({
    model: 'gemini-3.7-flash',
    contents: [{ inlineData: { data: await toJpegBase64(file), mimeType: 'image/jpeg' } }, { text: PROMPT }],
  });
  const read = JSON.parse(text.replace(/```json|```/g, '').trim()) as SecretSwellRead;
  const points = secretSwellToPoints(read, runAt);
  if (!points.length) throw new Error('Geen bruikbare getallen gevonden op de schermafbeelding.');
  const runDate = runAt.toISOString().slice(0, 10);
  await setDoc(doc(db, 'auditForecasts', `${runDate}_secretswell`), JSON.parse(JSON.stringify({
    runAt: runAt.toISOString(), runDate, spotId: SPOT_ID,
    source: 'secretswell', label: 'Secret Swell (schermafbeelding)', kind: 'site', points,
    note: 'uit schermafbeelding gelezen door AI; oordeel en bereik per dag', read,
  })));
  const c = read.current;
  const summary = [
    c ? `nu: ${c.verdict ?? '?'} · swell ${c.swellM ?? '?'} m @ ${c.periodS ?? '?'} s · golven ${c.wavesM ?? '?'} m · wind ${c.windKt ?? '?'} kt ${c.windAngle ?? ''}` : 'nu: niet gelezen',
    ...(read.days || []).filter(d => !d.locked).map(d => `${d.label}: ${d.verdict ?? '?'} · ${d.waveMin ?? '?'}–${d.waveMax ?? '?'} m · ${d.windMin ?? '?'}–${d.windMax ?? '?'} kt`),
  ];
  return { read, points: points.length, summary };
}
