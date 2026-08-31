import { ForecastData, SurfSpot, UserProfile, Board, Wetsuit, SkillLevel, SunscreenAdvice } from '../types';
import { calculateSunscreenAdvice } from './sunscreenUtils';
import { getKiteAlert, KiteAlertInfo } from './kiteAlertUtils';
import { parseISO, format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';

export interface TideTurn {
  time: string;
  isHigh: boolean;
  height: number;
}

export interface DayPartSnapshot {
  label: string;
  timeRange: string;
  waveHeight: number;
  windBft: number;
  windKnots: number;
  windDir: string;
  condition: string;
  ratingScore: number;
  uvIndex?: number;
}

export interface RankedQuiverBoard {
  id: string;
  name: string;
  type: string;
  volume: number;
  length: string;
  matchPercent: number;
  reason: string;
  isBest: boolean;
}

export interface DailySummary {
  dateStr: string;
  formattedDay: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  dateNumberMonth: string;
  weatherCode?: number;
  ratingScore: number;
  ratingLabel: 'FLAT' | 'POOR' | 'FAIR' | 'GOOD' | 'EPIC';
  ratingHeadline: string;
  ratingColor: {
    bg: string;
    text: string;
    border: string;
    glow: string;
    pill: string;
  };
  summaryNarrative: string;
  isAverageProfile: boolean;
  isPersonalizedQuiver: boolean;
  userWeight: number;
  userSkill: SkillLevel;
  spotMatchPercent: number;
  matchNote: {
    isMatch: boolean;
    text: string;
  };
  waveHeight: {
    peak: number;
    min: number;
    display: string;
    breakingFace: string;
    dirLabel: string;
    dirArrow: string;
    directionDeg: number;
    swellEnergyKj: number;
  };
  period: number;
  periodLabel: string;
  wind: {
    bftRange: string;
    speedKnots: number;
    gustKnots: number;
    dirLabel: string;
    dirArrow: string;
    directionDeg: number;
    classification: 'offshore' | 'side-offshore' | 'onshore' | 'side-onshore' | 'cross';
    classificationLabel: string;
    typeNote: string;
  };
  gearAdvice: {
    board: string;
    boardSubtitle: string;
    boardIsOwned: boolean;
    boardMatchScore: number;
    wetsuit: string;
    wetsuitSubtitle: string;
    wetsuitIsOwned: boolean;
  };
  quiverEvaluation: {
    bestBoard: RankedQuiverBoard;
    allBoards: RankedQuiverBoard[];
    quiverSynergyScore: number; // 1-10
    quiverFitNote: string;
    wetsuitNote: string;
  };
  tideTurns: TideTurn[];
  nextTideSummary: string;
  waterTempAvg: number;
  uvIndexMax: number;
  sunscreenAdvice: SunscreenAdvice;
  kiteAlert?: KiteAlertInfo;
  bestWindow?: {
    timeRange: string;
    conditionText: string;
    why: string;
  };
  dayParts: DayPartSnapshot[];
  hourlyData: ForecastData[];
  bestHourData: ForecastData;
}

/**
 * Converts wind speed in knots to Beaufort scale number
 */
export function knotsToBeaufort(knots: number): number {
  if (knots <= 1) return 0;
  if (knots <= 3) return 1;
  if (knots <= 6) return 2;
  if (knots <= 10) return 3;
  if (knots <= 16) return 4;
  if (knots <= 21) return 5;
  if (knots <= 27) return 6;
  if (knots <= 33) return 7;
  if (knots <= 40) return 8;
  if (knots <= 47) return 9;
  return 10;
}

/**
 * Converts wind/swell degrees to Dutch compass direction and meteorological incoming arrow
 */
export function getCompassInfo(degrees: number): { label: string; arrow: string } {
  const norm = ((degrees % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return { label: 'N', arrow: '↓' };
  if (norm >= 22.5 && norm < 67.5) return { label: 'NO', arrow: '↙' };
  if (norm >= 67.5 && norm < 112.5) return { label: 'O', arrow: '←' };
  if (norm >= 112.5 && norm < 157.5) return { label: 'ZO', arrow: '↖' };
  if (norm >= 157.5 && norm < 202.5) return { label: 'Z', arrow: '↑' };
  if (norm >= 202.5 && norm < 247.5) return { label: 'ZW', arrow: '↗' };
  if (norm >= 247.5 && norm < 292.5) return { label: 'W', arrow: '→' };
  return { label: 'NW', arrow: '↘' };
}

/**
 * Computes exact high & low tide turning times for a given day
 */
export function calculateDailyTideTurns(dateStr: string, isAtlantic: boolean): TideTurn[] {
  const targetDate = parseISO(dateStr);
  const startOfDayMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0).getTime();
  const endOfDayMs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59).getTime();

  const m2PeriodMs = 12.42 * 3600 * 1000;
  const refHighTideMs = isAtlantic
    ? new Date('2026-05-04T01:30:00Z').getTime()
    : new Date('2026-05-04T03:00:00Z').getTime();

  const turns: TideTurn[] = [];

  const minCycle = Math.floor((startOfDayMs - refHighTideMs - m2PeriodMs) / (m2PeriodMs / 2));
  const maxCycle = Math.ceil((endOfDayMs - refHighTideMs + m2PeriodMs) / (m2PeriodMs / 2));

  for (let c = minCycle; c <= maxCycle; c++) {
    const isHigh = c % 2 === 0;
    const turnTimeMs = refHighTideMs + c * (m2PeriodMs / 2);

    if (turnTimeMs >= startOfDayMs && turnTimeMs <= endOfDayMs) {
      const turnDate = new Date(turnTimeMs);
      const hoursStr = String(turnDate.getHours()).padStart(2, '0');
      const minsStr = String(turnDate.getMinutes()).padStart(2, '0');

      const height = isAtlantic
        ? (isHigh ? 4.3 : 0.7)
        : (isHigh ? 2.1 : 0.1);

      turns.push({
        time: `${hoursStr}:${minsStr}`,
        isHigh,
        height
      });
    }
  }

  return turns.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Calculates hydrodynamic match percentage for a board against wave & user profile
 */
export function calculateBoardMatch(
  board: Board,
  maxWave: number,
  avgPeriod: number,
  windSpeed: number,
  windType: string,
  userWeight: number,
  skill: SkillLevel
): { matchPercent: number; reason: string } {
  const weight = userWeight > 0 ? userWeight : 75;
  const vol = board.volume || 35;
  const type = board.type || 'shortboard';

  // Benchmark target volume based on skill and user weight (Guild Factor)
  let targetRatio = 0.46; // intermediate
  if (skill === 'beginner') targetRatio = 0.70;
  else if (skill === 'advanced') targetRatio = 0.38;
  else if (skill === 'pro') targetRatio = 0.33;

  const baselineVolume = weight * targetRatio;

  let match = 70;
  let reason = '';

  // 1. Very Small Waves (< 0.45m)
  if (maxWave < 0.45) {
    if (type === 'longboard' || type === 'softtop' || vol >= 55) {
      match = 95 + Math.min(4, Math.round(vol / 20));
      reason = `Maximale float (${vol}L) om zelfs op ${maxWave.toFixed(1)}m rimpels moeiteloos te glijden.`;
    } else if (type === 'funboard' || type === 'hybrid' || vol >= 40) {
      match = 78 + Math.round((vol - 40) / 2);
      reason = `Redelijk volume (${vol}L), maar vereist actieve peddelkracht op vlakke secties.`;
    } else if (type === 'fish' && vol >= 34) {
      match = 74;
      reason = `Brede shape helpt, maar bij ${maxWave.toFixed(1)}m is het hard werken om gang te houden.`;
    } else {
      // Small shortboard on micro waves
      match = Math.max(25, 45 - Math.round((baselineVolume - vol) * 2));
      reason = `Te weinig drijfvermogen (${vol}L voor ${weight}kg) voor deze lage golfenergie. Zakt snel weg.`;
    }
  }
  // 2. Small to Medium Waves (0.45m - 0.85m)
  else if (maxWave < 0.85) {
    if (type === 'fish' || type === 'hybrid') {
      match = 94 + (vol >= baselineVolume * 0.95 ? 4 : 0);
      reason = `Optimale combi van wendbaarheid en planeervermogen op deze ${maxWave.toFixed(1)}m heuphoge golven.`;
    } else if (type === 'funboard') {
      match = 90;
      reason = `Veel peddelgemak en ontspannen carves over de schouders.`;
    } else if (type === 'longboard') {
      match = 86;
      reason = `Heerlijk cruisen en noseriden, al is het soms krap draaien op kortere banken.`;
    } else if (type === 'softtop') {
      match = 80;
      reason = `Veilig en vergevingsgezind voor veel golven pakken.`;
    } else {
      // Shortboard
      if (vol >= baselineVolume * 0.9) {
        match = 82;
        reason = `Lekker wendbaar, mits je op de steilste sectie instapt.`;
      } else {
        match = 60;
        reason = `Net iets te klein volume (${vol}L) voor de slappe schouders van ${maxWave.toFixed(1)}m.`;
      }
    }
  }
  // 3. Good Solid Waves (0.85m - 1.5m)
  else if (maxWave <= 1.5) {
    if (type === 'shortboard' || type === 'hybrid') {
      match = 96;
      reason = `Perfecte scherpe rails en wendbaarheid voor de krachtige ${maxWave.toFixed(1)}m pocket.`;
    } else if (type === 'fish') {
      match = 90;
      reason = `Veel vaart over de vlakkere secties met snelle directionele switches.`;
    } else if (type === 'funboard') {
      match = 84;
      reason = `Stabiel en betrouwbaar bij het droppen en aanzetten.`;
    } else if (type === 'longboard') {
      match = 75;
      reason = `Vraagt vroege take-offs en goede railcontrole bij de steilere drops.`;
    } else {
      match = 68;
      reason = `Veel volume kan gaan stuiteren in de harde chopping of steile drops.`;
    }
  }
  // 4. Heavy / Big Waves (> 1.5m)
  else {
    if (type === 'shortboard' || type === 'hybrid') {
      match = 95;
      reason = `Houdt maximale controle en grip in snelle drops en steile wanden.`;
    } else if (type === 'fish') {
      match = 78;
      reason = `Kan wat los/skattery aanvoelen bij volle snelheid in zware chop.`;
    } else {
      match = 45;
      reason = `Groot board (${vol}L) is zwaar bij duckdiven en riskeert nosedives in steile holle bakken.`;
    }
  }

  // Wind quality modifier
  if (windType === 'offshore' || windType === 'side-offshore') {
    if (type === 'shortboard' || type === 'fish') match = Math.min(99, match + 3);
  } else if (windSpeed > 18) {
    // Chop helps with slightly wider/heavier boards
    if (type === 'hybrid' || type === 'fish' || type === 'funboard') match = Math.min(98, match + 2);
  }

  return {
    matchPercent: Math.max(15, Math.min(99, match)),
    reason
  };
}

/**
 * Finds the best matching wetsuit from user's gear based on water & air temperature
 */
export function calculateWetsuitMatch(
  wetsuits: Wetsuit[] | undefined,
  waterTemp: number,
  airTemp: number,
  windSpeed: number
): {
  thickness: string;
  subtitle: string;
  isOwned: boolean;
  note: string;
} {
  // Determine ideal theoretical requirement
  let idealThickness = '4/3mm';
  let accessoriesText = '';
  
  if (waterTemp < 9) {
    idealThickness = '5/4mm';
    accessoriesText = '+ Hood & Boots';
  } else if (waterTemp < 13) {
    idealThickness = '5/4mm of 4/3mm';
    accessoriesText = '+ Boots';
  } else if (waterTemp < 16) {
    idealThickness = '4/3mm of 3/2mm';
    accessoriesText = 'Fullsuit';
  } else if (waterTemp < 20) {
    idealThickness = '3/2mm Fullsuit';
    accessoriesText = 'Zomerpak';
  } else {
    idealThickness = '2/2mm Shorty of 3/2mm';
    accessoriesText = 'Warm water';
  }

  if (!wetsuits || wetsuits.length === 0) {
    return {
      thickness: `${idealThickness} ${accessoriesText}`.trim(),
      subtitle: `Advies bij ${waterTemp}°C water (Geen pakken in profiel)`,
      isOwned: false,
      note: `Voeg je wetsuit toe in je profiel voor setup-specifiek warmteadvies.`
    };
  }

  // Find best match in user's wetsuits
  const scoredWetsuits = wetsuits.map(w => {
    let score = 50;
    const isCold = waterTemp < 13;
    const isVeryCold = waterTemp < 9;
    const isWarm = waterTemp >= 18;

    if (w.thickness.includes('5/4') || w.thickness.includes('6/5')) {
      if (isVeryCold) score = 95 + (w.hasHood ? 3 : 0) + (w.hasBoots ? 2 : 0);
      else if (isCold) score = 90;
      else if (isWarm) score = 40; // Too hot
      else score = 70;
    } else if (w.thickness.includes('4/3')) {
      if (isCold && !isVeryCold) score = 95 + (w.hasBoots ? 3 : 0);
      else if (isVeryCold) score = 65; // A bit chilly
      else if (isWarm) score = 60;
      else score = 90;
    } else if (w.thickness.includes('3/2')) {
      if (isWarm) score = 98;
      else if (waterTemp >= 14) score = 88;
      else if (isCold) score = 30; // Dangerously cold
      else score = 65;
    } else if (w.thickness.includes('2/2')) {
      if (waterTemp >= 20) score = 95;
      else score = 25;
    }

    return { wetsuit: w, score };
  });

  scoredWetsuits.sort((a, b) => b.score - a.score);
  const best = scoredWetsuits[0].wetsuit;

  const accessories: string[] = [];
  if (best.hasHood) accessories.push('Hood');
  if (best.hasBoots) accessories.push('Boots');
  if (best.hasGloves) accessories.push('Gloves');

  const accString = accessories.length > 0 ? ` (${accessories.join(' + ')})` : '';

  let note = `Perfect afgestemd op ${waterTemp}°C watertemperatuur en ${airTemp}°C lucht.`;
  if (waterTemp < 10 && !best.hasBoots) {
    note = `Let op: watertemperatuur is ${waterTemp}°C! Neem losse neopreen boots mee.`;
  }

  return {
    thickness: `${best.thickness}mm${accString}`,
    subtitle: `Uit jouw gear • ${waterTemp}°C water`,
    isOwned: true,
    note
  };
}

/**
 * Generates rich, authentic Dutch daily summaries based on day conditions and user profile quiver
 */
export function processDailyForecasts(
  forecast: ForecastData[],
  spot: SurfSpot,
  user: UserProfile,
  isLoggedIn: boolean
): DailySummary[] {
  if (!forecast || forecast.length === 0) return [];

  // Group forecast by day
  const dayGroups = new Map<string, ForecastData[]>();
  forecast.forEach(item => {
    const dayKey = format(parseISO(item.timestamp), 'yyyy-MM-dd');
    if (!dayGroups.has(dayKey)) {
      dayGroups.set(dayKey, []);
    }
    dayGroups.get(dayKey)!.push(item);
  });

  const userBoards = (user.boards && user.boards.length > 0) ? user.boards : [];
  const hasUserBoards = userBoards.length > 0;
  const userWeight = user.weight > 0 ? user.weight : 75;
  const skill = user.skillLevel || 'intermediate';
  const isAverageProfile = !isLoggedIn && !hasUserBoards;

  const summaries: DailySummary[] = [];

  dayGroups.forEach((dayHours, dateStr) => {
    // Focus on daylight hours (06:00 to 21:00)
    const daylightHours = dayHours.filter(h => {
      const hr = parseISO(h.timestamp).getHours();
      return hr >= 6 && hr <= 21;
    });

    const activeHours = daylightHours.length > 0 ? daylightHours : dayHours;

    // Find peak / representative values
    const rawMaxWave = Math.max(...activeHours.map(h => h.waveHeight));
    const rawMinWave = Math.min(...activeHours.map(h => h.waveHeight));
    const avgPeriod = Math.round(activeHours.reduce((acc, h) => acc + h.swellPeriod, 0) / activeHours.length);

    let bathyMultiplier = 1.0;
    let bathyNote = '';
    
    // Toepassing van regionale bathymetrie (kustlijndiepte data)
    if (spot.bathymetryProfile === 'deep_water_approach') {
      bathyMultiplier = 1.25; 
      bathyNote = 'Diep water dicht onder de kust zorgt dat swell energie behoudt.';
    } else if (spot.bathymetryProfile === 'sandbanks') {
      if (avgPeriod >= 7) {
        bathyMultiplier = 1.15;
        bathyNote = 'Lange periode swell bouwt mooi op over de ondiepe zandbanken (shoaling).';
      } else {
        bathyMultiplier = 0.85;
        bathyNote = 'Korte periode windswell verliest wat energie door bodemwrijving op de uitgestrekte banken.';
      }
    } else if (spot.bathymetryProfile === 'gentle_slope') {
      bathyMultiplier = 0.95;
    }

    const maxWave = rawMaxWave * bathyMultiplier;
    const minWave = rawMinWave * bathyMultiplier;

    const minKnots = Math.min(...activeHours.map(h => h.windSpeed));
    const maxKnots = Math.max(...activeHours.map(h => h.windSpeed));
    const minBft = knotsToBeaufort(minKnots);
    const maxBft = knotsToBeaufort(maxKnots);

    // Best hour based on wavePower, wind quality and wave height
    const sortedHours = [...activeHours].sort((a, b) => {
      const scoreA = (a.waveHeight >= 0.4 ? a.waveHeight * 2 : 0) + (a.windQuality || 50) / 20 + (a.wavePower || 0) / 20;
      const scoreB = (b.waveHeight >= 0.4 ? b.waveHeight * 2 : 0) + (b.windQuality || 50) / 20 + (b.wavePower || 0) / 20;
      return scoreB - scoreA;
    });
    const bestHour = sortedHours[0] || dayHours[0];
    const bestHourTime = parseISO(bestHour.timestamp);
    const bestHourH = bestHourTime.getHours();

    // Representative compass directions
    const swellDirInfo = getCompassInfo(bestHour.swellDirection);
    const windDirInfo = getCompassInfo(bestHour.windDirection);

    // Weather condition code
    const weatherCode = bestHour.conditionCode;

    // Base environmental score calculation (1.0 to 10.0)
    let envScore = 5.0;
    if (maxWave < 0.25) {
      envScore = 3.0; // Flat
    } else if (maxWave < 0.5) {
      envScore = 4.2 + (bestHour.windQuality ? bestHour.windQuality / 100 : 0.5);
    } else if (maxWave >= 0.5 && maxWave <= 1.8) {
      envScore = 5.5 + (avgPeriod >= 6 ? 1.0 : 0) + (bestHour.windType === 'offshore' ? 1.8 : bestHour.windType === 'side-offshore' ? 0.8 : -0.8);
    } else {
      // High waves
      envScore = 6.5 + (bestHour.windType === 'offshore' ? 1.5 : -1.0);
    }

    // Evaluate ALL boards in the user's quiver
    let rankedBoards: RankedQuiverBoard[] = [];
    let bestBoardMatch: RankedQuiverBoard;

    if (hasUserBoards) {
      rankedBoards = userBoards.map(board => {
        const evalResult = calculateBoardMatch(
          board,
          maxWave,
          avgPeriod,
          bestHour.windSpeed,
          bestHour.windType || 'cross',
          userWeight,
          skill
        );
        return {
          id: board.id,
          name: board.name,
          type: board.type,
          volume: board.volume,
          length: board.length,
          matchPercent: evalResult.matchPercent,
          reason: evalResult.reason,
          isBest: false
        };
      });

      // Sort by match percentage descending
      rankedBoards.sort((a, b) => b.matchPercent - a.matchPercent);
      rankedBoards[0].isBest = true;
      bestBoardMatch = rankedBoards[0];
    } else {
      // Theoretical optimal board recommendation
      let theoreticalName = 'Allround Shortboard / Fish (32-38L)';
      let theoreticalType = 'fish';
      let theoreticalVol = 36;
      let theoreticalLen = "6'0";
      let reason = 'Goede allround volume voor reguliere condities.';

      if (maxWave < 0.45) {
        theoreticalName = "Longboard (9'0\"+) / Softtop (55L+)";
        theoreticalType = 'longboard';
        theoreticalVol = 65;
        theoreticalLen = "9'2";
        reason = `Maximaal drijfvermogen benodigd voor deze lage golfenergie (${maxWave.toFixed(1)}m).`;
      } else if (maxWave < 0.85) {
        theoreticalName = "Fish / Midlength (36-44L)";
        theoreticalType = 'fish';
        theoreticalVol = 38;
        theoreticalLen = "5'10";
        reason = `Ideale wendbaarheid en planeersnelheid op heuphoge heuveltjes.`;
      } else if (maxWave >= 1.5) {
        theoreticalName = "Performance Shortboard / Step-up (28-34L)";
        theoreticalType = 'shortboard';
        theoreticalVol = 30;
        theoreticalLen = "6'2";
        reason = `Maximale scherpe grip en controle in steile drops.`;
      }

      bestBoardMatch = {
        id: 'theoretical',
        name: theoreticalName,
        type: theoreticalType,
        volume: theoreticalVol,
        length: theoreticalLen,
        matchPercent: 95,
        reason,
        isBest: true
      };
      rankedBoards = [bestBoardMatch];
    }

    // Wetsuit gear evaluation
    const wetsuitEval = calculateWetsuitMatch(
      user.wetsuits,
      bestHour.waterTemp || 16,
      bestHour.airTemp || 18,
      bestHour.windSpeed
    );

    // Personalized Score Adjustment based on User's Quiver & Skill
    let score = envScore;
    
    if (hasUserBoards) {
      const topMatch = bestBoardMatch.matchPercent;
      // If user possesses a top board (e.g. 90%+ match), reward them
      if (topMatch >= 90) {
        score += 0.8;
      } else if (topMatch >= 75) {
        score += 0.3;
      } else if (topMatch < 50) {
        // Severe gear mismatch: user does not have a board that can ride these waves properly
        score = Math.max(2.0, score - 1.8);
      }
    }

    // Adapt score slightly to skill level
    if (skill === 'beginner') {
      if (maxWave > 1.4) score = Math.max(3.0, score - 2.0);
      else if (maxWave >= 0.4 && maxWave <= 0.9) score = Math.min(9.5, score + 1.2);
    } else if (skill === 'advanced' || skill === 'pro') {
      if (maxWave >= 1.2 && avgPeriod >= 7) score = Math.min(9.8, score + 1.5);
      else if (maxWave < 0.4) score = Math.max(2.5, score - 1.0);
    }

    score = Math.max(1.0, Math.min(10.0, Math.round(score * 10) / 10));

    // Rating Label & Color
    let ratingLabel: 'FLAT' | 'POOR' | 'FAIR' | 'GOOD' | 'EPIC' = 'FAIR';
    let ratingHeadline = 'Gemengde condities';
    let ratingColor = {
      bg: 'bg-cyan-500/10',
      text: 'text-sky-800 dark:text-cyan-300',
      border: 'border-sky-300 dark:border-cyan-500/30',
      glow: 'shadow-cyan-500/10',
      pill: 'rating-pill-fair'
    };

    if (maxWave < 0.35 || score < 3.8) {
      ratingLabel = 'FLAT';
      ratingHeadline = 'Vlakke zee & mini rimpels';
      ratingColor = {
        bg: 'bg-slate-500/10',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-300 dark:border-slate-500/30',
        glow: 'shadow-slate-500/5',
        pill: 'rating-pill-flat'
      };
    } else if (score < 5.2) {
      ratingLabel = 'POOR';
      ratingHeadline = 'Rommelig of te weinig kracht';
      ratingColor = {
        bg: 'bg-amber-500/10',
        text: 'text-amber-800 dark:text-amber-300',
        border: 'border-amber-300 dark:border-amber-500/30',
        glow: 'shadow-amber-500/10',
        pill: 'rating-pill-poor'
      };
    } else if (score < 7.0) {
      ratingLabel = 'FAIR';
      ratingHeadline = 'Leuke berijdbare sessie';
      ratingColor = {
        bg: 'bg-cyan-500/10',
        text: 'text-sky-800 dark:text-cyan-300',
        border: 'border-sky-300 dark:border-cyan-500/30',
        glow: 'shadow-cyan-500/15',
        pill: 'rating-pill-fair'
      };
    } else if (score < 8.5) {
      ratingLabel = 'GOOD';
      ratingHeadline = 'Cleane sets & goede vorm';
      ratingColor = {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-800 dark:text-emerald-300',
        border: 'border-emerald-300 dark:border-emerald-500/30',
        glow: 'shadow-emerald-500/20',
        pill: 'rating-pill-good'
      };
    } else {
      ratingLabel = 'EPIC';
      ratingHeadline = 'Topdag voor de Noordzee';
      ratingColor = {
        bg: 'bg-amber-400/15',
        text: 'text-amber-900 dark:text-amber-200',
        border: 'border-amber-400 dark:border-amber-400/40',
        glow: 'shadow-amber-400/30',
        pill: 'rating-pill-epic'
      };
    }

    // Spot match calculation
    const spotBestWinds = spot.bestWind || [];
    const isWindMatch = spotBestWinds.includes(windDirInfo.label) || bestHour.windType === 'offshore' || bestHour.windType === 'side-offshore';
    const spotBestSwells = spot.bestSwell || [];
    const isSwellMatch = spotBestSwells.includes(swellDirInfo.label) || maxWave >= 0.5;

    let spotMatchPercent = 50;
    if (isWindMatch && isSwellMatch) spotMatchPercent = 90 + Math.min(8, Math.round(maxWave * 5));
    else if (isWindMatch || isSwellMatch) spotMatchPercent = 65 + (isWindMatch ? 15 : 5);
    else spotMatchPercent = 35;

    let matchNoteText = '';
    const isSetupMatch = isWindMatch && isSwellMatch;

    if (isSetupMatch) {
      matchNoteText = `Wind ${windDirInfo.label} (${bestHour.windType || 'gunstig'}) + swell ${swellDirInfo.label} — sluit naadloos aan op ${spot.name}'s zandbanken.`;
    } else if (!isWindMatch && !isSwellMatch) {
      matchNoteText = `Wind ${windDirInfo.label} + swell ${swellDirInfo.label} — wijkt af van de ideale spotoriëntatie van ${spot.name}.`;
    } else if (!isWindMatch) {
      matchNoteText = `Wind ${windDirInfo.label} (${bestHour.windType || 'onshore'}) geeft wat chop, maar er staat wel degelijk swell (${swellDirInfo.label}).`;
    } else {
      matchNoteText = `Wind ${windDirInfo.label} is gunstig clean, maar de ${swellDirInfo.label}-hoek levert beperkte hoogte op.`;
    }
    
    if (bathyNote) {
      matchNoteText += ` ${bathyNote}`;
    }

    // Dynamic AI / Coach Narrative referencing user's actual gear
    let narrative = '';
    const boardRef = hasUserBoards 
      ? `jouw ${bestBoardMatch.name} (${bestBoardMatch.length || bestBoardMatch.type})`
      : `een ${bestBoardMatch.name}`;

    if (ratingLabel === 'FLAT') {
      if (hasUserBoards && bestBoardMatch.type === 'longboard') {
        narrative = `Kleine Noordzee-condities (${maxWave.toFixed(1)}m). Met jouw ${bestBoardMatch.name} (${bestBoardMatch.volume}L) kun je nog wat rimpels pakken voor een relaxte peddelsessie.`;
      } else if (maxKnots >= 15) {
        narrative = `Kleine rommelige zee met een stevige wind uit het ${windDirInfo.label.toLowerCase()}; te klein en te warrig voor een fijne surfsessie.`;
      } else {
        narrative = `Vrijwel vlakke Noordzee met nauwelijks rimpeling (${maxWave.toFixed(1)}m, ${avgPeriod}s). Ideaal voor peddeltraining, suppen of materiaalonderhoud.`;
      }
    } else if (ratingLabel === 'POOR') {
      if (bestHour.windType === 'onshore' || maxKnots > 16) {
        narrative = `Rond de halve meter met aanlandige wind uit het ${windDirInfo.label.toLowerCase()}; de periode (${avgPeriod}s) is kort en de zee choppy. Pak ${boardRef} voor wat extra stabiliteit.`;
      } else {
        narrative = `Rond het halve metertje met lichte bries. Neem ${boardRef} mee met voldoende volume (${bestBoardMatch.volume}L) voor de slappere secties.`;
      }
    } else if (ratingLabel === 'FAIR') {
      if (bestHour.windType === 'offshore' || bestHour.windType === 'side-offshore') {
        narrative = `Leuke, berijdbare heuphoge lijnen van ${maxWave.toFixed(1)}m met een gunstige aflandige/zij-aflandige bries uit ${windDirInfo.label}. Goede vorm voor een relaxte sessie op ${boardRef}.`;
      } else {
        narrative = `Redelijke golfhoogte (${minWave.toFixed(1)}–${maxWave.toFixed(1)}m) met matige wind (${minBft}–${maxBft} Bft). Met ${boardRef} haal je hier het maximale uit.`;
      }
    } else if (ratingLabel === 'GOOD') {
      narrative = `Stevige en gestructureerde ${maxWave.toFixed(1)}m golven met een fijne periode van ${avgPeriod}s. De wind uit ${windDirInfo.label} houdt de schouder mooi open. Top match met ${boardRef}!`;
    } else {
      // EPIC
      narrative = `Uitmuntende condities voor ${spot.name}! Cleane sets van ${maxWave.toFixed(1)}m bij ${avgPeriod}s swellperiode en lichte ${windDirInfo.label}-wind. Leg ${boardRef} klaar en lig op tijd in het water!`;
    }

    if (spot.isAtlantic && bestHour.tideHeight && bestHour.tideHeight >= 3.0) {
      narrative += ` Let op: bij volle vloed (${bestHour.tideHeight}m) kunnen de golven dichtklappen op de shorebreak.`;
    }

    // Tide milestones
    const tideTurns = calculateDailyTideTurns(dateStr, !!spot.isAtlantic);
    const nextTideSummary = tideTurns.map(t => `${t.isHigh ? 'Hoog' : 'Laag'} ${t.time} (${t.height.toFixed(1)}m)`).join(' • ');

    // Best Window computation
    const windowStartH = Math.max(6, bestHourH - 1);
    const windowEndH = Math.min(21, bestHourH + 2);
    const startStr = `${String(windowStartH).padStart(2, '0')}:00`;
    const endStr = `${String(windowEndH).padStart(2, '0')}:00`;

    const conditionText = bestHour.windType === 'offshore'
      ? 'Cleanste water & aflandige bries'
      : (bestHour.tideHeight && bestHour.tideHeight < 2.0 ? 'Ideaal getijdevenster' : 'Piekmoment golfkracht');

    const bestWindow = {
      timeRange: `${startStr} – ${endStr}`,
      conditionText,
      why: bestHour.windType === 'offshore' 
        ? `Lichte wind uit ${windDirInfo.label} gecombineerd met de beste banken.` 
        : `Beste balans tussen swellhoogte (${maxWave.toFixed(1)}m) en getijdenstand.`
    };

    // Wind classification
    let windClassification: DailySummary['wind']['classification'] = 'cross';
    let windClassificationLabel = 'Zijwind';
    if (bestHour.windType === 'offshore') {
      windClassification = 'offshore';
      windClassificationLabel = 'Aflandig • Strak & Clean';
    } else if (bestHour.windType === 'side-offshore') {
      windClassification = 'side-offshore';
      windClassificationLabel = 'Zij-aflandig • Mooie wand';
    } else if (bestHour.windType === 'onshore') {
      windClassification = 'onshore';
      windClassificationLabel = 'Aanlandig • Rommelige chop';
    } else if (bestHour.windType === 'side-onshore') {
      windClassification = 'side-onshore';
      windClassificationLabel = 'Zij-aanlandig • Hobbelig';
    }

    // Breaking Face Height (e.g. 0.8 - 1.2m)
    const minFace = Math.max(0.2, Math.round((minWave * 0.9) * 10) / 10);
    const maxFace = Math.round((maxWave * 1.25) * 10) / 10;
    const breakingFace = minFace === maxFace ? `${maxFace.toFixed(1)}m` : `${minFace.toFixed(1)} – ${maxFace.toFixed(1)}m`;

    // Swell energy (kJ/m2 approximation)
    const swellEnergyKj = Math.round(Math.pow(maxWave, 2) * avgPeriod * 4.5);

    // Period label
    let periodLabel = `${avgPeriod}s Korte windswell`;
    if (avgPeriod >= 9) periodLabel = `${avgPeriod}s Krachtige oceaanswell`;
    else if (avgPeriod >= 7) periodLabel = `${avgPeriod}s Goede Noordzeeswell`;

    // 4 Day-part snapshots (Ochtend, Middag, Namiddag, Avond)
    const dayPartSlots = [
      { label: 'Ochtend', start: 6, end: 10, range: '06:00–10:00' },
      { label: 'Middag', start: 10, end: 14, range: '10:00–14:00' },
      { label: 'Namiddag', start: 14, end: 18, range: '14:00–18:00' },
      { label: 'Avond', start: 18, end: 22, range: '18:00–21:30' },
    ];

    const dayParts: DayPartSnapshot[] = dayPartSlots.map(slot => {
      const slotHours = activeHours.filter(h => {
        const hr = parseISO(h.timestamp).getHours();
        return hr >= slot.start && hr < slot.end;
      });

      if (slotHours.length === 0) {
        return {
          label: slot.label,
          timeRange: slot.range,
          waveHeight: maxWave,
          windBft: maxBft,
          windKnots: maxKnots,
          windDir: windDirInfo.label,
          condition: 'Stabiel',
          ratingScore: score
        };
      }

      const avgWave = Math.round((slotHours.reduce((acc, h) => acc + h.waveHeight, 0) / slotHours.length) * 10) / 10;
      const avgWindKts = Math.round(slotHours.reduce((acc, h) => acc + h.windSpeed, 0) / slotHours.length);
      const slotBft = knotsToBeaufort(avgWindKts);
      const slotWindDir = getCompassInfo(slotHours[0].windDirection).label;
      const slotType = slotHours[0].windType === 'offshore' ? 'Clean' : slotHours[0].windType === 'onshore' ? 'Chop' : 'Matig';
      const slotUv = Math.round((slotHours.reduce((acc, h) => acc + (h.uvIndex || 0), 0) / slotHours.length) * 10) / 10;

      return {
        label: slot.label,
        timeRange: slot.range,
        waveHeight: avgWave,
        windBft: slotBft,
        windKnots: avgWindKts,
        windDir: slotWindDir,
        condition: slotType,
        ratingScore: Math.round((score + (slotType === 'Clean' ? 0.4 : -0.3)) * 10) / 10,
        uvIndex: slotUv
      };
    });

    // UV Index & Sunscreen Protection calculation for the day
    const uvIndexMax = Math.max(0, ...activeHours.map(h => h.uvIndex || 0));
    const dailySunscreenAdvice = calculateSunscreenAdvice(
      uvIndexMax,
      true,
      weatherCode,
      bestHour.airTemp
    );
    const waterTempAvg = Math.round(dayHours.reduce((acc, h) => acc + h.waterTemp, 0) / dayHours.length);

    const dayParsed = parseISO(dateStr);
    const dayName = format(dayParsed, 'EEEE', { locale: nl }).toUpperCase();
    const dayNumber = format(dayParsed, 'd');
    const monthName = format(dayParsed, 'MMM', { locale: nl }).toUpperCase();
    const dateNumberMonth = `${dayNumber} ${monthName}`;

    summaries.push({
      dateStr,
      formattedDay: `${dayName.slice(0, 2)} ${dateNumberMonth}`,
      dayName,
      dayNumber,
      monthName,
      dateNumberMonth,
      weatherCode,
      ratingScore: score,
      ratingLabel,
      ratingHeadline,
      ratingColor,
      summaryNarrative: narrative,
      isAverageProfile,
      isPersonalizedQuiver: hasUserBoards,
      userWeight,
      userSkill: skill,
      spotMatchPercent,
      matchNote: {
        isMatch: isSetupMatch,
        text: matchNoteText
      },
      waveHeight: {
        peak: maxWave,
        min: minWave,
        display: maxWave === minWave ? `${maxWave.toFixed(1)}m` : `${minWave.toFixed(1)}–${maxWave.toFixed(1)}m`,
        breakingFace,
        dirLabel: swellDirInfo.label,
        dirArrow: swellDirInfo.arrow,
        directionDeg: bestHour.swellDirection,
        swellEnergyKj
      },
      period: avgPeriod,
      periodLabel,
      wind: {
        bftRange: minBft === maxBft ? `${minBft} Bft` : `${minBft}–${maxBft} Bft`,
        speedKnots: bestHour.windSpeed,
        gustKnots: Math.round(bestHour.windSpeed * 1.3),
        dirLabel: windDirInfo.label,
        dirArrow: windDirInfo.arrow,
        directionDeg: bestHour.windDirection,
        classification: windClassification,
        classificationLabel: windClassificationLabel,
        typeNote: minBft !== maxBft ? 'luwte–vlagen' : (bestHour.windType || '')
      },
      gearAdvice: {
        board: hasUserBoards 
          ? `${bestBoardMatch.name} (${bestBoardMatch.length || ''}${bestBoardMatch.volume ? ` • ${bestBoardMatch.volume}L` : ''})`
          : bestBoardMatch.name,
        boardSubtitle: hasUserBoards 
          ? `${bestBoardMatch.matchPercent}% Setup Match • ${bestBoardMatch.reason}`
          : `Advies voor ${userWeight}kg (${skill})`,
        boardIsOwned: hasUserBoards,
        boardMatchScore: bestBoardMatch.matchPercent,
        wetsuit: wetsuitEval.thickness,
        wetsuitSubtitle: wetsuitEval.subtitle,
        wetsuitIsOwned: wetsuitEval.isOwned
      },
      quiverEvaluation: {
        bestBoard: bestBoardMatch,
        allBoards: rankedBoards,
        quiverSynergyScore: Math.round(score * 10) / 10,
        quiverFitNote: bestBoardMatch.reason,
        wetsuitNote: wetsuitEval.note
      },
      kiteAlert: getKiteAlert(spot, bestHour),
      tideTurns,
      nextTideSummary,
      waterTempAvg,
      uvIndexMax,
      sunscreenAdvice: dailySunscreenAdvice,
      bestWindow,
      dayParts,
      hourlyData: dayHours,
      bestHourData: bestHour
    });
  });

  return summaries;
}

