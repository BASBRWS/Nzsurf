// Leest de ruwe opnames die de app ophaalt (auditRaw) en print de opbouw, zodat
// de uitlezers voor surfnerd/Surfline gebouwd en gecontroleerd kunnen worden.
// Alleen lezen. Draaien via de workflow "Audit: ruwe opnames bekijken".
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) throw new Error('Ontbrekende env-var: FIREBASE_SERVICE_ACCOUNT');
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(sa)) }), process.env.FIRESTORE_DATABASE_ID || 'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10');

const snip = (s: string, i: number, n = 400) => JSON.stringify(s.slice(Math.max(0, i - 120), i + n));

function describeJson(name: string, body: string) {
  let j: any;
  try { j = JSON.parse(body); } catch { console.log('  (geen geldige JSON)'); console.log('  begin:', JSON.stringify(body.slice(0, 600))); return; }
  console.log('  top-level:', Array.isArray(j) ? `array[${j.length}]` : Object.keys(j).join(', '));
  if (j?.associated) console.log('  associated:', JSON.stringify(j.associated).slice(0, 800));
  if (j?.data && typeof j.data === 'object') {
    for (const [k, v] of Object.entries(j.data)) {
      console.log(`  data.${k}:`, Array.isArray(v) ? `array[${v.length}]` : typeof v);
      if (Array.isArray(v) && v.length) console.log('    eerste:', JSON.stringify(v[0]).slice(0, 1200));
    }
  }
  if (name.includes('search')) console.log('  zoekresultaat (begin):', JSON.stringify(j).slice(0, 2500));
}

function describeHtml(body: string) {
  console.log('  title:', body.match(/<title>([^<]*)/i)?.[1]);
  console.log('  scripts:', [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]).slice(0, 15).join(' '));
  for (const m of body.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1], content = m[2];
    if (content.length > 500) console.log(`  inline script ${attrs.trim() || '(geen attrs)'} — ${content.length} tekens:`, JSON.stringify(content.slice(0, 1500)));
  }
  for (const k of ['__NEXT_DATA__', '__NUXT__', 'self.__next_f', 'swell', 'Swell', 'period', 'Period', 'wave', 'Wave', 'wind', 'Wind', 'kts', 'knots', '<table', 'data-']) {
    const idx: number[] = [];
    let i = -1;
    while ((i = body.indexOf(k, i + 1)) !== -1 && idx.length < 3) idx.push(i);
    if (idx.length) console.log(`  "${k}" (${idx.length}+):`, idx.map(x => snip(body, x)).join('\n      '));
  }
  // Sleutel/waarde-paren met golf- of windgegevens (JSON in de pagina, bv. Next.js).
  const kv = [...body.matchAll(/\\?"([A-Za-z_]*(?:swell|wave|period|height|wind|gust|direction|rating|time|date)[A-Za-z_]*)\\?"\s*:/gi)];
  const counts = new Map<string, number>();
  kv.forEach(m => counts.set(m[1], (counts.get(m[1]) || 0) + 1));
  console.log('  sleutels:', [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${k}×${n}`).join(' '));
  for (const k of [...counts.keys()].slice(0, 8)) {
    const i = body.search(new RegExp(`\\\\?"${k}\\\\?"\\s*:`));
    if (i >= 0) console.log(`  [${k}]`, JSON.stringify(body.slice(Math.max(0, i - 300), i + 900)));
  }
  // Zichtbare tekst (zonder scripts/stijlen), om een tabel te herkennen.
  const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('  zichtbare tekst (begin):', JSON.stringify(text.slice(0, 3000)));
  console.log('  API-achtige URLs:', [...new Set([...body.matchAll(/https?:\/\/[a-z0-9.-]*(?:api|data|forecast)[a-z0-9./_?=&-]*/gi)].map(m => m[0]))].slice(0, 20).join(' '));
}

async function main() {
  const want = process.env.RAW_DATE || '';
  const snap = await db.collection('auditRaw').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const dates = [...new Set(docs.map(d => d.runDate))].sort();
  console.log('Beschikbare dagen:', dates.join(', ') || '(geen)');
  const date = want || dates[dates.length - 1];
  for (const d of docs.filter(x => x.runDate === date).sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`\n=== ${d.id} — status ${d.status ?? '-'}, ${d.length ?? 0} tekens${d.truncated ? ' (afgekapt)' : ''}${d.error ? `, fout: ${d.error}` : ''}`);
    if (d.results) { console.log('  resultaten:', d.results.join(' | ')); continue; }
    if (d.url) console.log('  url:', d.url);
    if (d.title || d.finalUrl) console.log('  pagina:', d.title || '-', '|', d.finalUrl || '-');
    const body: string = d.body || '';
    if (!body) continue;
    if (/^\s*[\[{]/.test(body)) describeJson(d.name || d.id, body); else describeHtml(body);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
