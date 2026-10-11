import { SurfSpot } from '../types';

/**
 * Catalogus van bekende Nederlandse surfspots.
 *
 * - Elke spot heeft een eigen, door Google vindbare pagina:
 *   /surfverwachting/<slug>/ (server-side opgebouwd in src/seo/spotPage.ts).
 * - In de app staan ze NIET standaard in een profiel: een gebruiker kan ze
 *   overnemen via "Toevoegen aan mijn spots" (spotsscherm of de spotpagina).
 * - De vier standaardspots (DEFAULT_SPOTS) staan er ook in, met hun bestaande id.
 *
 * coastlineAngle = de richting waarin het strand kijkt (zee-kant). Golf-, getij-
 * en dempingskennis per gebied komt uit utils/spotKnowledge.ts (op coördinaten).
 */

export type SpotRegion = 'Zeeland' | 'Zuid-Holland' | 'Noord-Holland' | 'Waddeneilanden';

export interface CatalogSpot extends SurfSpot {
  slug: string;
  place: string;          // korte plaatsnaam voor koppen ("Zandvoort")
  region: SpotRegion;
  description: string;    // 2–3 zinnen: ligging en karakter
  tideText: string;       // wanneer het getij meewerkt
  blog?: string;          // pad naar een uitgebreide gids, als die er is
}

const beach = (s: Omit<CatalogSpot, 'type' | 'id'> & { id?: string }): CatalogSpot => ({
  type: 'beachbreak',
  id: s.id || s.slug,
  ...s,
});

export const SPOT_CATALOG: CatalogSpot[] = [
  // ── Zeeland ────────────────────────────────────────────────────────────────
  beach({
    slug: 'cadzand', place: 'Cadzand', name: 'Cadzand-Bad', region: 'Zeeland',
    lat: 51.377, lng: 3.383, coastlineAngle: 320,
    bestWind: ['ZO', 'Z', 'O'], bestSwell: ['NW', 'NNW', 'N'],
    description: 'Strand bij Cadzand-Bad in Zeeuws-Vlaanderen, met strandhoofden die de kust in vakken verdelen. De spot ligt vrij beschut achter de banken voor de Westerschelde en heeft een flinke noordwestswell nodig voordat er iets aankomt.',
    tideText: 'Mid-tide tot hoogwater werkt meestal het best; rond laagwater breken de golven ver uit.',
  }),
  beach({
    slug: 'zoutelande', place: 'Zoutelande', name: 'Zoutelande', region: 'Zeeland',
    lat: 51.502, lng: 3.474, coastlineAngle: 235,
    bestWind: ['NO', 'O', 'N'], bestSwell: ['ZW', 'WZW', 'W'],
    description: 'Het strand van Zoutelande op Walcheren ligt op het zuidwesten. Daardoor is het een van de weinige Nederlandse stranden die juist met zuidwestswell werken, op dagen dat de kust ten noorden ervan vlak is.',
    tideText: 'Rond hoogwater werkt Walcheren het best (meestal tot ca. 1–1,5 m); laagwater is minder.',
  }),
  beach({
    slug: 'westkapelle', place: 'Westkapelle', name: 'Westkapelle', region: 'Zeeland',
    lat: 51.533, lng: 3.438, coastlineAngle: 270,
    bestWind: ['O', 'NO', 'ZO'], bestSwell: ['W', 'WNW', 'NW', 'WZW'],
    description: 'Westkapelle ligt op de westpunt van Walcheren, rond de zeedijk. Door die ligging op de kop van het eiland staat de spot open voor swell uit het westen; let op de stroming langs de kop en de strekdammen.',
    tideText: 'Rond hoogwater werkt Walcheren het best (meestal tot ca. 1–1,5 m); laagwater is minder.',
  }),
  beach({
    id: 'domburg', slug: 'domburg', place: 'Domburg', name: 'Domburg', region: 'Zeeland',
    lat: 51.56, lng: 3.49, coastlineAngle: 320,
    bestWind: ['ZO', 'Z'], bestSwell: ['NW', 'N'],
    description: 'Domburg is de bekendste surfspot van Walcheren: een breed strand met strandhoofden en een levendige surfscene. Met noordwestswell en zuidoostenwind staan hier op goede dagen nette lijnen.',
    tideText: 'Met NW-swell rond hoogwater; met ZW-swell werkt Domburg alleen rond laagwater. Meestal maximaal ca. 1,5 m.',
  }),
  beach({
    slug: 'renesse', place: 'Renesse', name: 'Renesse', region: 'Zeeland',
    lat: 51.738, lng: 3.762, coastlineAngle: 315,
    bestWind: ['ZO', 'O', 'Z'], bestSwell: ['NW', 'NNW', 'N'],
    description: 'Lang zandstrand op Schouwen-Duiveland, op het noordwesten. De banken voor de kust houden een deel van de swell tegen, waardoor het hier vaak kleiner is dan op de Hollandse kust: vriendelijk voor beginners.',
    tideText: 'Rond hoogwater het beste venster; bij laagwater houden de banken veel swell tegen.',
  }),
  beach({
    slug: 'brouwersdam', place: 'Brouwersdam', name: 'Brouwersdam (zeezijde)', region: 'Zeeland',
    lat: 51.762, lng: 3.835, coastlineAngle: 315,
    bestWind: ['ZO', 'O', 'Z'], bestSwell: ['NW', 'NNW', 'N'],
    description: 'De zeezijde van de Brouwersdam, tussen Schouwen-Duiveland en Goeree. Vooral bekend als kite- en windsurfspot; met noordwestswell en weinig wind is er ook te golfsurfen. Houd afstand van kitelijnen.',
    tideText: 'Rond hoogwater het beste venster; door de banken voor de kust vaak kleiner dan elders.',
  }),

  // ── Zuid-Holland ───────────────────────────────────────────────────────────
  beach({
    id: 'ouddorp-p-noordweg', slug: 'ouddorp', place: 'Ouddorp', name: 'Ouddorp (P Noordweg)', region: 'Zuid-Holland',
    lat: 51.8253, lng: 3.8874, coastlineAngle: 300, tideStation: 'Ouddorp', bathymetryProfile: 'sandbanks',
    bestWind: ['ZO', 'O', 'Z'], bestSwell: ['NW', 'WNW', 'W', 'N'],
    description: 'Ouddorp, op de kop van Goeree-Overflakkee, is een lang zandstrand met uitgestrekte zandbanken voor de kust. Op de goede momenten verrassend schone lijnen, maar een spot die je moet begrijpen: getij en swellrichting bepalen alles.',
    tideText: 'Van mid-tide tot hoogwater; het beste net na hoogwater. Rond laagwater is Ouddorp vrijwel dood.',
    blog: '/blog/surfen-in-ouddorp/',
  }),
  beach({
    slug: 'maasvlakte', place: 'Maasvlakte', name: 'Maasvlakte (P6)', region: 'Zuid-Holland',
    lat: 51.965, lng: 4.01, coastlineAngle: 300,
    bestWind: ['ZO', 'O', 'Z'], bestSwell: ['NW', 'NNW', 'N'],
    description: 'De Maasvlakte steekt ver de Noordzee in en pakt veel meer swell dan de Zeeuwse stranden. Een uitwijkspot voor dagen dat het elders te klein is, maar met bijna altijd stevige stroming.',
    tideText: 'Werkt op alle getijden; het getij bepaalt vooral hoe hard de stroming staat.',
    blog: '/blog/surfen-maasvlakte-p6/',
  }),
  beach({
    slug: 'hoek-van-holland', place: 'Hoek van Holland', name: 'Hoek van Holland', region: 'Zuid-Holland',
    lat: 51.988, lng: 4.118, coastlineAngle: 305,
    bestWind: ['ZO', 'O', 'NO'], bestSwell: ['NW', 'WNW', 'NNW'],
    description: 'Strand ten noorden van de lange pier bij de monding van de Nieuwe Waterweg. De pier schermt zuidwestswell af, dus Hoek van Holland heeft swell uit het noordwesten nodig.',
    tideText: 'Rond hoogwater het beste venster bij de pier; laagwater is minder.',
  }),
  beach({
    slug: 'ter-heijde', place: 'Ter Heijde', name: 'Ter Heijde', region: 'Zuid-Holland',
    lat: 52.035, lng: 4.158, coastlineAngle: 305,
    bestWind: ['ZO', 'O', 'NO'], bestSwell: ['NW', 'WNW', 'W'],
    description: 'Rustig strand aan de Delflandse kust tussen Hoek van Holland en Kijkduin. Open beachbreak die een goed alternatief is als het in Scheveningen druk is.',
    tideText: 'Laag tot mid-tide is hier vaak het beste; rond hoogwater voller.',
  }),
  beach({
    slug: 'kijkduin', place: 'Kijkduin', name: 'Kijkduin', region: 'Zuid-Holland',
    lat: 52.07, lng: 4.215, coastlineAngle: 305,
    bestWind: ['ZO', 'O', 'NO'], bestSwell: ['NW', 'WNW', 'W'],
    description: 'Strand van Den Haag-Kijkduin, ten zuiden van Scheveningen. Open beachbreak die dezelfde swell pakt als Scheveningen, meestal met minder drukte.',
    tideText: 'Laag tot mid-tide is hier vaak het beste; rond hoogwater voller.',
  }),
  beach({
    slug: 'scheveningen-zuiderstrand', place: 'Scheveningen', name: 'Scheveningen (Zuiderstrand)', region: 'Zuid-Holland',
    lat: 52.093, lng: 4.252, coastlineAngle: 305,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['NW', 'WNW'],
    description: 'Het strand ten zuiden van de haven van Scheveningen. De havenhoofden geven bij sommige windrichtingen wat beschutting; een bekende uitwijk als het bij de pier te druk of te rommelig is.',
    tideText: 'Mid- tot hoogwater (opkomend) is meestal het beste; rond laagwater klapt het snel dicht.',
  }),
  beach({
    id: 'scheveningen', slug: 'scheveningen', place: 'Scheveningen', name: 'Scheveningen (Noord)', region: 'Zuid-Holland',
    lat: 52.11, lng: 4.27, coastlineAngle: 305, bathymetryProfile: 'gentle_slope',
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['NW', 'WNW'],
    description: 'Scheveningen is de bekendste surfspot van Nederland, met de pier, surfscholen en surfclubs op het strand. Met noordwestswell en oostenwind staan hier de beste dagen; reken op drukte in het water.',
    tideText: 'Mid- tot hoogwater (opkomend) is meestal het beste; rond laagwater klapt het snel dicht.',
  }),
  beach({
    slug: 'katwijk', place: 'Katwijk', name: 'Katwijk', region: 'Zuid-Holland',
    lat: 52.205, lng: 4.395, coastlineAngle: 300,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['NW', 'WNW', 'W'],
    description: 'Breed strand bij Katwijk aan Zee met een open beachbreak. Pakt dezelfde swell als Noordwijk en Scheveningen en is meestal rustiger in het water.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'noordwijk', place: 'Noordwijk', name: 'Noordwijk', region: 'Zuid-Holland',
    lat: 52.245, lng: 4.425, coastlineAngle: 300,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['NW', 'WNW', 'W'],
    description: 'Noordwijk aan Zee heeft een lang, open strand met surfscholen en strandpaviljoens. Een betrouwbare beachbreak bij westelijke tot noordwestelijke swell met aflandige oostenwind.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),

  // ── Noord-Holland ──────────────────────────────────────────────────────────
  beach({
    slug: 'zandvoort', place: 'Zandvoort', name: 'Zandvoort', region: 'Noord-Holland',
    lat: 52.375, lng: 4.526, coastlineAngle: 285,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Goed bereikbare beachbreak vlak bij Haarlem en Amsterdam, met surfscholen op het strand. Werkt bij westelijke tot noordwestelijke swell en aflandige oostenwind.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'bloemendaal', place: 'Bloemendaal', name: 'Bloemendaal aan Zee', region: 'Noord-Holland',
    lat: 52.405, lng: 4.545, coastlineAngle: 285,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Strand ten noorden van Zandvoort, tegen de duinen van het Nationaal Park Zuid-Kennemerland. Dezelfde swell als Zandvoort, vaak met wat meer ruimte in het water.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'ijmuiden', place: 'IJmuiden', name: 'IJmuiden (Zuidpier)', region: 'Noord-Holland',
    lat: 52.458, lng: 4.562, coastlineAngle: 285,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Het brede strand bij de zuidpier van IJmuiden. De lange pieren van de haven beïnvloeden swell en stroming; bij sommige omstandigheden levert dat juist beter gevormde golven op.',
    tideText: 'Bij lange periode (8 s of meer) werkt het op elk getij; bij korte periode is hoogwater het beste.',
  }),
  beach({
    id: 'wijk-aan-zee', slug: 'wijk-aan-zee', place: 'Wijk aan Zee', name: 'Wijk aan Zee', region: 'Noord-Holland',
    lat: 52.49, lng: 4.58, coastlineAngle: 300,
    bestWind: ['O', 'ZO'], bestSwell: ['NW', 'W'],
    description: 'Wijk aan Zee ligt ten noorden van de pieren van IJmuiden en staat bekend als een van de meest constante spots van Nederland. De noordpier geeft beschutting bij zuidwestenwind.',
    tideText: 'Bij lange periode (8 s of meer) werkt het op elk getij; bij korte periode is hoogwater het beste.',
  }),
  beach({
    slug: 'castricum', place: 'Castricum', name: 'Castricum aan Zee', region: 'Noord-Holland',
    lat: 52.555, lng: 4.607, coastlineAngle: 280,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Open beachbreak midden in de Noord-Hollandse duinen. Rustiger dan de bekende spots en goed bij westelijke tot noordwestelijke swell.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'egmond', place: 'Egmond aan Zee', name: 'Egmond aan Zee', region: 'Noord-Holland',
    lat: 52.62, lng: 4.622, coastlineAngle: 280,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Strand bij de vuurtoren van Egmond aan Zee. Een open beachbreak die bij westelijke swell en aflandige wind mooie dagen geeft.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'bergen', place: 'Bergen aan Zee', name: 'Bergen aan Zee', region: 'Noord-Holland',
    lat: 52.66, lng: 4.627, coastlineAngle: 280,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Kleinschalige badplaats met een open strand tussen de duinen. Pakt dezelfde swell als Egmond, meestal met weinig mensen in het water.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'petten', place: 'Petten', name: 'Petten', region: 'Noord-Holland',
    lat: 52.772, lng: 4.655, coastlineAngle: 275,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Strand bij Petten, langs de Hondsbossche Duinen. Open ligging naar het westen; een rustig alternatief voor de drukkere badplaatsen.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),
  beach({
    slug: 'callantsoog', place: 'Callantsoog', name: 'Callantsoog', region: 'Noord-Holland',
    lat: 52.84, lng: 4.69, coastlineAngle: 280,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'Breed strand in de Kop van Noord-Holland. Werkt bij westelijke tot noordwestelijke swell met aflandige oostenwind.',
    tideText: 'Mid- tot hoogwater is op deze kust meestal het beste; rond laagwater breekt het ver uit.',
  }),

  // ── Waddeneilanden ─────────────────────────────────────────────────────────
  beach({
    slug: 'texel', place: 'Texel', name: 'Texel (Paal 17)', region: 'Waddeneilanden',
    lat: 53.085, lng: 4.735, coastlineAngle: 285,
    bestWind: ['O', 'ZO', 'NO'], bestSwell: ['W', 'WNW', 'NW'],
    description: 'De westkust van Texel, bij strandpaal 17 ten zuiden van De Koog. Open ligging naar de Noordzee; pakt vaak iets meer swell dan het vasteland.',
    tideText: 'Mid-tide is doorgaans het meest betrouwbare venster.',
  }),
];

export const CATALOG_BY_SLUG = new Map(SPOT_CATALOG.map(s => [s.slug, s]));
export const CATALOG_BY_ID = new Map(SPOT_CATALOG.map(s => [s.id, s]));

export const SPOT_REGIONS: SpotRegion[] = ['Zeeland', 'Zuid-Holland', 'Noord-Holland', 'Waddeneilanden'];

/** Pad van de vindbare spotpagina. */
export const spotPagePath = (s: { slug: string }) => `/surfverwachting/${s.slug}/`;

/** Alleen de SurfSpot-velden (zonder catalogusteksten), om in een profiel op te slaan. */
export function toSurfSpot(s: CatalogSpot): SurfSpot {
  const { slug, place, region, description, tideText, blog, ...spot } = s;
  return spot;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, D = Math.PI / 180;
  const dLat = (b.lat - a.lat) * D, dLng = (b.lng - a.lng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** De dichtstbijzijnde andere catalogusspots. */
export function nearbyCatalogSpots(spot: CatalogSpot, n = 4): CatalogSpot[] {
  return SPOT_CATALOG
    .filter(s => s.slug !== spot.slug)
    .map(s => ({ s, d: distanceKm(spot, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.s);
}
