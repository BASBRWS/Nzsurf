import { SurfSpot, ForecastData } from '../types';

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
  
  // Open-Meteo Weather API for wind and air temp
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,weather_code,precipitation&timezone=auto&forecast_days=10`;

  try {
    const [marineRes, weatherRes] = await Promise.all([
      fetch(marineUrl),
      fetch(weatherUrl)
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
    const timestamps = marineData.hourly.time;

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

      // Simulation of a realistic tide curve (Gecorrigeerd voor Atlantische Oceaan getij)
      const m2Period = 12.42;
      const currentMs = new Date(time).getTime();
      let tideHeight: number;
      if (spot.isAtlantic) {
        // Atlantisch getij in Les Landes heeft veel grotere amplitude (~1.8m, range ~3.6m, mean 2.5m)
        const refHighTideAtlantic = new Date('2026-05-04T01:30:00Z').getTime();
        const diffHoursAtlantic = (currentMs - refHighTideAtlantic) / (1000 * 60 * 60);
        tideHeight = 2.5 + 1.8 * Math.cos((2 * Math.PI * diffHoursAtlantic) / m2Period);
      } else {
        // Noordzee getij in Nederland (mean 1.1m, amplitude ~1.0m)
        const refHighTide = new Date('2026-05-04T03:00:00Z').getTime();
        const diffHours = (currentMs - refHighTide) / (1000 * 60 * 60);
        tideHeight = 1.1 + Math.cos((2 * Math.PI * diffHours) / m2Period);
      }

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

      // Calculate Current Risk (Stromingsrisico & Baïnes)
      const tideRefTime = spot.isAtlantic ? new Date('2026-05-04T01:30:00Z').getTime() : new Date('2026-05-04T03:00:00Z').getTime();
      const diffHoursTide = (currentMs - tideRefTime) / (1000 * 60 * 60);
      const hourlyTideChange = Math.abs(-1.0 * (2 * Math.PI / m2Period) * Math.sin((2 * Math.PI * diffHoursTide) / m2Period)); // roughly meters/hour change
      
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
        if (waveHeight > 1.5 && wavePeriod > 8) {
          riskLevel = 'high';
          riskDesc = 'Gevaarlijke muien (rip currents) door hoge en krachtige golven. Zeer sterke stroming!';
        } else if (windSpeed > 18 && (windType === 'onshore' || windType === 'side-onshore')) {
          riskLevel = 'high';
          riskDesc = 'Sterke windgestuurde kuststroom door hoge (schuin)aanlandige wind. Moeilijk positie houden.';
        } else if (hourlyTideChange > 0.45) { // approaching peak flow
          riskLevel = 'medium';
          riskDesc = 'Matige zandbank stroming door springtij / hard werkend getij (eb/vloed stroom).';
        } else if (waveHeight > 1.2) {
          riskLevel = 'medium';
          riskDesc = 'Kans op muien (rips) aanwezig door relatief hoge golven. Let op bij zandbanken.';
        }
      }

      forecast.push({
        timestamp: new Date(time).toISOString(),
        waveHeight,
        swellPeriod: wavePeriod,
        swellDirection: marineData.hourly.wave_direction[i] || 0,
        windSpeed,
        windDirection: windDir,
        waterTemp: getSeasonalWaterTemp(date, !!spot.isAtlantic),
        airTemp: Math.round(weatherData.hourly.temperature_2m[i] || 0),
        isDaylight,
        wavePower,
        tideHeight: Math.round(tideHeight * 10) / 10,
        precipitation: weatherData.hourly.precipitation[i] || 0,
        conditionCode: weatherData.hourly.weather_code[i],
        windQuality,
        windType,
        currentRisk: { level: riskLevel, description: riskDesc }
      });
    }

    return forecast;
  } catch (error) {
    console.error('Error fetching forecast:', error);
    throw error;
  }
}
