import { Capacitor } from '@capacitor/core';
import { SurfSpot } from '../types';
import { DailySummary } from './dailyForecastUtils';

// Drempel waarboven een dag "echt goed" is en we een agenda-afspraak aanbieden.
// Zelfde getal als de server-monitor (functions/) zodat app en e-mail gelijklopen.
export const CALENDAR_ALERT_THRESHOLD = 7.0;

// De agenda-afspraak mag alleen tussen dit uur en zonsondergang vallen.
export const SESSION_START_HOUR = 10; // 10:00 's ochtends
const TIMEZONE = 'Europe/Amsterdam';

// Bepaalt of voor deze dag een agenda-afspraak aangeboden wordt:
// ingelogd + optie aan (default aan) + score >= drempel.
export function shouldOfferCalendar(
  day: DailySummary,
  isLoggedIn: boolean,
  calendarAlertsEnabled: boolean | undefined
): boolean {
  if (!isLoggedIn) return false;
  if (calendarAlertsEnabled === false) return false; // undefined = default aan
  return day.ratingScore >= CALENDAR_ALERT_THRESHOLD;
}

// ── Tijd & zon helpers ──────────────────────────────────────────────────────

const mod = (n: number, m: number) => ((n % m) + m) % m;

// Offset (minuten) van Europe/Amsterdam t.o.v. UTC op een moment. Werkt ongeacht
// de tijdzone van de runtime (belangrijk: de monitor draait op een UTC-runner).
function nlOffsetMinutes(instant: Date): number {
  const s = new Date(instant.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const u = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((s.getTime() - u.getTime()) / 60000);
}

// Zet een NL-wandkloktijd (uren:minuten op datum dateStr) om naar een echt UTC-moment.
function amsterdamWallClockToUTC(dateStr: string, minutesOfDay: number): Date {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const off = nlOffsetMinutes(noonUtc); // +120 (zomer) of +60 (winter)
  const utcMs = Date.parse(`${dateStr}T00:00:00Z`) + (minutesOfDay - off) * 60000;
  return new Date(utcMs);
}

// Zonsondergang (UTC-moment) voor coördinaten op een datum (yyyy-MM-dd).
// Standaard zonsondergang-algoritme (Almanac). Geeft null bij poolnacht/-dag.
export function sunsetInstant(lat: number, lng: number, dateStr: string): Date | null {
  const [Y, M, D] = dateStr.split('-').map(Number);
  if (!Y || !M || !D) return null;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const zenith = 90.833; // officiële zonsondergang (incl. refractie)

  const startOfYear = Date.UTC(Y, 0, 0);
  const dayOfYear = Math.floor((Date.UTC(Y, M - 1, D) - startOfYear) / 86400000);

  const lngHour = lng / 15;
  const t = dayOfYear + ((18 - lngHour) / 24); // 18 = zonsondergang
  const meanAnom = (0.9856 * t) - 3.289;
  let L = meanAnom + (1.916 * Math.sin(meanAnom * D2R)) + (0.020 * Math.sin(2 * meanAnom * D2R)) + 282.634;
  L = mod(L, 360);
  let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
  RA = mod(RA, 360);
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * D2R);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * D2R) - (sinDec * Math.sin(lat * D2R))) / (cosDec * Math.cos(lat * D2R));
  if (cosH > 1 || cosH < -1) return null; // geen zonsondergang
  const H = (R2D * Math.acos(cosH)) / 15;
  const T = H + RA - (0.06571 * t) - 6.622;
  const UT = mod(T - lngHour, 24);
  return new Date(Date.UTC(Y, M - 1, D) + Math.round(UT * 3600 * 1000));
}

// Wandkloktijd (minuten sinds middernacht) in NL van een UTC-moment.
function instantToNlMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '21');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return mod(h, 24) * 60 + m;
}

// Rauw sessievenster van de dag in NL-wandklokminuten (uit bestWindow.timeRange,
// anders uit het beste uur). Leest tijden uit strings, dus runtime-onafhankelijk.
function rawWindowMinutes(day: DailySummary): { start: number; end: number } {
  const m = day.bestWindow?.timeRange?.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (end > start) return { start, end };
  }
  const hm = day.bestHourData?.timestamp?.match(/T(\d{2}):(\d{2})/);
  const startH = hm ? Number(hm[1]) * 60 + Number(hm[2]) : 12 * 60;
  return { start: startH, end: startH + 120 };
}

// Berekent begin/eind van de agenda-afspraak als echte UTC-momenten, geklemd op
// het venster 10:00–zonsondergang (NL-tijd) voor de spot.
export function computeEventWindow(day: DailySummary, spot: SurfSpot): { start: Date; end: Date } {
  const raw = rawWindowMinutes(day);
  const dayStart = SESSION_START_HOUR * 60; // 10:00
  const sunset = sunsetInstant(spot.lat, spot.lng, day.dateStr);
  let dayEnd = sunset ? instantToNlMinutes(sunset) : 21 * 60; // fallback 21:00
  if (dayEnd <= dayStart) dayEnd = dayStart + 120; // veiligheid

  let start = Math.min(Math.max(raw.start, dayStart), dayEnd);
  let end = Math.min(Math.max(raw.end, dayStart), dayEnd);
  if (end <= start) {
    end = Math.min(dayEnd, start + 120);
    if (end <= start) { start = Math.max(dayStart, dayEnd - 60); end = dayEnd; }
  }

  return {
    start: amsterdamWallClockToUTC(day.dateStr, start),
    end: amsterdamWallClockToUTC(day.dateStr, end),
  };
}

// Formatteert een Date als UTC-stempel voor de Google Calendar-template
// (YYYYMMDDTHHMMSSZ). Google rekent dit om naar de lokale zone van de kijker.
function toGCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Bouwt een vooringevulde Google Calendar-afspraak-URL (action=TEMPLATE).
// Eén tik op "Opslaan" in de agenda; geen extra Google-rechten nodig.
export function buildSurfCalendarUrl(day: DailySummary, spot: SurfSpot): string {
  const { start, end } = computeEventWindow(day, spot);

  const title = `🏄 Surfen bij ${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)`;

  const details = [
    day.summaryNarrative,
    '',
    `Golven: ${day.waveHeight.display} (face ${day.waveHeight.breakingFace}) • ${day.period}s • ${day.waveHeight.dirLabel}`,
    `Wind: ${day.wind.bftRange} ${day.wind.dirLabel} — ${day.wind.classificationLabel}`,
    `Water: ${day.waterTempAvg}°C • Wetsuit: ${day.gearAdvice.wetsuit}`,
    `Board: ${day.gearAdvice.board}`,
    day.bestWindow?.timeRange ? `Beste venster: ${day.bestWindow.timeRange}` : '',
    '',
    'Gepland via NzSurf 🌊',
  ]
    .filter((l) => l !== null && l !== undefined)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGCalStamp(start)}/${toGCalStamp(end)}`,
    details,
    location: spot.name,
    ctz: TIMEZONE,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Opent een externe URL: in de APK via de systeembrowser (_system),
// op het web in een nieuw tabblad.
export function openExternalUrl(url: string): void {
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_system');
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
