import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { API_BASE, apiUrl } from '../lib/api';
import { SecretSwellRead, mergeAuditPoints, secretSwellSpotOk, secretSwellToPoints } from '../utils/siteParsers';
import { AuditPoint } from '../utils/forecastAudit';

/**
 * Secret Swell heeft geen website; de admin maakt een schermafbeelding van het
 * Ouddorp-dashboard in die app. De AI (zelfde server-route als de spotrapport-foto's)
 * leest de getallen eruit; we slaan ze op als bron "secretswell" in auditForecasts.
 */

const SPOT_ID = 'ouddorp-p-noordweg';
// In de APK is er geen eigen server; de website draait dezelfde /api-route.
const SITE = 'https://www.noordzeesurf.nl';

const PROMPT = `Dit is een schermafbeelding van de surf-app Secret Swell.
Lees de getallen precies af. Verzin niets: laat een veld weg als je het niet zeker ziet.
Geef ALLEEN JSON (geen markdown) met de velden die op dit scherm staan:
{
  "spot": "spotnaam bovenaan, zoals getoond (ook als die is afgekapt, bv. 'BERG...')",
  "current": { "verdict": "GO" | "MAYBE" | "NO-GO", "swellM": getal, "periodS": getal, "wavesM": getal, "windKt": getal, "windAngle": "onshore" | "offshore" | "cross" },
  "days": [ { "label": "zoals getoond, bv. VANDAAG, Morgen, DO, 'za, okt. 17'", "waveMin": getal, "waveMax": getal, "windMin": getal, "windMax": getal, "verdict": "GO" | "MAYBE" | "NO-GO", "locked": true | false } ],
  "tableDate": "kop boven de uurtabel, bv. 'DONDERDAG 15 OKTOBER'",
  "hours": [ { "time": "HH:MM", "verdict": "GO" | "MAYBE" | "NO-GO", "waveM": getal, "swellM": getal, "periodS": getal, "swellDir": "kompasrichting zoals getoond, bv. WSW", "windKt": getal, "gustKt": getal, "windDir": "bv. SSW" } ]
}
Dashboard-scherm:
- "Huidige condities": "0.7m @ 6s" = swellM en periodS; "0.5m Golven" = wavesM; "5.0kt Onshore" = windKt en windAngle; het gekleurde vak (bv. NO-GO) = verdict.
- "Voorspelling": per dag golfbereik in m ("0.6-0.8m") en windbereik in kt ("5-8kt"). Stip: rood = "NO-GO", oranje/geel = "MAYBE", groen = "GO". Dag met slotje zonder getallen: "locked": true.
Spotpagina met uurtabel:
- Dagkaarten bovenaan ("Vandaag 1.1 - 1.4m", "Morgen", "za, okt. 17"): label + waveMin/waveMax. De gekleurde balk onderaan de kaart = verdict: rood = "NO-GO", oranje/geel = "MAYBE", groen = "GO" (geen balk/grijs: laat weg).
- Uurtabel per kolom (tijd): het gekleurde vak bovenaan ("GEEN GO", "GO", …) = verdict: rood/"GEEN GO" = "NO-GO", oranje/geel = "MAYBE", groen/"GO" = "GO"; GOLF = waveM; SWELL "1.4m 6s" = swellM en periodS; de rij eronder = swellDir;
  WIND (Kt) "19 24" = windKt 19 en gustKt 24 (het kleine rode getal zijn de vlagen); de rij eronder = windDir. Getij en temperatuur niet nodig.
- Neem alleen kolommen die volledig zichtbaar zijn (geen afgekapte tijd of getallen).`;

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

/** Eén schermafbeelding laten aflezen. */
async function readScreenshot(file: File): Promise<SecretSwellRead> {
  const text = await generate({
    model: 'gemini-3.7-flash',
    contents: [{ inlineData: { data: await toJpegBase64(file), mimeType: 'image/jpeg' } }, { text: PROMPT }],
  });
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as SecretSwellRead;
}

/**
 * Een of meer schermafbeeldingen (dashboard en/of uurtabel, eventueel doorgescrold)
 * aflezen en samenvoegen met wat er vandaag al staat.
 */
export async function importSecretSwellScreenshots(files: File[]): Promise<{ points: number; summary: string[] }> {
  // Tijdstip van de verwachting = wanneer de (eerste) schermafbeelding gemaakt is, anders nu.
  const first = Math.min(...files.map(f => (f.lastModified && Date.now() - f.lastModified < 36 * 3600e3 ? f.lastModified : Date.now())));
  const shotAt = new Date(first);
  const runDate = shotAt.toISOString().slice(0, 10);
  const ref = doc(db, 'auditForecasts', `${runDate}_secretswell`);
  const existing = (await getDoc(ref)).data();
  // Eerdere upload vandaag: die vooruitkijktijd houden (verwachting telt vanaf de eerste blik).
  const runAt = existing?.runAt && Date.parse(existing.runAt) < first ? new Date(existing.runAt) : shotAt;

  const summary: string[] = [];
  const sets: AuditPoint[][] = [existing?.points || []];
  const reads: SecretSwellRead[] = [];
  for (const file of files) {
    const read = await readScreenshot(file);
    if (!secretSwellSpotOk(read)) {
      summary.push(`✗ ${file.name}: dit is "${read.spot}", niet Ouddorp — overgeslagen`);
      continue;
    }
    const pts = secretSwellToPoints(read, runAt);
    sets.push(pts);
    reads.push(read);
    const c = read.current;
    if (c) summary.push(`nu: ${c.verdict ?? '?'} · swell ${c.swellM ?? '?'} m @ ${c.periodS ?? '?'} s · golven ${c.wavesM ?? '?'} m · wind ${c.windKt ?? '?'} kt ${c.windAngle ?? ''}`);
    for (const d of (read.days || []).filter(d => !d.locked)) summary.push(`${d.label}: ${d.verdict ?? ''} ${d.waveMin ?? '?'}–${d.waveMax ?? '?'} m${d.windMin !== undefined ? ` · ${d.windMin}–${d.windMax ?? '?'} kt` : ''}`);
    for (const h of read.hours || []) summary.push(`${read.tableDate ?? ''} ${h.time}: golf ${h.waveM ?? '?'} m · swell ${h.swellM ?? '?'} m ${h.periodS ?? '?'} s ${h.swellDir ?? ''} · wind ${h.windKt ?? '?'}/${h.gustKt ?? '?'} kt ${h.windDir ?? ''}`);
  }
  if (!reads.length) throw new Error(summary.join(' | ') || 'Geen bruikbare schermafbeelding.');
  const points = mergeAuditPoints(...sets);
  if (!points.length) throw new Error('Geen bruikbare getallen gevonden op de schermafbeelding(en).');
  await setDoc(ref, JSON.parse(JSON.stringify({
    runAt: runAt.toISOString(), runDate, spotId: SPOT_ID,
    source: 'secretswell', label: 'Secret Swell (schermafbeelding)', kind: 'site', points,
    note: 'uit schermafbeeldingen gelezen door AI (dashboard en/of uurtabel)',
    reads: [...(existing?.reads || []), ...reads],
  })));
  return { points: points.length, summary };
}
