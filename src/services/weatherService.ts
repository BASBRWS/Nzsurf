import { SurfSpot, ForecastData } from '../types';
import { calculateSunscreenAdvice } from '../utils/sunscreenUtils';
import { swellExposure, spotWaveHeight, assessTide, computeSurfChance, findTideTurnsByDay, TideTrend } from '../utils/spotKnowledge';

// Echte waterstand (incl. getij) t.o.v. gemiddeld zeeniveau via Open-Meteo Marine.
// Los opgehaald: als de variabele niet beschikbaar is valt de app terug op het
// getijmodel en blijft de rest van de verwachting gewoon werken.
async function fetchSeaLevel(lat: number, lng: number): Promise<{ times: string[]; levels: (number | null)[] } | null> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=sea_level_height_msl&timezone=auto&forecast_days=10`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : undefined;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] | undefined = data?.hourly?.time;
    const levels: (number | null)[] | undefined = data?.hourly?.sea_level_height_msl;
    if (!Array.isArray(times) || !Array.isArray(levels)) return null;
    return { times, levels };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Controleert de waterstandreeks tegen de golftijden; null = terugvallen op model.
function alignSeaLevel(raw: { times: string[]; levels: (number | null)[] } | null, expectedTimes: string[]): number[] | null {
  if (!raw || raw.levels.length !== expectedTimes.length || raw.times[0] !== expectedTimes[0]) return null;
  const nums = raw.levels.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (nums.length < raw.levels.length * 0.9) return null;
  const range = Math.max(...nums) - Math.min(...nums);
  if (range < 0.3 || range > 15) return null; // geen getij zichtbaar of onzin
  let last = nums[0]; // gaten opvullen met de vorige waarde
  return raw.levels.map(v => (typeof v === 'number' && !isNaN(v) ? (last = v) : last));
}

// Genormaliseerd getijniveau (0 = laag, 1 = hoog) binnen ±7 uur (≈ één getijcyclus).
function tideLevelAt(levels: number[], i: number): { level: number; trend: TideTrend } {
  const lo = Math.max(0, i - 7), hi = Math.min(levels.length - 1, i + 7);
  let min = Infinity, max = -Infinity;
  for (let j = lo; j <= hi; j++) { min = Math.min(min, levels[j]); max = Math.max(max, levels[j]); }
  const level = max - min < 0.2 ? 0.5 : (levels[i] - min) / (max - min);
  const prev = levels[Math.max(0, i - 1)], next = levels[Math.min(levels.length - 1, i + 1)];
  const slope = next - prev;
  const trend: TideTrend = Math.abs(slope) < 0.04 ? 'slack' : slope > 0 ? 'rising' : 'falling';
  return { level: Math.round(level * 100) / 100, trend };
}

function getSeasonalWaterTemp(date: Date, isAtlantic: boolean): number {
  const month = date.getMonth(); // 0 = Jan, 11 = Dec
  // Sinusoidal approximation of water temperature peaked in August (month 7)
  // North Sea: min ~5°C in Feb, max ~18°C in Aug
  // Atlantic (Les Landes): min ~11.5°C in Feb, max ~21°C in Aug
  if (isAtlantic) {
    const minTemp = 11.5;
    const maxTemp = 21.0;
    const amplitude = (maxTemp - minTemp) / 2;
    const mean = minTemp + amplitude;
    return Math.round(mean + amplitude * Math.sin((month - 4.5) * Math.PI / 6));
  } else {
    const minTemp = 5.0;
    const maxTemp = 18.0;
    const amplitude = (maxTemp - minTemp) / 2;
    const mean = minTemp + amplitude;
    return Math.round(mean + amplitude * Math.sin((month - 4.5) * Math.PI / 6));
  }
}

export async function fetchForecast(spot: SurfSpot): Promise<ForecastData[]> {
  if (!spot || typeof spot.lat !== 'number' || typeof spot.lng !== 'number') {
    throw new Error('Invalid spot coordinates');
  }

  const { lat, lng } = spot;
  
  // Open-Meteo Marine API for waves
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=wave_height,wave_period,wave_direction&timezone=auto&forecast_days=10`;
  
  // Open-Meteo Weather API for wind, air temp and UV index
  // Fallback to explicitly defined robust models instead of default seamless models to prevent "Failed to fetch historical" errors
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,weather_code,precipitation,uv_index&timezone=auto&forecast_days=10&models=gfs_seamless`;


  try {
    const [marineRes, weatherRes, seaLevelRaw] = await Promise.all([
      fetch(marineUrl),
      fetch(weatherUrl),
      fetchSeaLevel(lat, lng)
    ]);

    if (!marineRes.ok || !weatherRes.ok) {
      const errorMsg = `Fetch failed: Marine ${marineRes.status}, Weather ${weatherRes.status}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const marineData = await marineRes.json();
    const weatherData = await weatherRes.json();

    if (!marineData.hourly || !weatherData.hourly) {
      throw new Error('Invalid data from Open-Meteo');
    }

    const forecast: ForecastData[] = [];
    const timestamps: string[] = marineData.hourly.time;

    // Getij: echte waterstand als die er is, anders het benaderde getijmodel.
    const m2Period = 12.42;
    const modelRefMs = spot.isAtlantic ? new Date('2026-05-04T01:30:00Z').getTime() : new Date('2026-05-04T03:00:00Z').getTime();
    const modelTide = (t: string) => {
      const diffHours = (new Date(t).getTime() - modelRefMs) / (1000 * 60 * 60);
      return spot.isAtlantic
        ? 2.5 + 1.8 * Math.cos((2 * Math.PI * diffHours) / m2Period) // Atlantisch (Les Landes), range ~3.6m
        : 1.1 + Math.cos((2 * Math.PI * diffHours) / m2Period);      // Noordzee, range ~2m
    };
    const realSeaLevel = alignSeaLevel(seaLevelRaw, timestamps);
    const tideSource: 'open-meteo' | 'model' = realSeaLevel ? 'open-meteo' : 'model';
    const tideSeries: number[] = realSeaLevel || timestamps.map(modelTide);
    const tideTurnsByDay = findTideTurnsByDay(timestamps, tideSeries);

    // We want data every 3 hours to keep the grid manageable.
    // The loop now covers all available timestamps (usually 7-10 days).
    for (let i = 0; i < timestamps.length; i += 3) {
      const time = timestamps[i];
      const date = new Date(time);
      const hour = date.getHours();
      
      // Daylight estimation
      const isDaylight = hour >= 6 && hour <= 21;

      let waveHeight = marineData.hourly.wave_height[i] || 0;
      
      // Apply spot-specific corrections if they exist
      if (spot.correction?.waveMultiplier) {
         waveHeight = parseFloat((waveHeight * spot.correction.waveMultiplier).toFixed(2));
      }

      const wavePeriod = marineData.hourly.wave_period[i] || 0;

      // Wave Power Calculation (Gecorrigeerd voor Atlantische Oceaan vs ondiepe Noordzee)
      const rawPower = 0.5 * Math.pow(waveHeight, 2) * wavePeriod;
      let wavePower: number;
      if (spot.isAtlantic) {
        // Atlantische diepwater-golven hebben veel meer energie (normalisatie tot 50 kW/m)
        wavePower = Math.min(Math.round((rawPower / 50) * 100), 100);
      } else {
        // Noordzee ondiepe golven verliezen sneller energie (normalisatie tot 15 kW/m)
        wavePower = Math.min(Math.round((rawPower / 15) * 100), 100);
      }

      // Getijstand op dit uur (echt of model) + fase binnen de lokale getijslag
      const tideHeight = tideSeries[i];
      const { level: tideLevel, trend: tideTrend } = tideLevelAt(tideSeries, i);

      // Wind Quality Calculation
      const windDir = weatherData.hourly.wind_direction_10m[i] || 0;
      const windSpeed = Math.round((weatherData.hourly.wind_speed_10m[i] || 0) / 1.852); // Knots
      
      // Calculate angle relative to coastline
      // offshore is coastlineAngle + 180
      const offshoreDir = (spot.coastlineAngle + 180) % 360;
      let diff = Math.abs(windDir - offshoreDir);
      if (diff > 180) diff = 360 - diff;

      let windType: 'offshore' | 'onshore' | 'side-onshore' | 'side-offshore' | 'cross-shore';
      let windQuality = 50;

      // Classify wind type purely on angle
      if (diff <= 30) windType = 'offshore';
      else if (diff <= 75) windType = 'side-offshore';
      else if (diff <= 105) windType = 'cross-shore';
      else if (diff <= 150) windType = 'side-onshore';
      else windType = 'onshore';

      // Advanced Wind Quality Formula
      const angleRad = diff * (Math.PI / 180);
      const windEffect = Math.cos(angleRad); // +1 (pure offshore) to -1 (pure onshore)
      
      if (windSpeed < 3) {
        // Glassy conditions: near perfect regardless of direction
        windQuality = 100;
      } else {
        let speedPenalty = 0;
        
        if (windEffect > 0) {
           // Offshore variants (windEffect > 0)
           // Safe speed increases as it gets more purely offshore (up to ~18kts safe)
           const safeSpeed = 10 + (windEffect * 8); 
           if (windSpeed > safeSpeed) {
              // Too strong offshore -> hard to paddle into waves
              speedPenalty = (windSpeed - safeSpeed) * (4 - windEffect); 
           } else {
              // Gentle offshore is ideal, minimal penalty
               speedPenalty = windSpeed * (0.8 - (windEffect * 0.5));
           }
        } else {
           // Onshore, side-shore variants (windEffect <= 0)
           // Harsher penalties based on how directly onshore it is
           const harshness = 3 + Math.abs(windEffect) * 4; // Penalty scale: 3 (cross) to 7 (onshore)
           speedPenalty = (windSpeed * harshness);
           
           // Immediate quality drop for any onshore breeze
           if (windSpeed >= 3) {
             speedPenalty += 10 + (Math.abs(windEffect) * 15);
           }
        }
        
        windQuality = Math.max(0, Math.min(100, Math.round(100 - speedPenalty)));
      }

      // Spotkennis: swellrichting, effectieve hoogte op de spot en getijvenster
      const swellDir = marineData.hourly.wave_direction[i] || 0;
      const exposureInfo = swellExposure(spot, swellDir);
      const spotWave = spotWaveHeight(spot, waveHeight, exposureInfo.exposure);
      const tideInfo = assessTide(spot, tideLevel, tideTrend, wavePeriod, swellDir);

      // Calculate Current Risk (Stromingsrisico & Baïnes)
      const hourlyTideChange = Math.abs(tideSeries[Math.min(tideSeries.length - 1, i + 1)] - tideSeries[Math.max(0, i - 1)]) / 2; // m/uur

      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let riskDesc = spot.isAtlantic
        ? 'Zwakke tot matige stroming. Let wel altijd op de actieve baïnes (muistromen) in Les Landes.'
        : 'Zwakke tot matige stroming. Veilige condities voor meeste surfers.';

      const isSoulac = spot.id === 'soulac-sandaya' || spot.name.toLowerCase().includes('soulac');

      if (spot.isAtlantic) {
        // Atlantische baïne gevaren & Gironde estuarium stromingen
        if (waveHeight > 2.0) {
          riskLevel = 'high';
          riskDesc = isSoulac
            ? 'Gevaarlijk hoge Atlantische swell bij Soulac Plage (Camping Sandaya). Zeer sterke baïne- en estuariumstromingen nabij de Gironde. Blijf binnen de bewaakte zone!'
            : 'Gevaarlijk hoge golven op deze open beachbreak. Zeer sterke baïne-stromingen (rips). Blijf binnen de bewaakte zone!';
        } else if (waveHeight > 1.2) {
          riskLevel = 'medium';
          riskDesc = isSoulac
            ? 'Actieve baïne- en getijdestroming bij de zandbanken van Soulac Plage. Vooral rond mid-tide en afgaand water alert blijven.'
            : 'Actieve baïne-stromingen (muistromen) aanwezig, vooral rond mid-tide. Surf bij voorkeur in de bewaakte zone.';
        } else {
          riskDesc = isSoulac
            ? 'Zwakke tot matige stroming. Let altijd op de lokale zandbanken en getijdenstroming bij Camping Sandaya Soulac Plage.'
            : 'Zwakke tot matige stroming. Let wel altijd op de actieve baïnes (muistromen) in Les Landes.';
        }
      } else {
        // Lange periode = kwaliteit, geen gevaar op zich; alleen écht grote golven op de spot.
        if (spotWave > 2.5 || (spotWave > 2.0 && wavePeriod > 9)) {
          riskLevel = 'high';
          riskDesc = 'Gevaarlijke muien (rip currents) door hoge en krachtige golven op de spot. Zeer sterke stroming!';
        } else if (windSpeed > 18 && (windType === 'onshore' || windType === 'side-onshore')) {
          riskLevel = 'high';
          riskDesc = 'Sterke windgestuurde kuststroom door hoge (schuin)aanlandige wind. Moeilijk positie houden.';
        } else if (hourlyTideChange > 0.45) { // approaching peak flow
          riskLevel = 'medium';
          riskDesc = 'Matige zandbank stroming door springtij / hard werkend getij (eb/vloed stroom).';
        } else if (spotWave > 1.4) {
          riskLevel = 'medium';
          riskDesc = 'Kans op muien (rips) aanwezig door relatief hoge golven. Let op bij zandbanken.';
        }
      }

      // UV Index & Sunscreen Advice calculation
      const rawUv = weatherData.hourly.uv_index?.[i];
      let uvIndex = typeof rawUv === 'number' && !isNaN(rawUv) ? Math.max(0, Math.round(rawUv * 10) / 10) : 0;
      
      // Fallback if uv_index is not returned by API: estimate daylight UV based on hour, month and weather
      if (rawUv === undefined && isDaylight) {
        const month = date.getMonth(); // 0 = Jan, 6 = Jul
        // Sun elevation peak around month 5-6 (Jun-Jul), lowest month 11-0 (Dec-Jan)
        const seasonalFactor = Math.max(0.2, Math.sin(((month + 0.5) / 12) * Math.PI));
        // Daily curve: peak at 13:00-14:00
        const solarHourOffset = Math.abs(hour - 13.5);
        const hourlyFactor = Math.max(0, Math.cos((solarHourOffset / 7.5) * (Math.PI / 2)));
        const cloudFactor = (weatherData.hourly.weather_code[i] || 0) > 3 ? 0.5 : 0.9;
        uvIndex = Math.round((seasonalFactor * hourlyFactor * 7.5 * cloudFactor) * 10) / 10;
      }

      const sunscreenAdvice = calculateSunscreenAdvice(
        uvIndex,
        isDaylight,
        weatherData.hourly.weather_code[i],
        weatherData.hourly.temperature_2m[i]
      );

      const item: ForecastData = {
        timestamp: new Date(time).toISOString(),
        waveHeight,
        swellPeriod: wavePeriod,
        swellDirection: swellDir,
        windSpeed,
        windDirection: windDir,
        waterTemp: getSeasonalWaterTemp(date, !!spot.isAtlantic),
        airTemp: Math.round(weatherData.hourly.temperature_2m[i] || 0),
        isDaylight,
        uvIndex,
        sunscreenAdvice,
        wavePower,
        tideHeight: Math.round(tideHeight * 10) / 10,
        precipitation: weatherData.hourly.precipitation[i] || 0,
        conditionCode: weatherData.hourly.weather_code[i],
        windQuality,
        windType,
        currentRisk: { level: riskLevel, description: riskDesc },
        tideSource,
        tideLevel,
        tideTrend,
        tideFactor: tideInfo.factor,
        tideNote: tideInfo.note,
        swellExposure: exposureInfo.exposure,
        swellNote: exposureInfo.note,
        spotWaveHeight: spotWave,
        dayTideTurns: tideTurnsByDay.get(String(time).slice(0, 10)) || []
      };
      item.surfChance = computeSurfChance(spot, item).chance;
      forecast.push(item);
    }

    return forecast;
  } catch (error) {
    console.error('Error fetching forecast:', error);
    throw error;
  }
}
