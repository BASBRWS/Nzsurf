import { Capacitor } from '@capacitor/core';
import { parseISO } from 'date-fns';
import { SurfSpot } from '../types';
import { DailySummary } from './dailyForecastUtils';

// Drempel waarboven een dag "echt goed" is en we een agenda-afspraak aanbieden.
export const CALENDAR_ALERT_THRESHOLD = 7.5;

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

// Formatteert een Date als UTC-stempel voor de Google Calendar-template
// (YYYYMMDDTHHMMSSZ). Google rekent dit om naar de lokale zone van de kijker.
function toGCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Leidt begin/eind van de afspraak af uit het beste sessievenster van de dag.
// Valt terug op het beste uur (+2 uur) als het venster niet te parsen is.
function resolveWindow(day: DailySummary): { start: Date; end: Date } {
  const range = day.bestWindow?.timeRange;
  const m = range ? range.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/) : null;
  if (m) {
    const [, sh, sm, eh, em] = m;
    const start = new Date(`${day.dateStr}T${sh.padStart(2, '0')}:${sm}:00`);
    const end = new Date(`${day.dateStr}T${eh.padStart(2, '0')}:${em}:00`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      return { start, end };
    }
  }
  const start = parseISO(day.bestHourData.timestamp);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start, end };
}

// Bouwt een vooringevulde Google Calendar-afspraak-URL (action=TEMPLATE).
// Eén tik op "Opslaan" in de agenda; geen extra Google-rechten nodig.
export function buildSurfCalendarUrl(day: DailySummary, spot: SurfSpot): string {
  const { start, end } = resolveWindow(day);

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
