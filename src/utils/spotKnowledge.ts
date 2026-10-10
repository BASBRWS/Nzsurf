import { ForecastData, SurfSpot } from '../types';

/**
 * Spotkennis: hoe een spot reageert op getij, swellrichting en demping.
 *
 * Bron: lokale kennis van goedegolven.nl/kennis (o.a. Ouddorp dood bij laagwater
 * en vlak bij pure ZW-swell; Walcheren max ~1–1,5 m; Domburg met ZW alleen bij
 * laagwater; Wijk aan Zee: lange periode ook bij laag, korte periode hoogwater).
 *
 * Alles hier is puur (geen I/O) zodat tabel, dagscore, offline AI, Gemini-prompt
 * en de agenda-monitor exact dezelfde berekening gebruiken.
 */

export type TideTrend = 'rising' | 'falling' | 'slack';

export interface TideAssessment {
  factor: number; // 0..1 (1 = ideaal getijvenster voor deze spot)
  note: string;   // korte Nederlandse uitleg
}

interface SwellSector {
  from: number; // graden (waar de swell vandaan komt), inclusief
  to: number;   // graden, inclusief (mag over 360 heen via from > to)
  exposure: number; // vervangt de berekende blootstelling (0..1)
  note: string;
}

interface AreaAnchor {
  lat: number;
  lng: number;
  radiusKm: number;
}

interface SpotProfile {
  key: string;
  label: string;          // naam van het gebied (getoond in app en AI)
  anchors: AreaAnchor[];  // gebied: elke spot binnen een anker erft deze kennis
  keywords: string[];     // terugval op naam als coördinaten niet matchen
  damping: number;      // fractie van de modelgolfhoogte die de break bereikt
  maxSpotWave?: number; // plafond (m) op de spot, ongeacht de zee
  swellSectors?: SwellSector[];
  tide: (level: number, trend: TideTrend, period: number, swellDeg: number) => TideAssessment;
}

// ── Kompas ─────────────────────────────────────────────────────────────────

const COMPASS_16: Record<string, number> = {
  N: 0, NNO: 22.5, NO: 45, ONO: 67.5, O: 90, OZO: 112.5, ZO: 135, ZZO: 157.5,
  Z: 180, ZZW: 202.5, ZW: 225, WZW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  // Engelse varianten (voor door gebruikers aangemaakte spots)
  NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
};

const COMPASS_LABELS_16 = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];

export function compassToDegrees(label: string): number | undefined {
  return COMPASS_16[(label || '').trim().toUpperCase()];
}

export function degreesToCompass16(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return COMPASS_LABELS_16[Math.round(norm / 22.5) % 16];
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function inSector(deg: number, from: number, to: number): boolean {
  const n = ((deg % 360) + 360) % 360;
  return from <= to ? n >= from && n <= to : n >= from || n <= to;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

// ── Getijvensters per spot ─────────────────────────────────────────────────
// level: 0 = laagwater, 1 = hoogwater (genormaliseerd binnen de lokale getijslag)

const tideDefaultNorthSea = (level: number): TideAssessment => {
  if (level < 0.2) return { factor: 0.8, note: 'Rond laagwater: golven breken verder uit en kunnen snel dichtklappen.' };
  if (level > 0.85) return { factor: 0.85, note: 'Rond hoogwater: golven kunnen voller worden en dichter op het strand breken.' };
  return { factor: 1.0, note: 'Mid-tide: doorgaans het meest betrouwbare getijvenster.' };
};

const tideAtlantic = (level: number): TideAssessment => {
  if (level >= 0.85) return { factor: 0.5, note: 'Volle vloed: te diep boven de zandbanken, volle golven en harde shorebreak.' };
  if (level < 0.15) return { factor: 0.7, note: 'Rond laagwater: snelle, holle dichtklappers op het ondiepe zand; let op baïnes.' };
  return { factor: 1.0, note: 'Mid-tide: de Atlantische swell breekt het mooist op de zandbanken.' };
};

// Gebiedskennis. Een (nieuw aangemaakte) spot binnen een gebied erft de kennis
// van dat gebied. Bronnen: goedegolven.nl/kennis (leidend bij tegenspraak) en
// surfnerd.com (spotlijst, pieren/banken die swell afschermen, getijvoorkeur).
const PROFILES: SpotProfile[] = [
  {
    key: 'ouddorp',
    label: 'Ouddorp (Goeree)',
    anchors: [{ lat: 51.825, lng: 3.887, radiusKm: 8 }],
    keywords: ['ouddorp', 'goeree', 'kwade hoek', 'westhoofd'],
    damping: 0.9,
    swellSectors: [
      { from: 190, to: 250, exposure: 0.15, note: 'Pure (Z)ZW-swell loopt langs Ouddorp; de spot ligt hiervoor beschut achter de Zeeuwse banken en blijft vrijwel vlak.' },
      { from: 330, to: 30, exposure: 1.0, note: 'N/NW-swell geeft hier de schoonste lijnen.' },
    ],
    tide: (level, trend) => {
      if (level < 0.25) return { factor: 0.2, note: 'Laagwater: de Oostergronden liggen te ondiep, Ouddorp is dan vrijwel dood. Kom terug vanaf mid-tide opkomend.' };
      if (level < 0.45) return trend === 'rising'
        ? { factor: 0.65, note: 'Opkomend water richting mid-tide: de banken gaan werken. Let op de sterke vloedstroom.' }
        : { factor: 0.5, note: 'Afgaand richting laagwater: de spot loopt leeg en wordt snel minder.' };
      if (level >= 0.8) return trend === 'falling'
        ? { factor: 1.0, note: 'Net na hoogwater: het beste moment op Ouddorp (tot ca. 1,5 uur na hoogwater).' }
        : { factor: 0.9, note: 'Richting hoogwater: goed venster op Ouddorp; het beste volgt net na de kentering.' };
      return { factor: 0.9, note: 'Mid- tot hoogwater: Ouddorp werkt in dit venster.' };
    },
  },
  {
    key: 'domburg',
    label: 'Domburg (Walcheren)',
    anchors: [{ lat: 51.565, lng: 3.497, radiusKm: 3.5 }],
    keywords: ['domburg', 'oostkapelle'],
    damping: 0.85,
    maxSpotWave: 1.5,
    swellSectors: [
      { from: 200, to: 260, exposure: 0.55, note: 'ZW-swell komt om Walcheren heen; werkt alleen rond laagwater.' },
    ],
    tide: (level, _trend, _period, swellDeg) => {
      const isSW = inSector(swellDeg, 200, 260);
      if (isSW) {
        if (level < 0.35) return { factor: 1.0, note: 'ZW-swell + laagwater: het venster waarin Domburg met ZW werkt.' };
        if (level < 0.6) return { factor: 0.6, note: 'ZW-swell bij mid-tide: wordt snel minder; laagwater is beter.' };
        return { factor: 0.3, note: 'ZW-swell bij hoogwater: Domburg werkt dan nauwelijks; mik op laagwater.' };
      }
      if (level >= 0.6) return { factor: 1.0, note: 'Rond hoogwater: Walcheren werkt het best.' };
      if (level >= 0.3) return { factor: 0.8, note: 'Mid-tide: redelijk; rond hoogwater is beter.' };
      return { factor: 0.55, note: 'Laagwater met NW-swell: minder goed op Walcheren; wacht op opkomend water.' };
    },
  },
  {
    key: 'walcheren',
    label: 'Walcheren (Westkapelle–Vlissingen)',
    anchors: [
      { lat: 51.53, lng: 3.44, radiusKm: 5 },  // Westkapelle
      { lat: 51.50, lng: 3.48, radiusKm: 4 },  // Zoutelande
      { lat: 51.46, lng: 3.55, radiusKm: 6 },  // Dishoek / Vlissingen
    ],
    keywords: ['westkapelle', 'vlissingen', 'zoutelande', 'dishoek', 'walcheren'],
    damping: 0.8,
    maxSpotWave: 1.5,
    tide: (level) => {
      if (level >= 0.6) return { factor: 1.0, note: 'Rond hoogwater: Walcheren werkt het best (max. ~1–1,5 m, ook als het op zee veel groter is).' };
      if (level >= 0.3) return { factor: 0.8, note: 'Mid-tide: redelijk; rond hoogwater is beter.' };
      return { factor: 0.55, note: 'Laagwater: minder goed op Walcheren.' };
    },
  },
  {
    key: 'schouwen',
    label: 'Schouwen-Duiveland / Neeltje Jans',
    anchors: [
      { lat: 51.71, lng: 3.75, radiusKm: 9 }, // Westenschouwen / Renesse
      { lat: 51.63, lng: 3.69, radiusKm: 5 }, // Neeltje Jans / Banjaard
    ],
    keywords: ['schouwen', 'renesse', 'westenschouwen', 'haamstede', 'neeltje jans', 'banjaard', 'brouwersdam'],
    damping: 0.8, // banken voor de kust houden een deel van de swell tegen
    tide: (level) => {
      if (level >= 0.6) return { factor: 1.0, note: 'Rond hoogwater: het beste venster; door de banken voor de kust vaak kleiner dan elders.' };
      if (level >= 0.3) return { factor: 0.8, note: 'Mid-tide: redelijk; hoogwater is beter.' };
      return { factor: 0.55, note: 'Laagwater: de banken houden veel swell tegen.' };
    },
  },
  {
    key: 'maasvlakte',
    label: 'Maasvlakte',
    anchors: [{ lat: 51.97, lng: 4.0, radiusKm: 6 }],
    keywords: ['maasvlakte'],
    damping: 1.0, // pakt veel meer swell dan Walcheren (ca. 1,5–2×)
    tide: (level) => tideDefaultNorthSea(level),
  },
  {
    key: 'hoek-van-holland',
    label: 'Hoek van Holland',
    anchors: [{ lat: 51.985, lng: 4.12, radiusKm: 3 }],
    keywords: ['hoek van holland', 'hvh'],
    damping: 0.95,
    swellSectors: [
      { from: 190, to: 250, exposure: 0.3, note: 'De lange pier schermt ZW-swell af; Hoek van Holland heeft NW-swell nodig.' },
    ],
    tide: (level) => {
      if (level >= 0.6) return { factor: 1.0, note: 'Rond hoogwater: het beste venster bij de pier.' };
      if (level >= 0.3) return { factor: 0.85, note: 'Mid-tide: redelijk; hoogwater is beter.' };
      return { factor: 0.65, note: 'Laagwater: minder goed bij de pier.' };
    },
  },
  {
    key: 'delfland',
    label: 'Delflandse kust (Vlughtenburg–Kijkduin)',
    anchors: [
      { lat: 52.01, lng: 4.13, radiusKm: 3 },  // Vlughtenburg / 's-Gravenzande
      { lat: 52.035, lng: 4.16, radiusKm: 3 }, // Ter Heijde
      { lat: 52.07, lng: 4.215, radiusKm: 3 }, // Kijkduin
    ],
    keywords: ['ter heijde', 'vlughtenburg', 'gravenzande', 'kijkduin', 'monster'],
    damping: 1.0,
    tide: (level) => {
      if (level > 0.85) return { factor: 0.8, note: 'Rond hoogwater: voller; laag tot mid-tide werkt hier beter.' };
      if (level < 0.6) return { factor: 1.0, note: 'Laag tot mid-tide: het voorkeursvenster op deze kust.' };
      return { factor: 0.9, note: 'Mid- tot hoogwater: werkt, maar laag tot mid is vaak beter.' };
    },
  },
  {
    key: 'scheveningen',
    label: 'Scheveningen',
    anchors: [{ lat: 52.11, lng: 4.27, radiusKm: 4 }],
    keywords: ['scheveningen'],
    damping: 0.95,
    tide: (level) => {
      if (level < 0.25) return { factor: 0.7, note: 'Rond laagwater: golven breken ver uit en klappen snel dicht.' };
      if (level >= 0.6) return { factor: 1.0, note: 'Mid- tot hoogwater (opkomend): het beste venster bij de pieren.' };
      return { factor: 0.9, note: 'Mid-tide: goed; richting hoogwater is vaak nog beter.' };
    },
  },
  {
    key: 'wijk-aan-zee',
    label: 'Wijk aan Zee / IJmuiden',
    anchors: [{ lat: 52.49, lng: 4.58, radiusKm: 6 }],
    keywords: ['wijk-aan-zee', 'wijk aan zee', 'ijmuiden'],
    damping: 1.0,
    tide: (level, _trend, period) => {
      if (period >= 8) {
        if (level < 0.3) return { factor: 0.95, note: `Lange periode (${period}s): ook bij laagwater breken de buitenbanken goed.` };
        if (level > 0.85) return { factor: 0.85, note: `Lange periode (${period}s) bij hoogwater: werkt, maar iets voller.` };
        return { factor: 1.0, note: `Lange periode (${period}s): werkt op elk getij.` };
      }
      if (level >= 0.6) return { factor: 1.0, note: `Korte periode (${period}s): hoogwater is hier het beste.` };
      if (level >= 0.3) return { factor: 0.8, note: `Korte periode (${period}s) bij mid-tide: redelijk; hoogwater is beter.` };
      return { factor: 0.55, note: `Korte periode (${period}s) bij laagwater: slap en rommelig; wacht op hoogwater.` };
    },
  },
  {
    key: 'holland-noord',
    label: 'Hollandse kust (Noordwijk–Den Helder)',
    anchors: [
      { lat: 52.21, lng: 4.40, radiusKm: 9 },  // Katwijk / Noordwijk
      { lat: 52.38, lng: 4.53, radiusKm: 9 },  // Zandvoort / Bloemendaal
      { lat: 52.62, lng: 4.62, radiusKm: 12 }, // Castricum / Egmond / Bergen
      { lat: 52.82, lng: 4.67, radiusKm: 12 }, // Petten / Callantsoog / Den Helder
    ],
    keywords: ['noordwijk', 'katwijk', 'zandvoort', 'bloemendaal', 'castricum', 'egmond', 'bergen aan zee', 'schoorl', 'petten', 'callantsoog', 'den helder'],
    damping: 1.0,
    tide: (level) => {
      if (level < 0.2) return { factor: 0.8, note: 'Rond laagwater: golven breken verder uit en klappen sneller dicht.' };
      if (level >= 0.4) return { factor: 1.0, note: 'Mid- tot hoogwater: het beste venster op deze kust (W/NW-swell, O-wind).' };
      return { factor: 0.9, note: 'Opkomend richting mid-tide: wordt beter.' };
    },
  },
  {
    key: 'wadden',
    label: 'Waddeneilanden',
    anchors: [
      { lat: 53.08, lng: 4.75, radiusKm: 15 }, // Texel (Paal 17, De Koog)
      { lat: 53.30, lng: 5.05, radiusKm: 12 }, // Vlieland
      { lat: 53.42, lng: 5.40, radiusKm: 15 }, // Terschelling
      { lat: 53.46, lng: 5.75, radiusKm: 14 }, // Ameland
      { lat: 53.49, lng: 6.20, radiusKm: 12 }, // Schiermonnikoog
    ],
    keywords: ['texel', 'de koog', 'paal 17', 'vlieland', 'terschelling', 'ameland', 'schiermonnikoog'],
    damping: 1.0, // open ligging, pakt vaak iets meer swell
    tide: (level) => tideDefaultNorthSea(level),
  },
];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, D2R = Math.PI / 180;
  const dLat = (lat2 - lat1) * D2R, dLng = (lng2 - lng1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Zoekt het gebied van een spot. Eerst op coördinaten (dichtstbijzijnde anker,
 * relatief t.o.v. de straal), daarna op naam. Zo erft elke nieuw aangemaakte
 * spot in een bekend gebied automatisch de kennis van dat gebied.
 */
function findProfile(spot: SurfSpot): SpotProfile | undefined {
  if (typeof spot.lat === 'number' && typeof spot.lng === 'number') {
    let best: { p: SpotProfile; ratio: number } | undefined;
    for (const p of PROFILES) {
      for (const a of p.anchors) {
        const ratio = distanceKm(spot.lat, spot.lng, a.lat, a.lng) / a.radiusKm;
        if (ratio <= 1 && (!best || ratio < best.ratio)) best = { p, ratio };
      }
    }
    if (best) return best.p;
  }
  const text = `${spot.id || ''} ${spot.name || ''}`.toLowerCase();
  return PROFILES.find(p => p.keywords.some(k => text.includes(k)));
}

/** Naam van het gebied waarvan de spot de kennis erft (of undefined = algemeen). */
export function spotKnowledgeArea(spot: SurfSpot): string | undefined {
  return findProfile(spot)?.label ?? (isAtlanticCoast(spot) ? 'Atlantische kust (algemeen)' : undefined);
}

/**
 * Atlantische kust op basis van de vlag óf de coördinaten (Golf van Biskaje,
 * Iberisch schiereiland, Marokko, west-Ierland/-Engeland). Zo worden ook nieuw
 * aangemaakte spots in Frankrijk/Portugal goed behandeld.
 */
export function isAtlanticCoast(spot: SurfSpot): boolean {
  if (typeof spot.isAtlantic === 'boolean') return spot.isAtlantic;
  const { lat, lng } = spot;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (lat >= 27 && lat < 49 && lng < -0.5 && lng > -20) return true; // Biskaje, Iberië, Marokko
  if (lat >= 49 && lat < 60 && lng < -4 && lng > -20) return true;   // Cornwall, Wales-west, Ierland
  return false;
}

/** Vult afgeleide spotvelden aan (bijv. isAtlantic) voor zelf aangemaakte spots. */
export function withAreaDefaults(spot: SurfSpot): SurfSpot {
  if (typeof spot.isAtlantic === 'boolean') return spot;
  return isAtlanticCoast(spot) ? { ...spot, isAtlantic: true } : spot;
}

// ── Swellrichting ──────────────────────────────────────────────────────────

/**
 * Blootstelling (0..1) van de spot aan swell uit `swellDeg`.
 * Combineert de kustoriëntatie, de opgegeven beste swellrichtingen (16-punts,
 * dus 'WNW' telt nu wél mee) en spotspecifieke sectoren.
 */
export function swellExposure(spot: SurfSpot, swellDeg: number): { exposure: number; note?: string } {
  const profile = findProfile(spot);
  const sector = profile?.swellSectors?.find(s => inSector(swellDeg, s.from, s.to));
  if (sector) return { exposure: sector.exposure, note: sector.note };

  // Hoek tussen swell-herkomst en de richting waarin het strand kijkt.
  const facing = typeof spot.coastlineAngle === 'number' ? spot.coastlineAngle : 300;
  const d = angleDiff(swellDeg, facing);
  let exposure: number;
  if (d <= 45) exposure = 1.0;
  else if (d <= 90) exposure = lerp(1.0, 0.35, (d - 45) / 45);
  else exposure = 0.1; // swell loopt van de kust af / langs de kust

  // Beste swellrichtingen van de spot: binnen 22,5° = volle match, anders lichte aftrek.
  const best = (spot.bestSwell || []).map(compassToDegrees).filter((v): v is number => v !== undefined);
  if (best.length > 0) {
    const nearest = Math.min(...best.map(b => angleDiff(swellDeg, b)));
    if (nearest > 22.5) exposure *= nearest > 67.5 ? 0.7 : 0.85;
  }

  const rounded = Math.round(clamp(exposure, 0.05, 1) * 100) / 100;
  let note: string | undefined;
  if (rounded < 0.4) note = `Swell uit ${degreesToCompass16(swellDeg)} staat ongunstig op de kust van ${spot.name}; er komt weinig van aan.`;
  else if (rounded < 0.75) note = `Swell uit ${degreesToCompass16(swellDeg)} komt schuin binnen; een deel van de hoogte gaat verloren.`;
  return { exposure: rounded, note };
}

/**
 * Verwachte golfhoogte op de spot: modelhoogte × demping × blootstelling,
 * begrensd door het plafond van de spot (bijv. Walcheren ~1,5 m).
 * Bij een handmatige kalibratie (spot.correction.waveMultiplier) is de demping
 * daar al in verwerkt en passen we die niet nog eens toe.
 */
export function spotWaveHeight(spot: SurfSpot, modelWave: number, exposure: number): number {
  const profile = findProfile(spot);
  const damping = spot.correction?.waveMultiplier ? 1 : (profile?.damping ?? 1);
  let h = modelWave * damping * Math.max(0.15, exposure);
  if (profile?.maxSpotWave !== undefined) h = Math.min(h, profile.maxSpotWave);
  return Math.round(h * 100) / 100;
}

// ── Getij ──────────────────────────────────────────────────────────────────

export function assessTide(spot: SurfSpot, level: number | undefined, trend: TideTrend | undefined, period: number, swellDeg: number): TideAssessment {
  if (level === undefined || isNaN(level)) return { factor: 1, note: 'Geen getijdata beschikbaar.' };
  const lv = clamp(level, 0, 1);
  const profile = findProfile(spot);
  if (profile) return profile.tide(lv, trend || 'slack', Math.round(period), swellDeg);
  return isAtlanticCoast(spot) ? tideAtlantic(lv) : tideDefaultNorthSea(lv);
}

export function tideLevelLabel(level: number | undefined, trend?: TideTrend): string {
  if (level === undefined) return 'onbekend';
  const phase = level < 0.2 ? 'laagwater' : level > 0.8 ? 'hoogwater' : 'mid-tide';
  const dir = trend === 'rising' ? ', opkomend' : trend === 'falling' ? ', afgaand' : '';
  return `${phase}${dir}`;
}

// ── Kans ───────────────────────────────────────────────────────────────────

export interface SurfChance {
  chance: number; // 0..100: kans dat de spot op dit moment surfbaar werkt
  spotWave: number;
  exposure: number;
  tide: TideAssessment;
  reasons: string[];
}

function sizeFactor(h: number): number {
  if (h < 0.3) return 0.05;
  if (h < 0.5) return lerp(0.3, 0.75, (h - 0.3) / 0.2);
  if (h < 0.7) return lerp(0.75, 1.0, (h - 0.5) / 0.2);
  if (h <= 2.0) return 1.0;
  if (h <= 3.0) return lerp(1.0, 0.5, h - 2.0);
  return 0.3;
}

function periodFactor(p: number): number {
  if (p <= 4) return 0.6;
  if (p < 6) return 0.75;
  if (p < 8) return 0.9;
  return 1.0; // lange periode = kwaliteit, geen gevaar
}

/**
 * "Kans" = combinatie van effectieve spothoogte (incl. swellrichting en demping),
 * periode, wind en het getijvenster van de spot. Eén definitie voor tabel, dagscore,
 * offline AI en Gemini.
 */
export function computeSurfChance(spot: SurfSpot, f: ForecastData): SurfChance {
  const exp = f.swellExposure !== undefined ? { exposure: f.swellExposure } : swellExposure(spot, f.swellDirection);
  const spotWave = f.spotWaveHeight ?? spotWaveHeight(spot, f.waveHeight, exp.exposure);
  const tide = f.tideFactor !== undefined
    ? { factor: f.tideFactor, note: f.tideNote || '' }
    : assessTide(spot, f.tideLevel, f.tideTrend, f.swellPeriod, f.swellDirection);
  const windQ = typeof f.windQuality === 'number' ? f.windQuality : 50;
  const windFactor = 0.35 + 0.65 * (windQ / 100);

  const sf = sizeFactor(spotWave);
  const pf = periodFactor(f.swellPeriod);
  const chance = Math.round(clamp(100 * sf * pf * windFactor * tide.factor, 0, 100));

  const reasons: string[] = [];
  if (spotWave < 0.3) reasons.push(`te klein op de spot (~${spotWave.toFixed(1)} m)`);
  if (exp.exposure < 0.5) reasons.push('ongunstige swellrichting');
  if (tide.factor < 0.6) reasons.push('ongunstig getij');
  if (windFactor < 0.6) reasons.push('ongunstige wind');
  if (pf < 0.8) reasons.push('korte periode');
  return { chance, spotWave, exposure: exp.exposure, tide, reasons };
}

/**
 * Plafond voor een score (1–10) op basis van de kans: werkt de spot niet
 * (verkeerd getij, verkeerde swellrichting, harde aanlandige wind), dan kan
 * de score niet hoog zijn. 100% → 10, 50% → 6, 20% → 3,6.
 */
export function chanceScoreCap(chance: number | undefined): number {
  if (chance === undefined || isNaN(chance)) return 10;
  return Math.round((2 + clamp(chance, 0, 100) * 0.08) * 10) / 10;
}

/** Score-correctie (in punten op de 1–10 schaal) voor het getijvenster. */
export function tideScoreAdjustment(tideFactor: number | undefined): number {
  if (tideFactor === undefined) return 0;
  return Math.round((tideFactor - 0.85) * 4 * 10) / 10; // 0.2 → −2.6, 1.0 → +0.6
}

// ── Getijkenteringen uit een uurreeks ──────────────────────────────────────

export interface TideTurnPoint {
  time: string; // HH:mm (lokale tijd van de spot)
  isHigh: boolean;
  height: number;
}

/**
 * Vindt hoog- en laagwater in een uurreeks (lokale tijdstrings 'YYYY-MM-DDTHH:mm')
 * en groepeert ze per dag. Parabolische interpolatie voor een nauwkeuriger tijdstip.
 */
export function findTideTurnsByDay(times: string[], heights: number[]): Map<string, TideTurnPoint[]> {
  const raw: { ms: number; date: string; time: string; isHigh: boolean; height: number }[] = [];
  for (let j = 1; j < heights.length - 1; j++) {
    const a = heights[j - 1], b = heights[j], c = heights[j + 1];
    const isHigh = b >= a && b > c;
    const isLow = b <= a && b < c;
    if (!isHigh && !isLow) continue;
    const denom = a - 2 * b + c;
    const off = denom !== 0 ? clamp(0.5 * (a - c) / denom, -0.5, 0.5) : 0;
    const height = b - 0.25 * (a - c) * off;
    const baseMs = Date.parse(`${times[j]}:00Z`); // als UTC behandelen: alleen voor rekenen
    const ms = baseMs + off * 3600000;
    const d = new Date(ms);
    raw.push({
      ms,
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
      isHigh,
      height: Math.round(height * 100) / 100,
    });
  }

  // Ruis (opzet, afgevlakte toppen) eruit: afwisselend hoog/laag en ≥ 0,15 m verschil.
  const turns: typeof raw = [];
  for (const t of raw) {
    const prev = turns[turns.length - 1];
    if (prev && prev.isHigh === t.isHigh) {
      if ((t.isHigh && t.height > prev.height) || (!t.isHigh && t.height < prev.height)) turns[turns.length - 1] = t;
      continue;
    }
    if (prev && Math.abs(t.height - prev.height) < 0.15) continue;
    turns.push(t);
  }

  const byDay = new Map<string, TideTurnPoint[]>();
  for (const t of turns) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date)!.push({ time: t.time, isHigh: t.isHigh, height: t.height });
  }
  return byDay;
}
