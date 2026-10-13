// Leest de ruwe opnames die de app ophaalt (auditRaw) en print de opbouw, zodat
// de uitlezers voor surfnerd/Surfline gebouwd en gecontroleerd kunnen worden.
// Alleen lezen. Draaien via de workflow "Audit: ruwe opnames bekijken".
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseSurfline, parseSurfnerd } from '../src/utils/siteParsers';

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

// Controle op onmogelijke waarden in metingen en verwachtingen (RAW_DATE=controle).
async function checkValues() {
  const LIMITS: Record<string, [number, number]> = { hs: [0, 15], tm02: [0, 25], tp: [0, 30], windKn: [0, 90], gustKn: [0, 120], dir: [0, 360], windDir: [0, 360], level: [-5, 6] };
  const bad = (p: any) => Object.entries(LIMITS).filter(([k, [lo, hi]]) => typeof p[k] === 'number' && (p[k] < lo || p[k] > hi || !Number.isFinite(p[k])));
  const obs = await db.collection('auditObservations').get();
  for (const d of obs.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const x = d.data() as any;
    const pts: any[] = x.points || [];
    const max = (k: string) => Math.max(...pts.map(p => (typeof p[k] === 'number' ? p[k] : -Infinity)));
    console.log(`meting ${d.id}: ${pts.length} uren, bron ${x.source}, bijgewerkt ${x.updatedAt}, max hs ${max('hs')} tm02 ${max('tm02')} wind ${max('windKn')}`);
    for (const p of pts) { const b = bad(p); if (b.length) console.log('   ONMOGELIJK', JSON.stringify(p)); }
    const types = new Set(pts.flatMap(p => Object.entries(p).filter(([k]) => k !== 't').map(([k, v]) => `${k}:${typeof v}`)));
    console.log('   velden:', [...types].join(' '));
  }
  const fc = await db.collection('auditForecasts').get();
  for (const d of fc.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const pts: any[] = (d.data() as any).points || [];
    const b = pts.filter(p => bad(p).length);
    if (b.length) console.log(`verwachting ${d.id}: ${b.length} onmogelijke punten, bv. ${JSON.stringify(b[0])}`);
  }
}

// Welke RWS-meetpunten rond Ouddorp meten golven? (RAW_DATE=stations; alleen lezen)
const OUDDORP = { lat: 51.8253, lng: 3.8874 };
function toUtm31(lat: number, lng: number) {
  // WGS84 → UTM zone 31N (EPSG:25831/32631), genoeg voor afstanden.
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const φ = lat * Math.PI / 180, λ = lng * Math.PI / 180, λ0 = 3 * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2), T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - λ0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64) * φ - (3 * e2 / 8 + 3 * e2 ** 2 / 32) * Math.sin(2 * φ) + (15 * e2 ** 2 / 256) * Math.sin(4 * φ));
  return {
    x: 500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6),
    y: k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24)),
  };
}
async function rws(path: string, body: unknown) {
  const res = await fetch(`https://ddapi20-waterwebservices.rijkswaterstaat.nl${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text.trim() ? JSON.parse(text) : {};
}
async function listStations() {
  const cat = await rws('/METADATASERVICES/OphalenCatalogus', { CatalogusFilter: { Grootheden: true, Eenheden: true, Hoedanigheden: true, Compartimenten: true } });
  const locs: any[] = cat.LocatieLijst || [], meta: any[] = cat.AquoMetadataLijst || [], links: any[] = cat.AquoMetadataLocatieLijst || [];
  console.log(`Catalogus: ${locs.length} locaties; voorbeeld: ${JSON.stringify(locs[0])}`);
  const home = toUtm31(OUDDORP.lat, OUDDORP.lng);
  const dist = (l: any) => {
    if (Number.isFinite(Number(l.Lat)) && Number.isFinite(Number(l.Lon))) {
      const u = toUtm31(Number(l.Lat), Number(l.Lon)); return Math.hypot(u.x - home.x, u.y - home.y) / 1000;
    }
    const x = Number(l.X), y = Number(l.Y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) { const u = toUtm31(y, x); return Math.hypot(u.x - home.x, u.y - home.y) / 1000; }
    return Math.hypot(x - home.x, y - home.y) / 1000;
  };
  const want = ['Hm0', 'Tm02', 'Th0', 'H1/3', 'Tm-10'];
  const near = locs.map(l => {
    const ids = links.filter(k => k.Locatie_MessageID === l.Locatie_MessageID).map(k => k.AquoMetaData_MessageID);
    const metas = meta.filter(m => ids.includes(m.AquoMetadata_MessageID));
    const g = [...new Set(metas.map(m => m.Grootheid?.Code))];
    return { code: l.Code, naam: l.Naam, km: dist(l), g, metas };
  }).filter(s => (s.km <= 25 || /schouwenbank|europlatform/i.test(s.code)) && s.g.includes('Hm0')).sort((a, b) => a.km - b.km);
  console.log(`\nMeetpunten met golfgrootheden binnen 40 km van Ouddorp: ${near.length}`);
  const to = new Date(); to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - 72 * 3600e3);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000+00:00');
  const series: Record<string, Map<string, number>> = {};
  for (const s of near) {
    let line = `${s.km.toFixed(1).padStart(5)} km  ${s.code.padEnd(36)} ${String(s.naam).slice(0, 40).padEnd(40)} [${s.g.filter(c => want.includes(c)).join(',')}]`;
    if (s.g.includes('Hm0')) {
      try {
        // Korte vraag; leeg → elke catalogusvariant (eenheid, hoedanigheid, parameter, procestype).
        const variants: any[] = [{ Compartiment: { Code: 'OW' }, Grootheid: { Code: 'Hm0' } }];
        for (const m of s.metas.filter((m: any) => m.Grootheid?.Code === 'Hm0')) variants.push({
          Compartiment: { Code: m.Compartiment?.Code || 'OW' }, Grootheid: { Code: 'Hm0' },
          ...(m.Eenheid?.Code ? { Eenheid: { Code: m.Eenheid.Code } } : {}),
          ...(m.Hoedanigheid?.Code ? { Hoedanigheid: { Code: m.Hoedanigheid.Code } } : {}),
          ...(m.Parameter?.Code ? { Parameter: { Code: m.Parameter.Code } } : {}),
          ...(m.ProcesType ? { ProcesType: m.ProcesType } : {}),
        });
        let d: any = {};
        const tried: string[] = [];
        for (const v of variants) {
          try {
            d = await rws('/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', {
              Locatie: { Code: s.code }, AquoPlusWaarnemingMetadata: { AquoMetadata: v },
              Periode: { Begindatumtijd: fmt(from), Einddatumtijd: fmt(to) },
            });
            if ((d.WaarnemingenLijst || []).length) break;
            tried.push('leeg');
          } catch (e: any) { tried.push(e.message.slice(0, 60)); }
        }
        if (!(d.WaarnemingenLijst || []).length) line += `  [${variants.length} varianten: ${[...new Set(tried)].join(' | ')}]`;
        const hourly = new Map<string, number[]>();
        for (const w of d.WaarnemingenLijst || []) for (const m of w.MetingenLijst || []) {
          const v = m.Meetwaarde?.Waarde_Numeriek;
          if (typeof v !== 'number' || v >= 9999 || String(m.WaarnemingMetadata?.KwaliteitswaardecodeLijst?.[0]) === '99') continue;
          const h = new Date(m.Tijdstip).toISOString().slice(0, 13);
          (hourly.get(h) || hourly.set(h, []).get(h)!).push(v / 100);
        }
        const avg = new Map([...hourly].map(([h, v]) => [h, v.reduce((a, b) => a + b, 0) / v.length]));
        series[s.code] = avg;
        const vals = [...avg.values()];
        const last = [...avg.keys()].sort().pop();
        line += vals.length ? `  Hm0: ${vals.length} uur, gem ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)} m, max ${Math.max(...vals).toFixed(2)} m, laatste ${last}` : '  Hm0: geen recente data';
      } catch (e: any) { line += `  Hm0: fout ${e.message.slice(0, 80)}`; }
    }
    console.log(line);
  }
  // Vergelijking met Schouwenbank (de huidige bron): gemiddelde verhouding per uur.
  // Laatste meting per meetpunt (ook oudere) om te zien of een post nog in bedrijf is.
  const ref = series['schouwenbank.1'];
  if (ref) {
    console.log('\nVerhouding t.o.v. schouwenbank.1 (zelfde uren):');
    for (const [code, m] of Object.entries(series)) {
      const r = [...m].filter(([h]) => ref.has(h) && ref.get(h)! > 0.2).map(([h, v]) => v / ref.get(h)!);
      if (r.length) console.log(`  ${code.padEnd(36)} ${(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)}× (${r.length} uur)`);
    }
  }
}

async function main() {
  const want = process.env.RAW_DATE || '';
  if (want === 'controle') return checkValues();
  if (want === 'stations') return listStations();
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

  // Controle: de uitlezers van de app op deze ruwe opnames.
  const day = docs.filter(x => x.runDate === date);
  const json = (name: string) => { try { return JSON.parse(day.find(x => x.name === name)?.body || ''); } catch { return null; } };
  const runAtOf = (name: string) => new Date(day.find(x => x.name === name)?.runAt || Date.now());
  const show = (label: string, pts: any[]) => {
    console.log(`\n### Uitlezer ${label}: ${pts.length} punten`);
    pts.slice(0, 4).forEach(p => console.log('   ', JSON.stringify(p)));
    if (pts.length > 4) console.log('    …', JSON.stringify(pts[pts.length - 1]));
  };
  const nerd = day.find(x => x.name === 'surfnerd');
  if (nerd?.body) show('surfnerd', parseSurfnerd(nerd.body, runAtOf('surfnerd')));
  if (day.some(x => String(x.name).startsWith('surfline-'))) {
    show('Surfline', parseSurfline({ wave: json('surfline-wave'), swells: json('surfline-swells'), surf: json('surfline-surf'),
      wind: json('surfline-wind'), rating: json('surfline-rating') }, runAtOf('surfline-wind')));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
