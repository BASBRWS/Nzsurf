// NzSurf server-monitoring — draait op de GitHub Actions-runner (cron).
//
// Mailt automatisch een agenda-uitnodiging (.ics METHOD:REQUEST) naar iedere
// gebruiker die "Agenda-afspraak bij topdagen" aan heeft staan, zodra de surf op
// zijn favoriete spot score >= 7,0 haalt. Google Agenda toont dat als afspraak-
// verzoek — ook als de app/site dicht is. Geen Firebase CLI of Blaze nodig.
//
// Draaien:  bun run scripts/surf-calendar-monitor.ts
// Vereist env: FIREBASE_SERVICE_ACCOUNT (JSON), SMTP_HOST, SMTP_PORT, SMTP_USER,
//              SMTP_PASS, MAIL_FROM. Optioneel: FIRESTORE_DATABASE_ID.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { parseISO, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { SurfSpot, UserProfile } from '../src/types';
import { DEFAULT_SPOTS } from '../src/constants';
import { fetchForecast } from '../src/services/weatherService';
import { processDailyForecasts, DailySummary } from '../src/utils/dailyForecastUtils';

// ── Instellingen ────────────────────────────────────────────────────────────
const MONITOR_THRESHOLD = 7.0; // gelijk aan de in-app knop
const HORIZON_DAYS = 5;
const TIMEZONE = 'Europe/Amsterdam';
// De named Firestore-database die de app gebruikt (firebase-applet-config.json).
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10';

// ── Env / secrets ─────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Ontbrekende env-var: ${name}`);
  return v;
}

const smtp = {
  host: requireEnv('SMTP_HOST'),
  port: Number(process.env.SMTP_PORT || '465'),
  user: requireEnv('SMTP_USER'),
  pass: requireEnv('SMTP_PASS'),
  from: requireEnv('MAIL_FROM'),
};

// ── Firebase admin ──────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(requireEnv('FIREBASE_SERVICE_ACCOUNT'));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app, DATABASE_ID);

// ── iCalendar (.ics) REQUEST ────────────────────────────────────────────────
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEsc(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) { parts.push(' ' + rest.slice(0, 74)); rest = rest.slice(74); }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}
function buildIcs(o: {
  uid: string; start: Date; end: Date; summary: string; description: string;
  location: string; organizerEmail: string; attendeeEmail: string; attendeeName?: string;
}): string {
  const now = icsStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//NzSurf//Surf Alerts//NL', 'VERSION:2.0',
    'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${o.uid}`, `DTSTAMP:${now}`, `DTSTART:${icsStamp(o.start)}`, `DTEND:${icsStamp(o.end)}`,
    `SUMMARY:${icsEsc(o.summary)}`, `DESCRIPTION:${icsEsc(o.description)}`, `LOCATION:${icsEsc(o.location)}`,
    `ORGANIZER;CN=NzSurf:mailto:${o.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${o.attendeeName ? `;CN=${icsEsc(o.attendeeName)}` : ''}:mailto:${o.attendeeEmail}`,
    'SEQUENCE:0', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Surfsessie komt eraan', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function resolveSpot(user: UserProfile): SurfSpot {
  const all: SurfSpot[] = [...DEFAULT_SPOTS, ...(user.savedSpots || [])];
  if (user.favoriteSpotId) {
    const m = all.find((s) => s.id === user.favoriteSpotId);
    if (m) return m;
  }
  return DEFAULT_SPOTS[0];
}
function resolveWindow(day: DailySummary): { start: Date; end: Date } {
  const range = day.bestWindow?.timeRange;
  const m = range ? range.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/) : null;
  if (m) {
    const [, sh, sm, eh, em] = m;
    const start = new Date(`${day.dateStr}T${sh.padStart(2, '0')}:${sm}:00`);
    const end = new Date(`${day.dateStr}T${eh.padStart(2, '0')}:${em}:00`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) return { start, end };
  }
  const start = parseISO(day.bestHourData.timestamp);
  return { start, end: new Date(start.getTime() + 2 * 60 * 60 * 1000) };
}
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function addDaysKey(key: string, days: number): string {
  const d = parseISO(key);
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}
function buildDescription(day: DailySummary, spot: SurfSpot): string {
  return [
    day.summaryNarrative, '',
    `Golven: ${day.waveHeight.display} (face ${day.waveHeight.breakingFace}) • ${day.period}s • ${day.waveHeight.dirLabel}`,
    `Wind: ${day.wind.bftRange} ${day.wind.dirLabel} — ${day.wind.classificationLabel}`,
    `Water: ${day.waterTempAvg}°C • Wetsuit: ${day.gearAdvice.wetsuit}`,
    `Board: ${day.gearAdvice.board}`,
    day.bestWindow?.timeRange ? `Beste venster: ${day.bestWindow.timeRange}` : '',
    '', `Gepland door NzSurf 🌊 (score ${day.ratingScore.toFixed(1)}/10)`,
  ].filter((l) => l !== '').join('\n');
}

// ── Hoofdlogica ─────────────────────────────────────────────────────────────
async function main() {
  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  // Strato weigert (DMARC) elke From die niet exact de ingelogde mailbox is.
  // Daarom forceren we het afzenderadres op smtp.user; MAIL_FROM levert alleen de
  // weergavenaam (bijv. "NzSurf").
  const senderAddress = smtp.user;
  const organizerEmail = senderAddress;
  const fromName = (smtp.from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || 'NzSurf').trim();

  const today = todayKey();
  const horizonEnd = addDaysKey(today, HORIZON_DAYS);

  const snap = await db.collection('users').get();
  let scanned = 0, sent = 0;

  for (const docSnap of snap.docs) {
    const user = docSnap.data() as UserProfile;
    const uid = user.uid || docSnap.id;
    if (!user.email) continue;
    if (user.calendarAlertsEnabled === false) continue; // default aan
    scanned++;

    const spot = resolveSpot(user);
    let summaries: DailySummary[];
    try {
      const forecast = await fetchForecast(spot);
      summaries = processDailyForecasts(forecast, spot, user, true);
    } catch (err) {
      console.warn(`Voorspelling mislukt voor ${uid} (${spot.name}):`, err);
      continue;
    }

    for (const day of summaries) {
      if (day.ratingScore < MONITOR_THRESHOLD) continue;
      if (day.dateStr < today || day.dateStr > horizonEnd) continue;

      const dedupeId = `${uid}_${spot.id}_${day.dateStr}`;
      const dedupeRef = db.collection('calendarAlertsSent').doc(dedupeId);
      if ((await dedupeRef.get()).exists) continue;

      const { start, end } = resolveWindow(day);
      const prettyDate = format(parseISO(day.dateStr), 'EEEE d MMMM', { locale: nl });
      const summary = `🏄 Surfen bij ${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)`;
      const description = buildDescription(day, spot);
      const ics = buildIcs({
        uid: `${dedupeId}@nzsurf`, start, end, summary, description,
        location: spot.name, organizerEmail, attendeeEmail: user.email, attendeeName: user.displayName,
      });
      const html =
        `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">` +
        `<h2 style="margin:0 0 4px">🏄 Topsurf op ${prettyDate}</h2>` +
        `<p style="color:#0e7490;font-weight:bold;margin:0 0 12px">${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)</p>` +
        `<p style="white-space:pre-line;color:#334155;line-height:1.5">${description}</p>` +
        `<p style="color:#64748b;font-size:12px;margin-top:16px">Automatisch verstuurd omdat je in NzSurf "Agenda-afspraak bij topdagen" aan hebt staan. Uitzetten kan in je profiel.</p></div>`;

      try {
        await transporter.sendMail({
          from: { name: fromName, address: senderAddress },
          sender: senderAddress,
          envelope: { from: senderAddress, to: user.email },
          to: user.email, subject: summary, text: description, html,
          icalEvent: { method: 'REQUEST', content: ics, filename: 'surfsessie.ics' },
        });
        await dedupeRef.set({
          uid, spotId: spot.id, spotName: spot.name, dateStr: day.dateStr,
          score: day.ratingScore, sentAt: new Date().toISOString(),
        });
        sent++;
        console.log(`Invite verstuurd: ${user.email} — ${spot.name} ${day.dateStr} (${day.ratingScore})`);
      } catch (err) {
        console.error(`Versturen mislukt voor ${user.email} (${day.dateStr}):`, err);
      }
    }
  }

  console.log(`Monitor klaar: ${scanned} gebruikers gescand, ${sent} invites verstuurd.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
