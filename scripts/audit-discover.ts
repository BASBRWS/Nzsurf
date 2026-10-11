// Verkenning (test): bewaart de pagina's van surfsites als bestand (artifact),
// en probeert Surfline via een echte headless browser (Cloudflare).
import { mkdirSync, writeFileSync } from 'fs';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
mkdirSync('discover', { recursive: true });

async function save(name: string, url: string) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    writeFileSync(`discover/${name}`, text);
    console.log(`${name}: HTTP ${res.status}, ${text.length} tekens`);
  } catch (e: any) { console.log(`${name}: FOUT ${e.message}`); }
}

async function surflineBrowser() {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ userAgent: UA });
    const grabbed: Record<string, string> = {};
    page.on('response', async r => {
      const u = r.url();
      if (/services\.surfline\.com\/(kbyg|search)/.test(u)) {
        try { grabbed[u] = await r.text(); } catch {}
      }
    });
    await page.goto('https://www.surfline.com/search/Ouddorp', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    const links = await page.$$eval('a[href*="/surf-report/"]', as => as.map(a => (a as HTMLAnchorElement).href)).catch(() => []);
    console.log('Surfline links:', links.slice(0, 5));
    const spot = links.find(l => /ouddorp/i.test(l));
    if (spot) {
      await page.goto(spot.replace('/surf-report/', '/surf-forecasts/'), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(8000);
    }
    writeFileSync('discover/surfline-page.html', await page.content());
    writeFileSync('discover/surfline-api.json', JSON.stringify(grabbed, null, 1));
    console.log('Surfline API-responses:', Object.keys(grabbed).map(u => u.slice(0, 110)));
    // Directe API-aanvraag binnen de browsercontext (cookies van de challenge).
    const id = spot?.match(/([a-f0-9]{24})/)?.[1];
    if (id) {
      const direct = await page.evaluate(async (sid) => {
        const r = await fetch(`https://services.surfline.com/kbyg/spots/forecasts/wave?spotId=${sid}&days=5&intervalHours=3`);
        return `${r.status} ${(await r.text()).slice(0, 600)}`;
      }, id);
      console.log('Surfline direct wave:', direct);
    }
    await browser.close();
  } catch (e: any) { console.log('Surfline browser: FOUT', e.message); }
}

import { readFileSync, existsSync } from 'fs';
function analyse(file: string) {
  if (!existsSync(`discover/${file}`)) return;
  const t = readFileSync(`discover/${file}`, 'utf8');
  console.log(`\n##### ${file} (${t.length})`);
  const scripts = [...t.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .map(m => ({ attrs: m[1].trim().slice(0, 80), len: m[2].length, head: m[2].trim().slice(0, 90).replace(/\s+/g, ' ') }))
    .filter(x => x.len > 500).sort((a, b) => b.len - a.len).slice(0, 6);
  console.log('grote scripts:', JSON.stringify(scripts));
  for (const re of [/swell|wave_?height|waveHeight|golfhoogte/i, /period/i, /"(time|timestamp|datetime|date)"\s*:/i]) {
    let i = 0, from = 0, n = 0;
    while (n < 3 && (i = t.slice(from).search(re)) >= 0) {
      const at = from + i;
      console.log(`  [${re.source.slice(0, 20)}] …${t.slice(Math.max(0, at - 150), at + 250).replace(/\s+/g, ' ')}…`);
      from = at + 2000; n++;
    }
  }
}

async function main() {
  await save('surfnerd.html', 'https://www.surfnerd.com/surf-forecast/ouddorp');
  await save('windfinder.html', 'https://www.windfinder.com/forecast/ouddorp');
  await save('windfinder-super.html', 'https://www.windfinder.com/weatherforecast/ouddorp');
  await save('spotsguru.html', 'https://spots.guru/forecast/surf-ouddorp');
  await save('breakfinder.html', 'https://breakfinder.surf/en/surf_spots/ouddorp');
  await save('seaforecast.html', 'https://sea-forecast.com/netherlands/ouddorp');
  for (const f of ['surfnerd.html', 'windfinder.html', 'windfinder-super.html', 'spotsguru.html', 'breakfinder.html', 'seaforecast.html']) analyse(f);
  await surflineBrowser();
}
main();
