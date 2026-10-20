// Windkwaliteit voor surfen (0–100) en windtype, uit de kustoriëntatie van de spot.
// Eén definitie voor de verwachting (weatherService) en voor herberekening achteraf
// (Beta: kans tegen werkelijkheid).

export type WindType = 'offshore' | 'onshore' | 'side-onshore' | 'side-offshore' | 'cross-shore';

export function windQualityFor(coastlineAngle: number, windDir: number, windSpeedKn: number): { windType: WindType; windQuality: number } {
  // Aflandig = de richting waarin het strand kijkt + 180°.
  const offshoreDir = (coastlineAngle + 180) % 360;
  let diff = Math.abs(windDir - offshoreDir);
  if (diff > 180) diff = 360 - diff;

  let windType: WindType;
  if (diff <= 30) windType = 'offshore';
  else if (diff <= 75) windType = 'side-offshore';
  else if (diff <= 105) windType = 'cross-shore';
  else if (diff <= 150) windType = 'side-onshore';
  else windType = 'onshore';

  const windEffect = Math.cos(diff * (Math.PI / 180)); // +1 aflandig … −1 aanlandig
  let windQuality: number;
  if (windSpeedKn < 3) {
    windQuality = 100; // glad, richting doet er nauwelijks toe
  } else {
    let speedPenalty: number;
    if (windEffect > 0) {
      // Aflandig: tot ~18 kn veilig, harder maakt instappen lastig.
      const safeSpeed = 10 + windEffect * 8;
      speedPenalty = windSpeedKn > safeSpeed
        ? (windSpeedKn - safeSpeed) * (4 - windEffect)
        : windSpeedKn * (0.8 - windEffect * 0.5);
    } else {
      // Zij- tot aanlandig: zwaardere straf naarmate het rechter aanlandig is.
      const harshness = 3 + Math.abs(windEffect) * 4;
      speedPenalty = windSpeedKn * harshness + 10 + Math.abs(windEffect) * 15;
    }
    windQuality = Math.max(0, Math.min(100, Math.round(100 - speedPenalty)));
  }
  return { windType, windQuality };
}
