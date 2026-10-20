// NzSurf voorspellingsaudit — verzamelaar (draait dagelijks op GitHub Actions).
//
// Slaat voor Ouddorp en de Maasvlakte per bron de verwachting voor de komende 7 dagen op (per 3 uur),
// plus de werkelijke metingen van Rijkswaterstaat (Lichteiland Goeree). Later worden
// die tegen elkaar gelegd: wie voorspelt welk onderdeel het best, per vooruitkijktijd.
//
// Draaien:   bun run scripts/forecast-audit.ts
// Env:       FIREBASE_SERVICE_ACCOUNT (JSON)  — niet nodig bij AUDIT_DRY_RUN=1
//            FIRESTORE_DATABASE_ID            — optioneel
//            STORMGLASS_API_KEY               — optioneel (bron wordt anders overgeslagen)
//            AUDIT_DRY_RUN=1                  — niets opslaan, alleen loggen
//            TZ=Europe/Amsterdam              — nodig voor de NzSurf-tijden (zie workflow)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

import { DEFAULT_SPOTS } from '../src/constants';
import { SPOT_CATALOG, toSurfSpot } from '../src/data/spotCatalog';
import type { SurfSpot } from '../src/types';
import { fetchForecast } from '../src/services/weatherService';
import { withAreaDefaults } from '../src/utils/spotKnowledge';
import { plausibleObs } from '../src/utils/forecastAudit';
import { parseWompy } from '../src/utils/siteParsers';

// ── Instellingen ────────────────────────────────────────────────────────────
// Auditspots. De metingen (boei Maasgeul 2, wind Europlatform) zijn voor beide gelijk;
// de verwachtingen per spot. Documenten: <datum>_<bron><suffix>, spotId = spot.id.
interface AuditSpotCfg {
  spot: SurfSpot; suffix: string;
  windfinder: string; breakfinder?: string; seaforecast?: string; wompy?: string;
  stormglass: boolean; // gratis tegoed is klein: alleen voor Ouddorp
}
const AUDIT_SPOTS: AuditSpotCfg[] = [
  { spot: withAreaDefaults(DEFAULT_SPOTS.find(s => s.id === 'ouddorp-p-noordweg')!), suffix: '',
    windfinder: 'ouddorp', breakfinder: 'ouddorp', seaforecast: 'netherlands/ouddorp', wompy: 'ouddorp', stormglass: true },
  // Maasvlakte: rekenpunt bij de reddingspost met de webcam (surfnerd P5 / Surfline Slufter), niet bij P6.
  { spot: withAreaDefaults({ ...toSurfSpot(SPOT_CATALOG.find(s => s.id === 'maasvlakte')!), name: 'Maasvlakte (reddingspost)', lat: 51.9292, lng: 3.9766 }), suffix: '_maasvlakte',
    windfinder: 'maasvlakte', breakfinder: 'maasvlakte', wompy: 'maasvlakte', stormglass: false },
];
const SPOT = AUDIT_SPOTS[0].spot; // metingen en log
const HORIZON_HOURS = 7 * 24;
const STEP_HOURS = 3;
const DRY_RUN = process.env.AUDIT_DRY_RUN === '1';
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10';
const KN_PER_MS = 1.943844;

// ── Datamodel ───────────────────────────────────────────────────────────────
// Eén voorspeld moment, genormaliseerd: meters, seconden, graden (waar het vandaan
// komt), knopen, UTC. Ontbrekende onderdelen blijven leeg (nooit 0 invullen).
export interface AuditPoint {
  t: string;        // geldig tijdstip, ISO UTC
  lead: number;     // uren vooruit t.o.v. het ophaalmoment
  hs?: number;      // golfhoogte (significant) op zee, m
  tp?: number;      // golfperiode, s
  dir?: number;     // golfrichting (vandaan), graden
  windKn?: number;  // windsnelheid, kn
  windDir?: number; // windrichting (vandaan), graden
  gustKn?: number;  // windstoten, kn
  // Alleen NzSurf / surfsites:
  spotHs?: number;  // verwachte hoogte op de spot (na demping/richting)
  chance?: number;  // kans dat de spot werkt, 0–100
  tide?: number;    // waterstand, m
  surfMin?: number; // brekende golf (Surfline e.d.), m
  surfMax?: number;
  rating?: string;  // kwaliteitslabel van de bron
}

export interface SourceResult {
  source: string;   // vaste sleutel, bv. 'nzsurf', 'ecmwf'
  label: string;    // leesbare naam
  kind: 'nzsurf' | 'model' | 'site';
  points: AuditPoint[];
  note?: string;
}

const runAt = new Date();
const runDate = runAt.toISOString().slice(0, 10);
const round = (v: number | null | undefined, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined;
const leadOf = (iso: string) => Math.round((Date.parse(iso) - runAt.getTime()) / 3600e3);
const keep = (iso: string) => {
  const d = new Date(iso);
  const lead = leadOf(iso);
  return d.getUTCHours() % STEP_HOURS === 0 && lead >= -1 && lead <= HORIZON_HOURS;
};
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 120)} — ${text.slice(0, 200)}`);
  if (!text.trim()) return {}; // bv. 204: geen data in deze periode
  return JSON.parse(text);
}

// ── Bron: NzSurf (eigen algoritme) ──────────────────────────────────────────
async function collectNzSurf(spot: SurfSpot): Promise<SourceResult> {
  const fc = await fetchForecast(spot);
  const points = fc
    .map(f => clean<AuditPoint>({
      t: new Date(f.timestamp).toISOString(),
      lead: leadOf(f.timestamp),
      hs: round(f.waveHeight),
      tp: round(f.swellPeriod, 1),
      dir: round(f.swellDirection, 0),
      windKn: round(f.windSpeed, 1),
      windDir: round(f.windDirection, 0),
      spotHs: round(f.spotWaveHeight),
      chance: f.surfChance,
      tide: round(f.tideHeight),
    }))
    // NzSurf rekent in 3-uursblokken op NL-tijd; die liggen niet op het UTC-raster.
    .filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS);
  return { source: 'nzsurf', label: 'NzSurf (ons algoritme)', kind: 'nzsurf', points,
    note: fc[0]?.tideSource ? `getij: ${fc[0].tideSource}` : undefined };
}

// ── Bron: losse modellen via Open-Meteo ─────────────────────────────────────
// Golfmodel + windmodel van dezelfde familie. Ontbreekt een van de twee, dan
// slaan we de rest wel op.
const MODEL_FAMILIES: { source: string; label: string; wave?: string; wind?: string }[] = [
  { source: 'ecmwf', label: 'ECMWF (WAM + IFS)', wave: 'ecmwf_wam025', wind: 'ecmwf_ifs025' },
  { source: 'dwd', label: 'DWD (EWAM + ICON)', wave: 'ewam', wind: 'icon_seamless' },
  { source: 'meteofrance', label: 'Météo-France (MFWAM + Arpège/Arome)', wave: 'meteofrance_wave', wind: 'meteofrance_seamless' },
  { source: 'gfs', label: 'NOAA GFS (wave + wind)', wave: 'ncep_gfswave016,ncep_gfswave025', wind: 'gfs_seamless' },
  { source: 'knmi', label: 'KNMI HARMONIE (alleen wind)', wind: 'knmi_seamless' },
  { source: 'openmeteo', label: 'Open-Meteo best match', wave: 'best_match', wind: 'best_match' },
];

async function collectModel(fam: typeof MODEL_FAMILIES[number], spot: SurfSpot): Promise<SourceResult> {
  const { lat, lng } = spot;
  const notes: string[] = [];
  const byTime = new Map<string, AuditPoint>();
  const at = (iso: string) => {
    const t = new Date(iso + 'Z').toISOString();
    if (!byTime.has(t)) byTime.set(t, { t, lead: leadOf(t) });
    return byTime.get(t)!;
  };
  // Meerdere golfmodellen mogelijk (komma): de eerste met bruikbare waarden wint.
  // Hoogte én periode 0 = rasterpunt op land → als ontbrekend behandelen.
  for (const waveModel of (fam.wave || '').split(',').filter(Boolean)) {
    try {
      const d = await getJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
        `&hourly=wave_height,wave_period,wave_direction&models=${waveModel}&timezone=GMT&forecast_days=8`);
      const hs: (number | null)[] = d.hourly?.wave_height || [];
      const tp: (number | null)[] = d.hourly?.wave_period || [];
      const usable = hs.some((v, i) => typeof v === 'number' && (v > 0 || (tp[i] ?? 0) > 0));
      if (!usable) { notes.push(`golfmodel ${waveModel}: geen bruikbare waarden (land?)`); continue; }
      d.hourly.time.forEach((iso: string, i: number) => {
        if (!(typeof hs[i] === 'number' && ((hs[i] as number) > 0 || (tp[i] ?? 0) > 0))) return;
        const p = at(iso);
        p.hs = round(hs[i]);
        p.tp = round(tp[i], 1);
        p.dir = round(d.hourly.wave_direction[i], 0);
      });
      if (waveModel !== fam.wave) notes.push(`golfmodel: ${waveModel}`);
      break;
    } catch (e: any) { notes.push(`golfmodel ${waveModel}: ${e.message}`); }
  }
  if (fam.wind) {
    try {
      const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&models=${fam.wind}&timezone=GMT&forecast_days=8`);
      d.hourly.time.forEach((iso: string, i: number) => {
        const p = at(iso);
        p.windKn = round(d.hourly.wind_speed_10m[i], 1);
        p.windDir = round(d.hourly.wind_direction_10m[i], 0);
        p.gustKn = round(d.hourly.wind_gusts_10m?.[i], 1);
      });
    } catch (e: any) { notes.push(`windmodel ${fam.wind}: ${e.message}`); }
  }
  const points = [...byTime.values()].map(p => clean(p)).filter(p => keep(p.t)
    && (p.hs !== undefined || p.windKn !== undefined));
  return { source: fam.source, label: fam.label, kind: 'model', points, note: notes.join(' | ') || undefined };
}

// ── Bron: Stormglass (optioneel, API-sleutel) ───────────────────────────────
async function collectStormglass(spot: SurfSpot): Promise<SourceResult | null> {
  const key = process.env.STORMGLASS_API_KEY;
  if (!key) return null;
  const start = Math.floor(runAt.getTime() / 1000);
  const end = start + HORIZON_HOURS * 3600;
  const d = await getJson(`https://api.stormglass.io/v2/weather/point?lat=${spot.lat}&lng=${spot.lng}` +
    `&params=waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,gust&source=sg&start=${start}&end=${end}`,
    { headers: { Authorization: key } });
  const points = (d.hours || []).map((h: any) => clean<AuditPoint>({
    t: new Date(h.time).toISOString(),
    lead: leadOf(h.time),
    hs: round(h.waveHeight?.sg),
    tp: round(h.wavePeriod?.sg, 1),
    dir: round(h.waveDirection?.sg, 0),
    windKn: round(h.windSpeed?.sg !== undefined ? h.windSpeed.sg * KN_PER_MS : undefined, 1),
    windDir: round(h.windDirection?.sg, 0),
    gustKn: round(h.gust?.sg !== undefined ? h.gust.sg * KN_PER_MS : undefined, 1),
  })).filter((p: AuditPoint) => keep(p.t));
  return { source: 'stormglass', label: 'Stormglass', kind: 'model', points };
}

// ── Bronnen: surfsites (pagina uitlezen) ────────────────────────────────────
// Kwetsbaar: als een site zijn opbouw wijzigt, levert de bron 0 punten op (de rest
// draait gewoon door) en zie je dat in de workflow-log en de Beta-pagina.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}
const unescapeHtml = (t: string) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Windfinder (Astro-props: "fcData":[0,{"wd":[0,186.37],"ws":[0,8.68],...,"dt":[0,"2026-10-13T00:00:00Z"]}])
async function collectWindfinder(url: string, source: string, label: string): Promise<SourceResult> {
  const html = unescapeHtml(await getHtml(url));
  const points: AuditPoint[] = [];
  for (const m of html.matchAll(/"fcData":\[0,\{([^{}]*)\}\]/g)) {
    const kv: Record<string, string> = {};
    for (const f of m[1].matchAll(/"(\w+)":\[0,("?[^\],]*"?)\]/g)) kv[f[1]] = f[2].replace(/"/g, '');
    if (!kv.dt) continue;
    const t = new Date(kv.dt).toISOString();
    const num = (k: string) => (kv[k] !== undefined && kv[k] !== '' ? Number(kv[k]) : undefined);
    points.push(clean<AuditPoint>({
      t, lead: leadOf(t),
      hs: round(num('wah')), tp: round(num('wap'), 1), dir: round(num('wad'), 0),
      windKn: round(num('ws') !== undefined ? num('ws')! * KN_PER_MS : undefined, 1),
      windDir: round(num('wd'), 0),
      gustKn: round(num('wg') !== undefined ? num('wg')! * KN_PER_MS : undefined, 1),
    }));
  }
  const uniq = [...new Map(points.map(p => [p.t, p])).values()].filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS);
  return { source, label, kind: 'site', points: uniq };
}

// breakfinder.surf (data-spot-dial-payload-value: days[{date, hours[24 lokale uren]}])
async function collectBreakfinder(slug: string): Promise<SourceResult> {
  const html = await getHtml(`https://breakfinder.surf/en/surf_spots/${slug}`);
  const m = html.match(/data-spot-dial-payload-value="([^"]+)"/);
  if (!m) throw new Error('payload niet gevonden');
  const payload = JSON.parse(unescapeHtml(m[1]));
  const points: AuditPoint[] = [];
  for (const day of payload.days || []) {
    (day.hours || []).forEach((h: any, hour: number) => {
      if (!h) return;
      // Lokale tijd (Europe/Amsterdam; de workflow draait met TZ=Europe/Amsterdam).
      const [y, mo, d] = String(day.date).split('-').map(Number);
      const t = new Date(y, mo - 1, d, hour).toISOString();
      points.push(clean<AuditPoint>({
        t, lead: leadOf(t),
        hs: round(h.wave), tp: round(h.period, 1),
        windKn: round(typeof h.wind === 'number' ? h.wind * KN_PER_MS : undefined, 1),
        rating: h.score !== undefined ? String(h.score) : undefined,
        chance: typeof h.score === 'number' ? h.score : undefined,
        tide: round(h.tide),
      }));
    });
  }
  return { source: 'breakfinder', label: 'breakfinder.surf', kind: 'site',
    points: points.filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS && new Date(p.t).getUTCHours() % STEP_HOURS === 0) };
}

// sea-forecast.com (weekgrafiek: { x: moment("2026-10-11 06:00:00"), y: 0.7 }, lokale tijd, golfhoogte m)
async function collectSeaForecast(path: string): Promise<SourceResult> {
  const html = await getHtml(`https://sea-forecast.com/${path}`);
  const points: AuditPoint[] = [];
  for (const m of html.matchAll(/moment\(\\?"(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):\d{2}\\?"\),\s*y:\s*([\d.]+)/g)) {
    const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString();
    points.push({ t, lead: leadOf(t), hs: round(Number(m[6])) });
  }
  const uniq = [...new Map(points.map(p => [p.t, p])).values()].filter(p => p.lead >= -1 && p.lead <= HORIZON_HOURS);
  return { source: 'seaforecast', label: 'sea-forecast.com (golf, per 6 uur)', kind: 'site', points: uniq };
}

// ── Bron: Wompy (dagoordeel + golf/wind per dag) ──────────────────────────────
async function collectWompy(slug: string): Promise<SourceResult> {
  const html = await getHtml(`https://www.wompy.nl/spot/${slug}`);
  const points = parseWompy(html, runAt);
  return {
    source: 'wompy', label: 'Wompy (dagoordeel)', kind: 'site', points,
    note: points.length ? 'oordeel per dag (score voor de NL-kust), golf en wind per dag' : 'uitlezer vond geen dagen — pagina veranderd?',
  };
}

// ── Metingen: Rijkswaterstaat (Lichteiland Goeree e.o.) ─────────────────────
// RWS heeft twee generaties webservices; we proberen beide en loggen wat werkt.
export interface ObsPoint { t: string; hs?: number; tm02?: number; dir?: number; windKn?: number; windDir?: number; level?: number }

const RWS_VARIANTS = [
  { name: 'ddl-2025', base: 'https://ddapi20-waterwebservices.rijkswaterstaat.nl', catalog: '/METADATASERVICES/OphalenCatalogus', obs: '/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen' },
  { name: 'wws-dbo', base: 'https://waterwebservices.rijkswaterstaat.nl', catalog: '/METADATASERVICES_DBO/OphalenCatalogus', obs: '/ONLINEWAARNEMINGENSERVICES_DBO/OphalenWaarnemingen' },
];
// Grootheid-code → veld + omrekening naar onze eenheden.
const RWS_PARAMS: { code: string; field: keyof Omit<ObsPoint, 't'>; conv: (v: number, unit: string) => number }[] = [
  { code: 'Hm0', field: 'hs', conv: (v, u) => (u === 'cm' ? v / 100 : v) },
  { code: 'Tm02', field: 'tm02', conv: v => v },
  { code: 'Th0', field: 'dir', conv: v => v },
  { code: 'WINDSHD', field: 'windKn', conv: (v, u) => (u === 'km/u' ? v / 1.852 : v * KN_PER_MS) },
  { code: 'WINDRTG', field: 'windDir', conv: v => v },
  { code: 'WATHTE', field: 'level', conv: (v, u) => (u === 'cm' ? v / 100 : v) },
];

async function rwsPost(url: string, body: unknown) {
  return getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function findRwsStations(variant: typeof RWS_VARIANTS[number]) {
  const cat = await rwsPost(variant.base + variant.catalog, {
    CatalogusFilter: { Grootheden: true, Parameters: true, Compartimenten: true, Eenheden: true, Hoedanigheden: true, Groeperingen: true, ProcesTypes: true },
  });
  const locs: any[] = cat.LocatieLijst || [];
  const meta: any[] = cat.AquoMetadataLijst || [];
  const links: any[] = cat.AquoMetadataLocatieLijst || [];
  // Kandidaten in de buurt van Goeree / Haringvliet / Brouwersdam.
  const nameHit = (l: any) => /goeree|lichteiland|haringvliet|brouwers|stellendam|europlatform|schouwenbank|maasgeul/i.test(`${l.Naam} ${l.Code}`);
  const stations = locs.filter(nameHit).map(l => {
    const metaIds = links.filter(k => k.Locatie_MessageID === l.Locatie_MessageID).map(k => k.AquoMetaData_MessageID);
    const metas = meta.filter(m => metaIds.includes(m.AquoMetadata_MessageID));
    const grootheden = [...new Set(metas.map(m => m.Grootheid?.Code))];
    return { code: l.Code, naam: l.Naam, x: l.X, y: l.Y, grootheden, metas };
  });
  return stations;
}

async function fetchRwsSeries(variant: typeof RWS_VARIANTS[number], station: { code: string; x?: number; y?: number; metas?: any[] }, grootheid: string, from: Date, to: Date) {
  // Probeer eerst met de volledige metadata uit de catalogus (eenheid, hoedanigheid,
  // procestype 'meting'); valt dat leeg uit, dan de korte vorm.
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000+00:00');
  const metas = (station.metas || []).filter(m => m.Grootheid?.Code === grootheid);
  const bodies: any[] = [];
  for (const m of metas) {
    bodies.push({
      Compartiment: { Code: m.Compartiment?.Code || 'OW' },
      Grootheid: { Code: grootheid },
      ...(m.Eenheid?.Code ? { Eenheid: { Code: m.Eenheid.Code } } : {}),
      ...(m.Hoedanigheid?.Code ? { Hoedanigheid: { Code: m.Hoedanigheid.Code } } : {}),
      ...(m.Parameter?.Code ? { Parameter: { Code: m.Parameter.Code } } : {}),
      ...(m.ProcesType ? { ProcesType: m.ProcesType } : {}),
    });
  }
  // Korte vorm eerst (werkt bij de meeste posten), dan de volledige catalogusvarianten.
  bodies.unshift({ Compartiment: { Code: metas[0]?.Compartiment?.Code || 'OW' }, Grootheid: { Code: grootheid } });
  let d: any = {};
  outer: for (const aquo of bodies) {
    for (const withProces of [false]) {
      try {
        d = await rwsPost(variant.base + variant.obs, {
          Locatie: { Code: station.code, ...(station.x !== undefined ? { X: station.x, Y: station.y } : {}) },
          AquoPlusWaarnemingMetadata: { AquoMetadata: withProces ? { ...aquo, ProcesType: 'meting' } : aquo },
          Periode: { Begindatumtijd: fmt(from), Einddatumtijd: fmt(to) },
        });
        if ((d.WaarnemingenLijst || []).length) break outer;
        // leeg: probeer de volgende variant
      } catch (e: any) {
        console.log(`[RWS] ${grootheid}@${station.code}: fout met ${JSON.stringify(aquo)}${withProces ? ' +meting' : ''}: ${e.message.slice(0, 160)}`);
      }
    }
  }
  const out: { t: string; v: number; unit: string }[] = [];
  for (const w of d.WaarnemingenLijst || []) {
    const unit = w.AquoMetadata?.Eenheid?.Code || '';
    for (const m of w.MetingenLijst || []) {
      const v = m.Meetwaarde?.Waarde_Numeriek;
      // Kwaliteitscode 99 = ontbrekend/onbetrouwbaar (waarde is dan een code als 99999).
      const quality = String(m.WaarnemingMetadata?.KwaliteitswaardecodeLijst?.[0] ?? '');
      if (typeof v === 'number' && v < 9e8 && quality !== '99') out.push({ t: new Date(m.Tijdstip).toISOString(), v, unit });
    }
  }
  return out;
}

async function collectObservations(): Promise<{ variant: string; stations: string[]; days: Record<string, ObsPoint[]> } | null> {
  const to = new Date(); to.setUTCMinutes(0, 0, 0);
  // Standaard 48 u; AUDIT_OBS_HOURS (max 14 dagen) om gaten achteraf aan te vullen.
  const hours = Math.min(336, Math.max(24, Number(process.env.AUDIT_OBS_HOURS) || 48));
  const from = new Date(to.getTime() - hours * 3600e3);
  for (const variant of RWS_VARIANTS) {
    try {
      const stations = await findRwsStations(variant);
      console.log(`[RWS ${variant.name}] ${stations.length} kandidaat-stations in de buurt`);
      if (!stations.length) continue;
      // Per grootheid het dichtstbijzijnde station dat hem meet (voorkeur Lichteiland Goeree).
      // Voorkeursvolgorde: dichtst bij Ouddorp eerst; de eerste met data wint.
      // Golven: de posten vlak bij Ouddorp (lichteiland, Haringvlietmond, Brouwersdam) leveren
      // nu geen actuele data; Maasgeul 2 (20 km, open zee) is de dichtstbijzijnde werkende boei,
      // Schouwenbank (41 km) de terugval. Zie audit-raw-dump 'stations'.
      const ORDER = ['goeree.lichteiland', 'haringvlietmond', 'maasgeul.2', 'schouwenbank.1', 'schouwenbank.2', 'schouwenbank', 'europlatform', 'europlatform.3', 'brouwersdam.brouwershavensegat.2'];
      const pref = (s: any) => { const i = ORDER.indexOf(s.code); return i === -1 ? 99 : i; };
      const hourly = new Map<string, ObsPoint>();
      const used = new Set<string>();
      for (const p of RWS_PARAMS) {
        const candidates = stations.filter(s => s.grootheden.includes(p.code) && pref(s) < 99).sort((a, b) => pref(a) - pref(b));
        if (!candidates.length) { console.log(`[RWS] geen station met ${p.code}`); continue; }
        let st = candidates[0];
        try {
          let series: { t: string; v: number; unit: string }[] = [];
          for (const c of candidates) {
            series = await fetchRwsSeries(variant, c, p.code, from, to);
            st = c;
            if (series.length) break;
          }
          if (!series.length) { console.log(`[RWS] ${p.code}: geen data bij ${candidates.map(c => c.code).join(', ')}`); continue; }
          used.add(`${p.code}@${st.code}`);
          // Uurwaarde = gemiddelde van de metingen in dat uur (richtingen: vectorgemiddelde).
          const buckets = new Map<string, { v: number[]; unit: string }>();
          for (const m of series) {
            // Onmogelijke losse metingen (ontbrekend-codes zonder kwaliteitscode) niet meemiddelen.
            if (plausibleObs({ [p.field]: p.conv(m.v, m.unit) })[p.field] === undefined) continue;
            const h = m.t.slice(0, 13) + ':00:00.000Z';
            if (!buckets.has(h)) buckets.set(h, { v: [], unit: m.unit });
            buckets.get(h)!.v.push(m.v);
          }
          for (const [h, b] of buckets) {
            const isDir = p.field === 'dir' || p.field === 'windDir';
            const raw = isDir
              ? ((Math.atan2(b.v.reduce((a, x) => a + Math.sin(x * Math.PI / 180), 0), b.v.reduce((a, x) => a + Math.cos(x * Math.PI / 180), 0)) * 180 / Math.PI) + 360) % 360
              : b.v.reduce((a, x) => a + x, 0) / b.v.length;
            if (!hourly.has(h)) hourly.set(h, { t: h });
            (hourly.get(h) as any)[p.field] = round(p.conv(raw, b.unit), isDir ? 0 : 2);
          }
          console.log(`[RWS] ${p.code}@${st.code}: ${series.length} metingen (${series[0]?.unit || '?'})`);
        } catch (e: any) { console.log(`[RWS] ${p.code}@${st.code} mislukt: ${e.message}`); }
      }
      if (!hourly.size) continue;
      const days: Record<string, ObsPoint[]> = {};
      for (const p of [...hourly.values()].sort((a, b) => a.t.localeCompare(b.t))) {
        (days[p.t.slice(0, 10)] ||= []).push(clean(p));
      }
      return { variant: variant.name, stations: [...used], days };
    } catch (e: any) {
      console.log(`[RWS ${variant.name}] mislukt: ${e.message}`);
    }
  }
  return null;
}

// ── Opslaan ─────────────────────────────────────────────────────────────────
function initDb(): Firestore | null {
  if (DRY_RUN) return null;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('Ontbrekende env-var: FIREBASE_SERVICE_ACCOUNT');
  const app = initializeApp({ credential: cert(JSON.parse(sa)) });
  return getFirestore(app, DATABASE_ID);
}

async function main() {
  console.log(`Voorspellingsaudit ${runAt.toISOString()} — spots ${AUDIT_SPOTS.map(c => c.spot.name).join(', ')}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const db = initDb();

  // De workflow draait meerdere keren per dag (GitHub start geplande runs soms uren
  // te laat of slaat ze over). De eerste run van de dag legt de verwachtingen vast;
  // latere runs halen alleen bronnen op die vandaag nog ontbreken (nieuwe bron, of
  // eerder mislukt) en vullen de metingen aan, zodat de vooruitkijktijd klopt.
  const force = !!process.env.AUDIT_FORCE_FORECASTS;
  // Optioneel één spot: AUDIT_SPOT=maasvlakte (of ouddorp-p-noordweg).
  const only = process.env.AUDIT_SPOT;
  let ok = 0;
  for (const cfg of AUDIT_SPOTS.filter(c => !only || c.spot.id === only)) {
    const spot = cfg.spot;
    console.log(`\n── ${spot.name} (${spot.id}) ──`);
    const SOURCES: [string, () => Promise<SourceResult | null>][] = [
      ['nzsurf', () => collectNzSurf(spot)],
      ...MODEL_FAMILIES.map(f => [f.source, () => collectModel(f, spot)] as [string, () => Promise<SourceResult>]),
      ...(cfg.stormglass ? [['stormglass', () => collectStormglass(spot)] as [string, () => Promise<SourceResult | null>]] : []),
      ['windfinder', () => collectWindfinder(`https://www.windfinder.com/forecast/${cfg.windfinder}`, 'windfinder', 'Windfinder')],
      ['windfinder-super', () => collectWindfinder(`https://www.windfinder.com/weatherforecast/${cfg.windfinder}`, 'windfinder-super', 'Windfinder Superforecast')],
      ...(cfg.breakfinder ? [['breakfinder', () => collectBreakfinder(cfg.breakfinder!)] as [string, () => Promise<SourceResult>]] : []),
      ...(cfg.seaforecast ? [['seaforecast', () => collectSeaForecast(cfg.seaforecast!)] as [string, () => Promise<SourceResult>]] : []),
      ...(cfg.wompy ? [['wompy', () => collectWompy(cfg.wompy!)] as [string, () => Promise<SourceResult>]] : []),
    ];
    const todo: typeof SOURCES = [];
    for (const entry of SOURCES) {
      const have = !!db && !force && (await db.collection('auditForecasts').doc(`${runDate}_${entry[0]}${cfg.suffix}`).get()).exists;
      if (!have) todo.push(entry);
    }
    if (todo.length < SOURCES.length) {
      console.log(`Verwachtingen van ${runDate} staan er al voor ${SOURCES.length - todo.length} bronnen; ${todo.length ? `nu alleen nog: ${todo.map(e => e[0]).join(', ')}` : 'deze run vult alleen de metingen aan'}.`);
    }
    const results = await Promise.allSettled(todo.map(([, fn]) => fn()));
    const summary: string[] = [];
    results.forEach((r, i) => summary.push(r.status === 'rejected'
      ? `✗ ${todo[i][0]} (${String(r.reason?.message || r.reason).slice(0, 60)})`
      : r.value ? `${r.value.points.length ? '✓' : '✗'} ${r.value.source} ${r.value.points.length}` : `– ${todo[i][0]} overgeslagen`));
    // Samenvatting als melding bij de GitHub-run (zichtbaar in de Actions-weergave).
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=${spot.name}::${summary.join(' · ') || 'alles stond er al'}`);
    for (const r of results) {
      if (r.status === 'rejected') { console.log(`✗ bron mislukt: ${r.reason?.message || r.reason}`); continue; }
      const res = r.value;
      if (!res) continue;
      const sample = res.points.find(p => p.lead >= 24) || res.points[0];
      console.log(`${res.points.length ? '✓' : '✗'} ${res.source.padEnd(12)} ${String(res.points.length).padStart(3)} punten${res.note ? ` — ${res.note}` : ''}`);
      if (sample) console.log(`    voorbeeld +${sample.lead}u: ${JSON.stringify(sample)}`);
      if (!res.points.length) continue;
      ok++;
      if (db) {
        await db.collection('auditForecasts').doc(`${runDate}_${res.source}${cfg.suffix}`).set({
          runAt: runAt.toISOString(), runDate, spotId: spot.id, ...clean(res),
        });
      }
    }
  }

  const obs = await collectObservations();
  if (!obs) {
    console.log('✗ geen metingen van Rijkswaterstaat opgehaald');
  } else {
    console.log(`✓ metingen via ${obs.variant}: ${obs.stations.join(', ')}`);
    for (const [date, points] of Object.entries(obs.days)) {
      console.log(`    ${date}: ${points.length} uren, bv. ${JSON.stringify(points[Math.floor(points.length / 2)])}`);
      if (db) {
        // Samenvoegen met wat er al staat: het ophaalvenster (48 u) dekt de oudste dag maar
        // half; vervangen zou de eerdere uren van die dag wissen. Nieuwe uren gaan voor.
        const ref = db.collection('auditObservations').doc(date);
        const existing = (await ref.get()).data();
        const old = (existing?.points || []) as ObsPoint[];
        const byT = new Map(old.map(p => [p.t, p]));
        for (const p of points) byT.set(p.t, { ...byT.get(p.t), ...p });
        const merged = [...byT.values()].sort((a, b) => a.t.localeCompare(b.t));
        const stations = [...new Set([...(existing?.stations || []), ...obs.stations])];
        await ref.set({
          date, spotId: SPOT.id, source: `rws-${obs.variant}`, stations, points: merged,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        if (merged.length !== points.length) console.log(`      samengevoegd met bestaande: ${merged.length} uren`);
      }
    }
  }
  console.log(`Klaar: ${ok} bronnen opgeslagen${DRY_RUN ? ' (niet echt, dry run)' : ''}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
