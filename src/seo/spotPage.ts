import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ForecastData } from '../types';
import { CatalogSpot, SPOT_CATALOG, SPOT_REGIONS, nearbyCatalogSpots, spotPagePath } from '../data/spotCatalog';
import { chanceLevel, chanceOf, findWindows, knotsToBft, pickNow, rawLine, reasonSentence, windTypeNl, windowLabel } from '../utils/surfMoments';
import { degreesToCompass16, spotKnowledgeArea, tideLevelLabel } from '../utils/spotKnowledge';

/**
 * Server-side HTML voor de vindbare spotpagina's (/surfverwachting/...).
 * Puur: krijgt spot + verwachting binnen en geeft een complete HTML-pagina terug.
 * Zelfde rekenkern als de app (surfMoments/spotKnowledge), zodat de pagina en de
 * app nooit iets anders zeggen. Tijden zijn lokale tijd (server draait op NL-tijd).
 */

export const SITE = 'https://www.noordzeesurf.nl';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const m = (v: number) => v.toFixed(1).replace('.', ',');
/** "1,1–1,4" of, bij gelijke waarden, "1,4". */
const range = (vals: number[], f: (v: number) => string) => {
  const lo = f(Math.min(...vals)), hi = f(Math.max(...vals));
  return lo === hi ? lo : `${lo}–${hi}`;
};
const int = (v: number) => String(Math.round(v));
const appLink = (s: CatalogSpot) => `/?spot=${encodeURIComponent(s.id)}`;

const STYLE = `
    :root { --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --accent:#0891b2; --bg:#f8fafc; --card:#ffffff;
            --good:#059669; --fair:#0284c7; --meh:#d97706; --no:#94a3b8; }
    @media (prefers-color-scheme: dark) { :root { --ink:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --accent:#22d3ee; --bg:#0b1220; --card:#0f172a; } }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); line-height:1.6; }
    header.top { display:flex; align-items:center; justify-content:space-between; gap:12px; max-width:860px; margin:0 auto; padding:16px; }
    header.top a { color:var(--ink); text-decoration:none; font-weight:800; letter-spacing:.02em; }
    .cta { display:inline-block; background:var(--accent); color:#fff !important; padding:10px 16px; border-radius:999px; font-weight:700; text-decoration:none; font-size:14px; }
    main { max-width:860px; margin:0 auto; padding:0 16px 48px; }
    nav.crumbs { font-size:13px; color:var(--muted); margin:8px 0 4px; }
    nav.crumbs a { color:var(--muted); }
    h1 { font-size: clamp(26px, 6vw, 38px); line-height:1.15; margin:8px 0 6px; }
    .meta { color:var(--muted); font-size:14px; margin:0 0 20px; }
    h2 { font-size:21px; margin:32px 0 8px; }
    h3 { font-size:16px; margin:18px 0 4px; }
    p, li { font-size:16px; }
    a { color:var(--accent); }
    .box { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px; margin:16px 0; }
    .now-label { font-size:22px; font-weight:800; margin:0 0 4px; }
    .raw { font-variant-numeric: tabular-nums; color:var(--muted); font-size:15px; margin:0 0 6px; }
    .pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:13px; font-weight:700; color:#fff; white-space:nowrap; }
    .good { background:var(--good); } .fair { background:var(--fair); } .meh { background:var(--meh); } .no { background:var(--no); }
    .scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
    table { width:100%; border-collapse:collapse; margin:8px 0; font-size:14px; font-variant-numeric: tabular-nums; }
    th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; white-space:nowrap; }
    th { color:var(--muted); font-weight:700; font-size:13px; }
    td.wrap { white-space:normal; }
    ul.spots { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
    ul.spots li { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 14px; font-size:15px; }
    ul.spots li a { font-weight:700; text-decoration:none; }
    ul.spots li span { display:block; color:var(--muted); font-size:13px; margin-top:2px; }
    .note { color:var(--muted); font-size:13px; }
    footer { max-width:860px; margin:0 auto; padding:24px 16px 48px; color:var(--muted); font-size:14px; border-top:1px solid var(--line); }
`;

function shell(o: { title: string; description: string; path: string; jsonLd: object; body: string; ctaHref: string; ctaText: string; noindex?: boolean }): string {
  const url = SITE + o.path;
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="${o.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:image" content="${SITE}/img/hero-v1-1600.webp">
  <meta property="og:locale" content="nl_NL">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/logo2.png">
  <script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>
  <style>${STYLE}</style>
</head>
<body>
  <header class="top">
    <a href="/">NZ · NoordzeeSurf</a>
    <a class="cta" href="${o.ctaHref}">${esc(o.ctaText)}</a>
  </header>
  <main>
${o.body}
  </main>
  <footer>
    <p>Golf-, wind- en waterstanddata: Open-Meteo. Spotkennis: lokale kennis van goedegolven.nl en spotgidsen van surfnerd.com. De kans is een hulpmiddel; de ruwe cijfers staan er altijd bij, zodat je zelf kunt oordelen.</p>
    <p><a href="/surfverwachting/">Alle surfspots</a> · <a href="/blog/">Blog</a> · <a href="/">NzSurf-app</a></p>
  </footer>
</body>
</html>`;
}

const pill = (chance: number) => {
  const l = chanceLevel(chance);
  return `<span class="pill ${l.key}">${esc(l.label)} · ${Math.round(chance)}%</span>`;
};

// timestamp is UTC (ISO); dag en uur altijd in lokale tijd bepalen.
const dateKey = (f: ForecastData) => format(parseISO(f.timestamp), 'yyyy-MM-dd');
const hourOf = (f: ForecastData) => parseISO(f.timestamp).getHours();
// Zelfde daglichtvenster als de beste momenten (findWindows).
const daytime = (f: ForecastData) => f.isDaylight && hourOf(f) >= 6 && hourOf(f) < 21;

function nowBlock(spot: CatalogSpot, fc: ForecastData[], now: Date): string {
  const cur = pickNow(fc, now);
  if (!cur) return '';
  const c = chanceOf(spot, cur);
  return `
    <div class="box">
      <p class="note">Nu (${format(parseISO(cur.timestamp), 'HH:mm')})</p>
      <p class="now-label">${pill(c)}</p>
      <p class="raw">${esc(rawLine(cur))}</p>
      <p>${esc(reasonSentence(spot, cur))}</p>
    </div>`;
}

function windowsBlock(spot: CatalogSpot, fc: ForecastData[], now: Date): string {
  const wins = findWindows(spot, fc, now, 45).slice(0, 4).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (!wins.length) {
    return `<p>Geen momenten met een redelijke of goede kans (45% of meer) bij daglicht in de komende dagen. De ruwe cijfers staan in de tabellen hieronder.</p>`;
  }
  return `<ul>${wins.map(w => `
      <li><b>${esc(windowLabel(w, now))}</b> ${pill(w.peakChance)}<br><span class="raw">${esc(rawLine(w.peak))}</span></li>`).join('')}
    </ul>`;
}

function weekTable(spot: CatalogSpot, fc: ForecastData[], now: Date): string {
  const today = format(now, 'yyyy-MM-dd');
  const days = new Map<string, ForecastData[]>();
  for (const f of fc) {
    const k = dateKey(f);
    if (k < today) continue;
    if (!days.has(k)) days.set(k, []);
    days.get(k)!.push(f);
  }
  const rows = [...days.entries()].slice(0, 7).map(([k, all]) => {
    // Vandaag alleen de blokken die nog komen.
    const items = all.filter(f => daytime(f) && (k !== today || parseISO(f.timestamp).getTime() + 3 * 3600e3 > now.getTime()));
    if (!items.length) return '';
    const waves = items.map(f => f.spotWaveHeight ?? f.waveHeight);
    const periods = items.map(f => f.swellPeriod);
    const winds = items.map(f => f.windSpeed);
    const best = items.reduce((a, b) => (chanceOf(spot, b) > chanceOf(spot, a) ? b : a));
    const turns = (all[0].dayTideTurns || []).map(t => `${t.isHigh ? 'HW' : 'LW'} ${t.time}`).join(' · ');
    const label = k === today ? 'Vandaag' : format(parseISO(k), 'EEEE d MMM', { locale: nl });
    return `
        <tr>
          <td><b>${esc(label)}</b></td>
          <td>${range(waves, m)} m</td>
          <td>${range(periods, int)} s</td>
          <td>${range(winds, int)} kn</td>
          <td>${pill(chanceOf(spot, best))} ${format(parseISO(best.timestamp), 'HH:mm')}</td>
          <td>${esc(turns || '—')}</td>
        </tr>`;
  }).join('');
  return `
    <div class="scroll"><table>
      <thead><tr><th>Dag</th><th>Golf (spot)</th><th>Periode</th><th>Wind</th><th>Beste kans (daglicht)</th><th>Getij</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>`;
}

function detailTable(spot: CatalogSpot, fc: ForecastData[], now: Date): string {
  const today = format(now, 'yyyy-MM-dd');
  const tomorrow = format(new Date(now.getTime() + 864e5), 'yyyy-MM-dd');
  const items = fc.filter(f => (dateKey(f) === today || dateKey(f) === tomorrow) && daytime(f)
    && parseISO(f.timestamp).getTime() + 3 * 3600e3 > now.getTime());
  if (!items.length) return '';
  const rows = items.map(f => `
        <tr>
          <td><b>${dateKey(f) === today ? 'vandaag' : 'morgen'} ${format(parseISO(f.timestamp), 'HH:mm')}</b></td>
          <td>${m(f.spotWaveHeight ?? f.waveHeight)} m <span class="note">(zee ${m(f.waveHeight)})</span></td>
          <td>${Math.round(f.swellPeriod)} s</td>
          <td>${degreesToCompass16(f.swellDirection)}</td>
          <td>${degreesToCompass16(f.windDirection)} ${knotsToBft(f.windSpeed)} Bft (${Math.round(f.windSpeed)} kn)${f.windType ? ` <span class="note">${esc(windTypeNl(f.windType))}</span>` : ''}</td>
          <td>${esc(tideLevelLabel(f.tideLevel, f.tideTrend))}</td>
          <td>${pill(chanceOf(spot, f))}</td>
        </tr>`).join('');
  return `
    <h2>Per 3 uur: vandaag en morgen</h2>
    <div class="scroll"><table>
      <thead><tr><th>Tijd</th><th>Golf</th><th>Periode</th><th>Swell uit</th><th>Wind</th><th>Getij</th><th>Kans</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>`;
}

function spotList(spots: CatalogSpot[]): string {
  return `<ul class="spots">${spots.map(s => `
      <li><a href="${spotPagePath(s)}">${esc(s.name)}</a><span>${esc(s.region)}</span></li>`).join('')}
    </ul>`;
}

export function renderSpotPage(spot: CatalogSpot, fc: ForecastData[] | null, now: Date, updatedAt?: Date): string {
  const path = spotPagePath(spot);
  const facing = degreesToCompass16(spot.coastlineAngle);
  const offshore = degreesToCompass16(spot.coastlineAngle + 180);
  const area = spotKnowledgeArea(spot);
  const whenAnswer = `${spot.tideText} Beste swell: ${spot.bestSwell.join(', ')}. Beste wind: ${spot.bestWind.join(', ')} (aflandig is ${offshore}).`;
  const hasFc = !!fc && fc.length > 0;

  const forecastHtml = hasFc ? `
    <h2>Kan ik nu surfen in ${esc(spot.place)}?</h2>
    ${nowBlock(spot, fc!, now)}
    <h2>Beste momenten</h2>
    ${windowsBlock(spot, fc!, now)}
    <h2>Komende 7 dagen</h2>
    ${weekTable(spot, fc!, now)}
    ${detailTable(spot, fc!, now)}
    <p class="note">Golf (spot) is de verwachte hoogte op het strand: de modelhoogte op zee, gecorrigeerd voor swellrichting, ligging en de banken voor de kust. Getijtijden zijn benaderd uit de verwachte waterstand.</p>`
    : `
    <div class="box">
      <p><b>De verwachting is op dit moment niet beschikbaar.</b> Open de app voor de actuele golfhoogte, wind en het getij.</p>
      <p><a class="cta" href="${appLink(spot)}">Open ${esc(spot.place)} in de app</a></p>
    </div>`;

  const body = `
    <nav class="crumbs"><a href="/">NzSurf</a> › <a href="/surfverwachting/">Surfverwachting</a> › ${esc(spot.name)}</nav>
    <h1>Surfverwachting ${esc(spot.name)}</h1>
    <p class="meta">${esc(spot.region)}${updatedAt ? ` · bijgewerkt ${esc(format(updatedAt, 'EEEE d MMMM HH:mm', { locale: nl }))}` : ''}</p>
    <p>Golfhoogte, swellperiode, wind en getij voor ${esc(spot.name)}, per 3 uur voor de komende week. Per moment zie je de <b>kans dat de spot werkt</b>, met de ruwe cijfers erbij.</p>
    ${forecastHtml}

    <h2>Wanneer werkt ${esc(spot.place)}?</h2>
    <p>${esc(spot.description)}</p>
    <ul>
      <li><b>Ligging:</b> het strand kijkt naar het ${facing}; aflandige wind komt uit het ${offshore}.</li>
      <li><b>Beste swell:</b> ${esc(spot.bestSwell.join(', '))}.</li>
      <li><b>Beste wind:</b> ${esc(spot.bestWind.join(', '))}.</li>
      <li><b>Getij:</b> ${esc(spot.tideText)}</li>
      ${area ? `<li><b>Gebied in NzSurf:</b> ${esc(area)}. De app rekent hier met de lokale kennis van dit gebied (demping, swellrichting, getij).</li>` : ''}
    </ul>
    ${spot.blog ? `<p>Uitgebreide gids: <a href="${spot.blog}">alles over surfen in ${esc(spot.place)}</a>.</p>` : ''}

    <div class="box">
      <p><b>Volg ${esc(spot.place)} in de app.</b> Voeg deze spot toe aan je eigen spots en zie per uur de kans dat hij werkt, met een advies voor je board en wetsuit.</p>
      <p><a class="cta" href="${appLink(spot)}">Open in NzSurf en voeg toe</a></p>
    </div>

    <h2>Spots in de buurt</h2>
    ${spotList(nearbyCatalogSpots(spot))}

    <h2>Veelgestelde vragen</h2>
    <h3>Wanneer kun je surfen in ${esc(spot.place)}?</h3>
    <p>${esc(whenAnswer)}</p>
    <h3>Welke wind is goed in ${esc(spot.place)}?</h3>
    <p>Het strand kijkt naar het ${facing}. Wind uit het ${offshore} waait aflandig en houdt de golven schoon; wind uit zee (aanlandig) maakt het snel rommelig.</p>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE}${path}#page`,
        url: SITE + path,
        name: `Surfverwachting ${spot.name}`,
        inLanguage: 'nl-NL',
        ...(updatedAt ? { dateModified: updatedAt.toISOString() } : {}),
        about: {
          '@type': 'Beach',
          name: spot.name,
          address: { '@type': 'PostalAddress', addressLocality: spot.place, addressRegion: spot.region, addressCountry: 'NL' },
          geo: { '@type': 'GeoCoordinates', latitude: spot.lat, longitude: spot.lng },
        },
        isPartOf: { '@type': 'WebSite', name: 'NzSurf', url: SITE + '/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'NzSurf', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Surfverwachting', item: SITE + '/surfverwachting/' },
          { '@type': 'ListItem', position: 3, name: spot.name, item: SITE + path },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: `Wanneer kun je surfen in ${spot.place}?`, acceptedAnswer: { '@type': 'Answer', text: whenAnswer } },
          { '@type': 'Question', name: `Welke wind is goed in ${spot.place}?`,
            acceptedAnswer: { '@type': 'Answer', text: `Het strand kijkt naar het ${facing}. Wind uit het ${offshore} waait aflandig en houdt de golven schoon; aanlandige wind maakt het snel rommelig.` } },
        ],
      },
    ],
  };

  return shell({
    title: `Surfverwachting ${spot.name}: golven, wind en getij | NzSurf`,
    description: `Actuele surfverwachting voor ${spot.name} (${spot.region}): golfhoogte, swellperiode, wind en getij per 3 uur voor 7 dagen, met de kans dat de spot werkt.`,
    path, jsonLd, body,
    ctaHref: appLink(spot), ctaText: 'Open in de app',
  });
}

export function renderIndexPage(): string {
  const groups = SPOT_REGIONS.map(r => {
    const spots = SPOT_CATALOG.filter(s => s.region === r);
    return `
    <h2>${esc(r)}</h2>
    <ul class="spots">${spots.map(s => `
      <li><a href="${spotPagePath(s)}">Surfverwachting ${esc(s.name)}</a><span>${esc(s.description.split('. ')[0].replace(/\.$/, ''))}.</span></li>`).join('')}
    </ul>`;
  }).join('');

  const body = `
    <nav class="crumbs"><a href="/">NzSurf</a> › Surfverwachting</nav>
    <h1>Surfverwachting Nederland: alle surfspots</h1>
    <p class="meta">${SPOT_CATALOG.length} spots langs de Nederlandse Noordzeekust</p>
    <p>Kies een spot voor de actuele golfhoogte, swellperiode, wind en het getij, per 3 uur voor de komende week. Per moment zie je de kans dat de spot werkt, met de ruwe cijfers erbij zodat je zelf kunt oordelen.</p>
    ${groups}
    <div class="box">
      <p><b>Je eigen spots in de app.</b> In NzSurf voeg je de spots toe die je zelf surft. Staat jouw spot er niet bij? Maak hem aan in de app; hij neemt automatisch de kennis van het gebied over.</p>
      <p><a class="cta" href="/">Open NzSurf</a></p>
    </div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/surfverwachting/#page`,
        url: `${SITE}/surfverwachting/`,
        name: 'Surfverwachting Nederland: alle surfspots',
        inLanguage: 'nl-NL',
        hasPart: SPOT_CATALOG.map(s => ({ '@type': 'WebPage', name: `Surfverwachting ${s.name}`, url: SITE + spotPagePath(s) })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'NzSurf', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Surfverwachting', item: `${SITE}/surfverwachting/` },
        ],
      },
    ],
  };

  return shell({
    title: 'Surfverwachting Nederland: alle surfspots aan de Noordzee | NzSurf',
    description: `Surfverwachting voor ${SPOT_CATALOG.length} Nederlandse surfspots: Scheveningen, Zandvoort, Wijk aan Zee, Domburg, Ouddorp en meer. Golfhoogte, wind en getij per 3 uur.`,
    path: '/surfverwachting/', jsonLd, body,
    ctaHref: '/', ctaText: 'Open de app',
  });
}

export function renderNotFoundPage(): string {
  return shell({
    title: 'Spot niet gevonden | NzSurf',
    description: 'Deze surfspot bestaat niet (meer). Bekijk alle surfspots.',
    path: '/surfverwachting/', jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Spot niet gevonden' },
    body: `
    <h1>Spot niet gevonden</h1>
    <p>Deze pagina bestaat niet (meer). Kies een spot uit de lijst:</p>
    ${spotList(SPOT_CATALOG)}`,
    ctaHref: '/', ctaText: 'Open de app', noindex: true,
  });
}
