import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateViaServer } from './aiServer';
import { SecretSwellRead, SECRETSWELL_SPOTS, mergeAuditPoints, secretSwellSpotOf, secretSwellToPoints } from '../utils/siteParsers';
import { AuditPoint } from '../utils/forecastAudit';

/**
 * Secret Swell heeft geen website; de admin maakt een schermafbeelding van het
 * Ouddorp-dashboard in die app. De AI (zelfde server-route als de spotrapport-foto's)
 * leest de getallen eruit; we slaan ze op als bron "secretswell" in auditForecasts.
 */


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

const generate = generateViaServer;

/** Eén scherm uit de Secret Swell-webapp, als zichtbare tekst met positie en kleur (zie secretSwellScan). */
export async function readSecretSwellScreenText(screen: string): Promise<SecretSwellRead> {
  const text = await generate({
    model: 'gemini-3.7-flash',
    contents: [{ text: `Hieronder staat NIET een afbeelding maar de zichtbare inhoud van één scherm van Secret Swell (de webapp), als regels "x,y,breedte,hoogte | achtergrondkleur | tekst", van boven naar beneden. Elementen met dezelfde x horen bij dezelfde kolom; een gekleurd vak zonder tekst is een kleurbalk (rood = NO-GO, oranje/geel = MAYBE, groen = GO).\n\n${screen}\n\n` }, { text: PROMPT.replace('Dit is een schermafbeelding van de surf-app Secret Swell.', 'Lees dit scherm van Secret Swell.') }],
  });
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as SecretSwellRead;
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
 * Een of meer schermafbeeldingen (dashboard en/of uurtabel, eventueel doorgescrold), van
 * Ouddorp en/of de Maasvlakte door elkaar: elke schermafbeelding gaat naar de spot die
 * erop staat en wordt samengevoegd met wat er vandaag al voor die spot staat.
 */
export async function importSecretSwellScreenshots(files: File[]): Promise<{ points: number; summary: string[] }> {
  // Tijdstip van de verwachting = wanneer de (eerste) schermafbeelding gemaakt is, anders nu.
  const first = Math.min(...files.map(f => (f.lastModified && Date.now() - f.lastModified < 36 * 3600e3 ? f.lastModified : Date.now())));
  const shotAt = new Date(first);
  const runDate = shotAt.toISOString().slice(0, 10);

  const summary: string[] = [];
  const bySpot = new Map<string, SecretSwellRead[]>();
  const unknown: { file: File; read: SecretSwellRead }[] = [];
  for (const file of files) {
    const read = await readScreenshot(file);
    const spotId = secretSwellSpotOf(read);
    if (spotId === null) { summary.push(`✗ ${file.name}: "${read.spot}" is geen Ouddorp of Maasvlakte — overgeslagen`); continue; }
    if (spotId === undefined) { unknown.push({ file, read }); continue; }
    if (!bySpot.has(spotId)) bySpot.set(spotId, []);
    bySpot.get(spotId)!.push(read);
  }
  // Naam niet leesbaar (bv. doorgescrolde uurtabel): bij de spot van de rest van deze upload,
  // als dat er precies één is; anders overslaan (niet gokken).
  for (const u of unknown) {
    if (bySpot.size === 1) bySpot.get([...bySpot.keys()][0])!.push(u.read);
    else summary.push(`✗ ${u.file.name}: spotnaam niet leesbaar${bySpot.size > 1 ? ' en de upload bevat meerdere spots' : ''} — overgeslagen (zorg dat de spotnaam bovenaan in beeld is)`);
  }
  if (!bySpot.size) throw new Error(summary.join(' | ') || 'Geen bruikbare schermafbeelding.');

  const r = await saveSecretSwellReads(bySpot, shotAt, { label: 'Secret Swell (schermafbeelding)', note: 'uit schermafbeeldingen gelezen door AI (dashboard en/of uurtabel)' }, summary);
  if (!r) throw new Error(summary.join(' | ') || 'Geen bruikbare getallen gevonden op de schermafbeelding(en).');
  return { points: r, summary };
}

/** Gelezen Secret Swell-schermen per spot opslaan als bron "secretswell" (samengevoegd met vandaag). */
export async function saveSecretSwellReads(bySpot: Map<string, SecretSwellRead[]>, shotAt: Date, meta: { label: string; note: string }, summary: string[]): Promise<number> {
  const first = shotAt.getTime();
  const runDate = shotAt.toISOString().slice(0, 10);
  let total = 0;
  for (const [spotId, reads] of bySpot) {
    const sp = SECRETSWELL_SPOTS.find(x => x.spotId === spotId)!;
    const ref = doc(db, 'auditForecasts', `${runDate}_secretswell${sp.suffix}`);
    const existing = (await getDoc(ref)).data();
    // Eerdere upload vandaag: die vooruitkijktijd houden (verwachting telt vanaf de eerste blik).
    const runAt = existing?.runAt && Date.parse(existing.runAt) < first ? new Date(existing.runAt) : shotAt;
    const sets: AuditPoint[][] = [existing?.points || []];
    summary.push(`── ${sp.name} (${reads.length} schermafbeelding${reads.length === 1 ? '' : 'en'})`);
    for (const read of reads) {
      sets.push(secretSwellToPoints(read, runAt));
      const c = read.current;
      if (c) summary.push(`nu: ${c.verdict ?? '?'} · swell ${c.swellM ?? '?'} m @ ${c.periodS ?? '?'} s · golven ${c.wavesM ?? '?'} m · wind ${c.windKt ?? '?'} kt ${c.windAngle ?? ''}`);
      for (const d of (read.days || []).filter(d => !d.locked)) summary.push(`${d.label}: ${d.verdict ?? ''} ${d.waveMin ?? '?'}–${d.waveMax ?? '?'} m${d.windMin !== undefined ? ` · ${d.windMin}–${d.windMax ?? '?'} kt` : ''}`);
      for (const h of read.hours || []) summary.push(`${read.tableDate ?? ''} ${h.time}: golf ${h.waveM ?? '?'} m · swell ${h.swellM ?? '?'} m ${h.periodS ?? '?'} s ${h.swellDir ?? ''} · wind ${h.windKt ?? '?'}/${h.gustKt ?? '?'} kt ${h.windDir ?? ''}`);
    }
    const points = mergeAuditPoints(...sets);
    if (!points.length) { summary.push(`✗ ${sp.name}: geen bruikbare getallen gevonden`); continue; }
    await setDoc(ref, JSON.parse(JSON.stringify({
      runAt: runAt.toISOString(), runDate, spotId,
      source: 'secretswell', label: meta.label, kind: 'site', points,
      note: meta.note,
      reads: [...(existing?.reads || []), ...reads],
    })));
    total += points.length;
  }
  return total;
}
