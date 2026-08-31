import { SurfSpot, ForecastData } from '../types';
import { knotsToBeaufort } from './dailyForecastUtils';

// Reference coordinates for Ouddorp P Noordweg
export const OUDDORP_P_NOORDWEG_REF = {
  lat: 51.8253,
  lng: 3.8874,
  name: 'Ouddorp (P Noordweg)'
};

// 100m North (+0.000899° lat) and 200m South (-0.001799° lat)
const DEG_PER_METER_LAT = 1 / 111139; // ~0.000008997 deg/m
const NORTH_BOUND_LAT = OUDDORP_P_NOORDWEG_REF.lat + (100 * DEG_PER_METER_LAT); // ~51.82620
const SOUTH_BOUND_LAT = OUDDORP_P_NOORDWEG_REF.lat - (200 * DEG_PER_METER_LAT); // ~51.82350
// Max lateral distance in longitude (~400m corridor along beach)
const DEG_PER_METER_LNG = 1 / (111320 * Math.cos((51.8253 * Math.PI) / 180)); // ~0.00001456 deg/m
const MAX_LNG_DELTA = 400 * DEG_PER_METER_LNG; // ~0.0058 deg

/**
 * Checks whether a spot is Ouddorp P Noordweg or within the designated kite zone
 * (100 meters north to 200 meters south of 51.8253N, 3.8874E, or explicitly named Noordweg).
 */
export function isOuddorpNoordwegKiteZone(spot?: Partial<SurfSpot> | { lat: number; lng: number; name?: string; id?: string } | null): boolean {
  if (!spot) return false;

  // 1. Direct ID / Name check
  if (spot.id === 'ouddorp-p-noordweg') return true;
  const nameLower = (spot.name || '').toLowerCase();
  if (nameLower.includes('p noordweg') || nameLower.includes('p-noordweg') || nameLower.includes('noordweg')) {
    return true;
  }

  // 2. Coordinate boundary check (+100m North / -200m South)
  if (typeof spot.lat === 'number' && typeof spot.lng === 'number') {
    const inLatBounds = spot.lat >= (SOUTH_BOUND_LAT - 0.0001) && spot.lat <= (NORTH_BOUND_LAT + 0.0001);
    const inLngBounds = Math.abs(spot.lng - OUDDORP_P_NOORDWEG_REF.lng) <= MAX_LNG_DELTA;
    if (inLatBounds && inLngBounds) {
      return true;
    }
  }

  return false;
}

export interface KiteAlertInfo {
  isZone: boolean;
  isFavorable: boolean;
  intensity: 'none' | 'moderate' | 'high' | 'extreme';
  windKnots: number;
  windBft: number;
  windDirection?: string;
  badgeLabel: string;
  shortWarning: string;
  fullWarning: string;
  zoneDescription: string;
}

/**
 * Evaluates whether conditions are favorable for kitesurfing at Ouddorp P Noordweg
 * and generates appropriate warning messaging for surfers.
 */
export function getKiteAlert(
  spot?: Partial<SurfSpot> | { lat: number; lng: number; name?: string; id?: string } | null,
  forecastOrWind?: ForecastData | { windSpeed: number; windDirection?: string | number } | null
): KiteAlertInfo {
  const isZone = isOuddorpNoordwegKiteZone(spot);

  if (!isZone || !forecastOrWind) {
    return {
      isZone,
      isFavorable: false,
      intensity: 'none',
      windKnots: 0,
      windBft: 0,
      badgeLabel: '',
      shortWarning: '',
      fullWarning: '',
      zoneDescription: 'Ouddorp P Noordweg (+100m N / -200m Z)'
    };
  }

  const windKnots = Math.round(forecastOrWind.windSpeed || 0);
  const windBft = knotsToBeaufort(windKnots);
  let windDirStr = '';
  if (typeof forecastOrWind.windDirection === 'string') {
    windDirStr = forecastOrWind.windDirection;
  } else if (typeof forecastOrWind.windDirection === 'number') {
    const deg = forecastOrWind.windDirection;
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
    windDirStr = dirs[Math.round(deg / 22.5) % 16];
  }

  // Kite wind thresholds:
  // 12-16 kts (4 Bft) -> Moderate kite activity
  // 17-27 kts (5-6 Bft) -> High kite activity (very busy)
  // 28+ kts (7+ Bft) -> Extreme / storm kite conditions
  const isFavorable = windKnots >= 12;

  let intensity: 'none' | 'moderate' | 'high' | 'extreme' = 'none';
  let badgeLabel = 'Weinig Kiters';
  let shortWarning = 'Weinig wind voor kiters (< 12 kn). Rustig op het water.';
  let fullWarning = 'Momenteel weinig wind voor kitesurfers. De branding is vrij van kiters.';

  if (windKnots >= 28) {
    intensity = 'extreme';
    badgeLabel = 'Storm Kite Alert';
    shortWarning = `Zeer harde kitewind (${windKnots} kn / ${windBft} Bft). Extreme kiters op het water.`;
    fullWarning = `Stormachtige wind (${windKnots} kn / ${windBft} Bft${windDirStr ? ` uit ${windDirStr}` : ''}). Deze zone (P Noordweg +100m N / -200m Z) kan extreem gevaarlijk zijn met verwaaide kiters en hoge snelheden. Houd maximale afstand.`;
  } else if (windKnots >= 18) {
    intensity = 'high';
    badgeLabel = 'Druk met Kiters';
    shortWarning = `Top kitewind (${windKnots} kn / ${windBft} Bft). Spot staat vol met kiters!`;
    fullWarning = `Gunstige, krachtige kitewind (${windKnots} knopen / ${windBft} Bft${windDirStr ? ` uit ${windDirStr}` : ''}). Spot P Noordweg (en alle custom spots binnen 100m noord & 200m zuid) staat erom bekend bij deze wind propvol te liggen met kiters. Let extra goed op lijnen, snelle sprongen en voorrangsregels in de branding.`;
  } else if (windKnots >= 12) {
    intensity = 'moderate';
    badgeLabel = 'Kiters Actief';
    shortWarning = `Gunstige kitewind (${windKnots} kn / ${windBft} Bft). Kans op veel kiters.`;
    fullWarning = `Goede wind voor kitesurfers (${windKnots} knopen / ${windBft} Bft${windDirStr ? ` uit ${windDirStr}` : ''}). Houd rekening met drukte van kiters op het water bij P Noordweg en de omliggende 100m N / 200m Z zone.`;
  }

  return {
    isZone: true,
    isFavorable,
    intensity,
    windKnots,
    windBft,
    windDirection: windDirStr,
    badgeLabel,
    shortWarning,
    fullWarning,
    zoneDescription: 'Ouddorp P Noordweg zone (51.8253N / 3.8874E • +100m N / -200m Z)'
  };
}
