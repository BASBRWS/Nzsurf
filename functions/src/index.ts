import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseISO, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { SurfSpot, UserProfile } from './app/types';
import { DEFAULT_SPOTS } from './app/constants';
import { fetchForecast } from './app/services/weatherService';
import { processDailyForecasts, DailySummary } from './app/utils/dailyForecastUtils';
import { buildIcsRequest } from './ics';
import { sendInvite, SmtpConfig } from './mailer';

// ── Instellingen ──────────────────────────────────────────────────────────
// Drempel voor de e-mail-monitor. Gelijk aan de in-app knop (CALENDAR_ALERT_THRESHOLD).
const MONITOR_THRESHOLD = 7.0;
// Hoeveel dagen vooruit we alerteren (voorkomt spam over verre voorspellingen).
const HORIZON_DAYS = 5;
// De named Firestore-database die de app gebruikt (firebase-applet-config.json).
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10';
const REGION = 'europe-west1';
const TIMEZONE = 'Europe/Amsterdam';

// ── Secrets (zet via: firebase functions:secrets:set NAAM) ──────────────────
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const MAIL_FROM = defineSecret('MAIL_FROM');

initializeApp();
const dbPromise = () => getFirestore(DATABASE_ID);

function smtpFromSecrets(): SmtpConfig {
  return {
    host: SMTP_HOST.value(),
    port: Number(SMTP_PORT.value()) || 587,
    user: SMTP_USER.value(),
    pass: SMTP_PASS.value(),
    from: MAIL_FROM.value(),
  };
}

// Vindt de spot van een gebruiker: favoriet uit standaard- of eigen spots.
function resolveSpot(user: UserProfile): SurfSpot {
  const all: SurfSpot[] = [...DEFAULT_SPOTS, ...(user.savedSpots || [])];
  if (user.favoriteSpotId) {
    const match = all.find((s) => s.id === user.favoriteSpotId);
    if (match) return match;
  }
  return DEFAULT_SPOTS[0];
}

// Leidt begin/eind af uit het beste sessievenster; valt terug op beste uur +2u.
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

// Vandaag als yyyy-MM-dd in NL-tijd (voor horizon-filter; strings vergelijken werkt).
function todayKeyAmsterdam(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // en-CA => YYYY-MM-DD
}

function addDaysKey(key: string, days: number): string {
  const d = parseISO(key);
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}

function buildDescription(day: DailySummary, spot: SurfSpot): string {
  return [
    day.summaryNarrative,
    '',
    `Golven: ${day.waveHeight.display} (face ${day.waveHeight.breakingFace}) • ${day.period}s • ${day.waveHeight.dirLabel}`,
    `Wind: ${day.wind.bftRange} ${day.wind.dirLabel} — ${day.wind.classificationLabel}`,
    `Water: ${day.waterTempAvg}°C • Wetsuit: ${day.gearAdvice.wetsuit}`,
    `Board: ${day.gearAdvice.board}`,
    day.bestWindow?.timeRange ? `Beste venster: ${day.bestWindow.timeRange}` : '',
    '',
    `Gepland door NzSurf 🌊 (score ${day.ratingScore.toFixed(1)}/10)`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

// De kern: loopt door alle opt-in gebruikers en verstuurt agenda-verzoeken.
async function runMonitor(): Promise<{ scanned: number; sent: number }> {
  const db = dbPromise();
  const smtp = smtpFromSecrets();

  const today = todayKeyAmsterdam();
  const horizonEnd = addDaysKey(today, HORIZON_DAYS);

  const snap = await db.collection('users').get();
  let scanned = 0;
  let sent = 0;

  for (const docSnap of snap.docs) {
    const user = docSnap.data() as UserProfile;
    const uid = user.uid || docSnap.id;

    // Alleen ingelogde gebruikers met e-mail en de optie aan (default aan).
    if (!user.email) continue;
    if (user.calendarAlertsEnabled === false) continue;
    scanned++;

    const spot = resolveSpot(user);

    let summaries: DailySummary[];
    try {
      const forecast = await fetchForecast(spot);
      summaries = processDailyForecasts(forecast, spot, user, true);
    } catch (err) {
      logger.warn(`Voorspelling mislukt voor ${uid} (${spot.name})`, err);
      continue;
    }

    for (const day of summaries) {
      if (day.ratingScore < MONITOR_THRESHOLD) continue;
      if (day.dateStr < today || day.dateStr > horizonEnd) continue;

      // Ontdubbelen: per gebruiker/spot/dag maar één keer versturen.
      const dedupeId = `${uid}_${spot.id}_${day.dateStr}`;
      const dedupeRef = db.collection('calendarAlertsSent').doc(dedupeId);
      const already = await dedupeRef.get();
      if (already.exists) continue;

      const { start, end } = resolveWindow(day);
      const prettyDate = format(parseISO(day.dateStr), 'EEEE d MMMM', { locale: nl });
      const summary = `🏄 Surfen bij ${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)`;
      const description = buildDescription(day, spot);

      const ics = buildIcsRequest({
        uid: `${dedupeId}@nzsurf`,
        start,
        end,
        summary,
        description,
        location: spot.name,
        organizerEmail: smtp.from.replace(/^.*<|>.*$/g, '') || smtp.user,
        attendeeEmail: user.email,
        attendeeName: user.displayName,
      });

      const html = `
        <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">
          <h2 style="margin:0 0 4px">🏄 Topsurf op ${prettyDate}</h2>
          <p style="color:#0e7490;font-weight:bold;margin:0 0 12px">${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)</p>
          <p style="white-space:pre-line;color:#334155;line-height:1.5">${description}</p>
          <p style="color:#64748b;font-size:12px;margin-top:16px">
            Deze uitnodiging is automatisch verstuurd omdat je in NzSurf "Agenda-afspraak bij topdagen" hebt aanstaan.
            Uitzetten kan in je profiel.
          </p>
        </div>`;

      try {
        await sendInvite(smtp, {
          to: user.email,
          subject: summary,
          text: description,
          html,
          ics,
        });
        await dedupeRef.set({
          uid,
          spotId: spot.id,
          spotName: spot.name,
          dateStr: day.dateStr,
          score: day.ratingScore,
          sentAt: new Date().toISOString(),
        });
        sent++;
        logger.info(`Invite verstuurd: ${user.email} — ${spot.name} ${day.dateStr} (${day.ratingScore})`);
      } catch (err) {
        logger.error(`Versturen mislukt voor ${user.email} (${day.dateStr})`, err);
      }
    }
  }

  logger.info(`Monitor klaar: ${scanned} gebruikers gescand, ${sent} invites verstuurd.`);
  return { scanned, sent };
}

// Draait automatisch 2×/dag (07:00 en 18:00 NL-tijd), los van app/site.
export const surfCalendarMonitor = onSchedule(
  {
    schedule: '0 7,18 * * *',
    timeZone: TIMEZONE,
    region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM],
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    await runMonitor();
  }
);

// Handmatig triggeren om te testen (beveiligd met een geheim token).
// Aanroepen: https://<region>-<project>.cloudfunctions.net/surfCalendarMonitorNow?token=<TRIGGER_TOKEN>
const TRIGGER_TOKEN = defineSecret('TRIGGER_TOKEN');
export const surfCalendarMonitorNow = onRequest(
  {
    region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, TRIGGER_TOKEN],
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (req, res) => {
    if (req.query.token !== TRIGGER_TOKEN.value()) {
      res.status(403).send('Forbidden');
      return;
    }
    const result = await runMonitor();
    res.status(200).json({ ok: true, ...result });
  }
);
