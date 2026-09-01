// Verrijkt public/surfboard-dataset-TOTAAL-1024.json met een `afbeelding_url`
// per board, gehaald uit de og:image van de productpagina (`bron_url`).
//
// Draait op de GitHub Actions-runner (open internet) — NIET in de Claude-omgeving
// (die blokkeert de shop-domeinen). Idempotent: slaat boards over die al een
// afbeelding hebben, tenzij je `--force` meegeeft.
//
//   node scripts/scrape-board-images.mjs [--force] [--limit=N]
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/surfboard-dataset-TOTAAL-1024.json';
const CONCURRENCY = 6;
const TIMEOUT_MS = 15000;
const FORCE = process.argv.includes('--force');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const boards = data.boards || [];

function extractImage(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const val = m[1].trim();
      let href;
      try { href = new URL(val, baseUrl).href; } catch { href = val; }
      // Forceer https (de app draait op https; http = mixed content).
      return href.replace(/^http:\/\//, 'https://');
    }
  }
  return null;
}

async function fetchImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractImage(html, res.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const todo = boards.filter((b) => b.bron_url && (FORCE || !b.afbeelding_url)).slice(0, LIMIT);
const imgById = {};
let idx = 0;
let ok = 0;
let fail = 0;
let done = 0;

function applyAndSave() {
  for (const b of data.boards || []) if (imgById[b.board_id]) b.afbeelding_url = imgById[b.board_id];
  if (data.boards_by_id) {
    for (const id of Object.keys(data.boards_by_id)) {
      if (imgById[id]) data.boards_by_id[id].afbeelding_url = imgById[id];
    }
  }
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

async function worker() {
  while (idx < todo.length) {
    const b = todo[idx++];
    const img = await fetchImage(b.bron_url);
    done++;
    if (img) { imgById[b.board_id] = img; ok++; } else { fail++; }
    if (done % 50 === 0) {
      applyAndSave();
      console.log(`voortgang ${done}/${todo.length} — ok ${ok}, mislukt ${fail}`);
    }
  }
}

console.log(`Start scrape: ${todo.length} boards (van ${boards.length}).`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
applyAndSave();
console.log(`Klaar: ${ok} afbeeldingen gevonden, ${fail} mislukt van ${todo.length}.`);
