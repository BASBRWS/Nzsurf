import { SurfSpot, UserProfile } from "./types";

export const DEFAULT_SPOTS: SurfSpot[] = [
  {
    id: 'ouddorp',
    name: 'Ouddorp (Flaauwe Werk)',
    lat: 51.815,
    lng: 3.91,
    type: 'beachbreak',
    bestWind: ['ZO', 'O', 'Z'],
    bestSwell: ['NW', 'WNW', 'W', 'N'],
    coastlineAngle: 300,
    tideStation: 'Ouddorp',
    bathymetryProfile: 'sandbanks'
  },
  {
    id: 'ouddorp-p-noordweg',
    name: 'Ouddorp (P Noordweg)',
    lat: 51.8253,
    lng: 3.8874,
    type: 'beachbreak',
    bestWind: ['ZO', 'O', 'Z'],
    bestSwell: ['NW', 'WNW', 'W', 'N'],
    coastlineAngle: 300,
    tideStation: 'Ouddorp',
    bathymetryProfile: 'sandbanks'
  },
  {
    id: 'maasvlakte',
    name: 'Maasvlakte 2 (Slufter)',
    lat: 51.95,
    lng: 3.98,
    type: 'beachbreak',
    bestWind: ['ZO', 'O', 'NO'],
    bestSwell: ['WNW', 'NW', 'N'],
    coastlineAngle: 310,
    bathymetryProfile: 'deep_water_approach'
  },
  {
    id: 'scheveningen',
    name: 'Scheveningen (Noord)',
    lat: 52.11,
    lng: 4.27,
    type: 'beachbreak',
    bestWind: ['O', 'ZO', 'NO'],
    bestSwell: ['NW', 'WNW'],
    coastlineAngle: 305,
    bathymetryProfile: 'gentle_slope'
  },
  {
    id: 'wijk-aan-zee',
    name: 'Wijk aan Zee',
    lat: 52.49,
    lng: 4.58,
    type: 'beachbreak',
    bestWind: ['O', 'ZO'],
    bestSwell: ['NW', 'W'],
    coastlineAngle: 300
  },
  {
    id: 'domburg',
    name: 'Domburg',
    lat: 51.56,
    lng: 3.49,
    type: 'beachbreak',
    bestWind: ['ZO', 'Z'],
    bestSwell: ['NW', 'N'],
    coastlineAngle: 320
  },
  {
    id: 'lette-blanche',
    name: 'Plage de la Lette Blanche (FR)',
    lat: 43.95,
    lng: -1.36,
    type: 'beachbreak',
    bestWind: ['O', 'ZO', 'NO'],
    bestSwell: ['WNW', 'W'],
    coastlineAngle: 270,
    isAtlantic: true
  },
  {
    id: 'soulac-sandaya',
    name: 'Soulac Plage - Sandaya (FR)',
    lat: 45.492,
    lng: -1.132,
    type: 'beachbreak',
    bestWind: ['O', 'ZO', 'NO'],
    bestSwell: ['WNW', 'W', 'NW'],
    coastlineAngle: 285,
    isAtlantic: true
  }
];

export const INITIAL_USER: UserProfile = {
  weight: 75,
  skillLevel: 'intermediate',
  favoriteSpotId: 'ouddorp',
  boards: [
    { id: '1', name: 'Mijn Fish', type: 'fish', volume: 35, length: "5'10" },
    { id: '2', name: 'Longboard', type: 'longboard', volume: 65, length: "9'2" }
  ],
  selectedBoardId: '1',
  wetsuits: [
    { id: 'w1', thickness: '5/4', hasHood: true, hasBoots: true, hasGloves: false }
  ],
  selectedWetsuitId: 'w1'
};
