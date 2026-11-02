// NzSurf server-monitoring — draait op de GitHub Actions-runner (cron).
//
// Mailt automatisch een agenda-uitnodiging (.ics METHOD:REQUEST) naar iedere
// gebruiker die "Agenda-afspraak bij topdagen" aan heeft staan, zodra de surf op
// zijn favoriete spot score >= 7,0 haalt. Google Agenda toont dat als afspraak-
// verzoek — ook als de app/site dicht is. Geen Firebase CLI of Blaze nodig.
//
// Wordt de verwachting slechter (score < 6,0, of de dag valt weg), dan volgt een
// annulering (METHOD:CANCEL, zelfde UID): de afspraak verdwijnt uit de agenda.
// Verschuift het beste venster ≥ 1 uur, dan een bijgewerkte uitnodiging. Wordt een
// geannuleerde dag weer goed, dan opnieuw een uitnodiging. Tussen 6 en 7 gebeurt
// niets, zodat een dag niet heen en weer springt.
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
import { withAreaDefaults } from '../src/utils/spotKnowledge';
import { processDailyForecasts, DailySummary } from '../src/utils/dailyForecastUtils';
import { computeEventWindow } from '../src/utils/calendarUtils';
import { applyV2WithCal, pickCalibration, type Cal } from '../src/services/v2Core';

// ── Instellingen ────────────────────────────────────────────────────────────
const MONITOR_THRESHOLD = 7.0; // gelijk aan de in-app knop
const CANCEL_THRESHOLD = 6.0;  // pas annuleren als het duidelijk slechter is
const MOVE_MIN_MS = 60 * 60e3; // venster ≥ 1 uur verschoven: bijwerken
const DRY_RUN = process.env.MONITOR_DRY_RUN === '1'; // alleen melden, niets mailen of opslaan
const dryLog: string[] = [];
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
  method?: 'REQUEST' | 'CANCEL'; sequence?: number;
}): string {
  const now = icsStamp(new Date());
  const method = o.method || 'REQUEST';
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//NzSurf//Surf Alerts//NL', 'VERSION:2.0',
    'CALSCALE:GREGORIAN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${o.uid}`, `DTSTAMP:${now}`, `DTSTART:${icsStamp(o.start)}`, `DTEND:${icsStamp(o.end)}`,
    `SUMMARY:${icsEsc(o.summary)}`, `DESCRIPTION:${icsEsc(o.description)}`, `LOCATION:${icsEsc(o.location)}`,
    `ORGANIZER;CN=NzSurf:mailto:${o.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${o.attendeeName ? `;CN=${icsEsc(o.attendeeName)}` : ''}:mailto:${o.attendeeEmail}`,
    `SEQUENCE:${o.sequence ?? 0}`, `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    ...(method === 'CANCEL' ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Surfsessie komt eraan', 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function resolveSpot(user: UserProfile): SurfSpot {
  const all: SurfSpot[] = [...DEFAULT_SPOTS, ...(user.savedSpots || [])];
  if (user.favoriteSpotId) {
    const m = all.find((s) => s.id === user.favoriteSpotId);
    if (m) return withAreaDefaults(m); // eigen spots erven gebiedskennis
  }
  return DEFAULT_SPOTS[0];
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

  const cals = (await db.collection('v2Calibration').get()).docs.map(d => d.data() as Cal);
  const snap = await db.collection('users').get();
  let scanned = 0, sent = 0, cancelled = 0;

  for (const docSnap of snap.docs) {
    const user = docSnap.data() as UserProfile;
    const uid = user.uid || docSnap.id;
    if (!user.email) continue;
    if (user.calendarAlertsEnabled === false) continue; // default aan
    scanned++;

    const spot = resolveSpot(user);
    let summaries: DailySummary[];
    try {
      // Zelfde verwachting als de app: v1 + v2-kalibratie (valt terug op v1).
      const base = await fetchForecast(spot);
      const { cal } = pickCalibration(spot, cals);
      const forecast = cal ? (await applyV2WithCal(spot, base, cal).catch(() => ({ data: base }))).data : base;
      summaries = processDailyForecasts(forecast, spot, user, true);
    } catch (err) {
      console.warn(`Voorspelling mislukt voor ${uid} (${spot.name}):`, err);
      continue;
    }

    const send = async (o: { subject: string; text: string; html: string; ics: string; method: 'REQUEST' | 'CANCEL' }) => {
      if (DRY_RUN) { dryLog.push(`${o.method === 'CANCEL' ? 'ANNULEER' : 'UITNODIG'} ${user.email?.replace(/^(.).*@/, '$1…@')}: ${o.subject} — ${o.text.slice(0, 90)}`); throw new Error('dry-run'); }
      await transporter.sendMail({
        from: { name: fromName, address: senderAddress },
        sender: senderAddress,
        envelope: { from: senderAddress, to: user.email },
        to: user.email, subject: o.subject, text: o.text, html: o.html,
        icalEvent: { method: o.method, content: o.ics, filename: o.method === 'CANCEL' ? 'surfsessie-geannuleerd.ics' : 'surfsessie.ics' },
      });
    };
    const byDate = new Map(summaries.map(d => [d.dateStr, d]));

    // 1) Nieuwe topdagen, verschoven vensters, en weer-goed na een annulering.
    for (const day of summaries) {
      if (day.ratingScore < MONITOR_THRESHOLD) continue;
      if (day.dateStr < today || day.dateStr > horizonEnd) continue;

      const dedupeId = `${uid}_${spot.id}_${day.dateStr}`;
      const dedupeRef = db.collection('calendarAlertsSent').doc(dedupeId);
      const prev = (await dedupeRef.get()).data() as { cancelledAt?: string; sequence?: number; start?: string } | undefined;
      const { start, end } = computeEventWindow(day, spot);
      const moved = prev && !prev.cancelledAt && prev.start && Math.abs(Date.parse(prev.start) - start.getTime()) >= MOVE_MIN_MS;
      if (prev && !prev.cancelledAt && !moved) continue;            // staat al goed in de agenda
      if (start.getTime() < Date.now()) continue;                   // al begonnen
      const sequence = prev ? (prev.sequence ?? 0) + 1 : 0;

      const prettyDate = format(parseISO(day.dateStr), 'EEEE d MMMM', { locale: nl });
      const summary = `🏄 Surfen bij ${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)`;
      const description = buildDescription(day, spot);
      const ics = buildIcs({
        uid: `${dedupeId}@nzsurf`, start, end, summary, description,
        location: spot.name, organizerEmail, attendeeEmail: user.email, attendeeName: user.displayName, sequence,
      });
      const head = moved ? `🔁 Ander tijdstip: ${prettyDate}` : prev?.cancelledAt ? `🏄 Toch goed: ${prettyDate}` : `🏄 Topsurf op ${prettyDate}`;
      const html =
        `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">` +
        `<h2 style="margin:0 0 4px">${head}</h2>` +
        `<p style="color:#0e7490;font-weight:bold;margin:0 0 12px">${spot.name} — ${day.ratingLabel} (${day.ratingScore.toFixed(1)}/10)</p>` +
        `<p style="white-space:pre-line;color:#334155;line-height:1.5">${description}</p>` +
        `<p style="color:#64748b;font-size:12px;margin-top:16px">Automatisch verstuurd omdat je in NzSurf "Agenda-afspraak bij topdagen" aan hebt staan. Wordt de verwachting slechter, dan annuleert NzSurf de afspraak. Uitzetten kan in je profiel.</p></div>`;

      try {
        await send({ subject: moved ? `🔁 ${summary}` : summary, text: description, html, ics, method: 'REQUEST' });
        await dedupeRef.set({
          uid, email: user.email, spotId: spot.id, spotName: spot.name, dateStr: day.dateStr,
          score: day.ratingScore, sentAt: new Date().toISOString(), sequence,
          start: start.toISOString(), end: end.toISOString(), summary, cancelledAt: null,
        }, { merge: true });
        sent++;
        console.log(`${moved ? 'Bijgewerkt' : prev?.cancelledAt ? 'Opnieuw' : 'Invite'}: ${user.email} — ${spot.name} ${day.dateStr} (${day.ratingScore})`);
      } catch (err) {
        if (!DRY_RUN) console.error(`Versturen mislukt voor ${user.email} (${day.dateStr}):`, err);
      }
    }

    // 2) Annuleren: verstuurde afspraken die nog moeten komen en nu duidelijk slechter zijn.
    const open = await db.collection('calendarAlertsSent').where('uid', '==', uid).get();
    for (const d of open.docs) {
      const a = d.data() as { spotId: string; spotName?: string; dateStr: string; cancelledAt?: string | null; sequence?: number; start?: string; end?: string; summary?: string; score?: number };
      if (a.cancelledAt || a.dateStr < today) continue;
      if (a.start && Date.parse(a.start) < Date.now()) continue;   // al begonnen: laten staan
      if (!a.start && a.dateStr === today) continue;               // oude afspraak zonder tijd: vandaag niet meer annuleren
      // Andere favoriete spot dan toen: die afspraak hoort niet meer bij deze verwachting.
      const now = a.spotId === spot.id ? byDate.get(a.dateStr) : undefined;
      const worse = a.spotId !== spot.id || !now || now.ratingScore < CANCEL_THRESHOLD;
      if (!worse) continue;
      // Oude afspraken (van vóór deze versie) hebben geen start/eind: venster opnieuw bepalen of een dag aannemen.
      const start = a.start ? new Date(a.start) : new Date(`${a.dateStr}T09:00:00`);
      const end = a.end ? new Date(a.end) : new Date(`${a.dateStr}T12:00:00`);
      const reason = a.spotId !== spot.id ? 'je favoriete spot is veranderd'
        : !now ? 'de dag valt niet meer binnen de verwachting'
        : `de verwachting is gezakt naar ${now.ratingScore.toFixed(1)}/10 (${now.ratingLabel})`;
      const prettyDate = format(parseISO(a.dateStr), 'EEEE d MMMM', { locale: nl });
      const summary = `❌ Geannuleerd: surfen bij ${a.spotName || spot.name} op ${prettyDate}`;
      const ics = buildIcs({
        uid: `${d.id}@nzsurf`, start, end, summary: a.summary || summary, description: `Geannuleerd door NzSurf: ${reason}.`,
        location: a.spotName || spot.name, organizerEmail, attendeeEmail: user.email, attendeeName: user.displayName,
        method: 'CANCEL', sequence: (a.sequence ?? 0) + 1,
      });
      const html =
        `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">` +
        `<h2 style="margin:0 0 4px">❌ Surfsessie geannuleerd</h2>` +
        `<p style="color:#334155;line-height:1.5">${a.spotName || spot.name}, ${prettyDate}: ${reason}. De afspraak is uit je agenda gehaald.</p>` +
        `<p style="color:#64748b;font-size:12px;margin-top:16px">Wordt het weer goed (score 7 of hoger), dan stuurt NzSurf een nieuwe uitnodiging.</p></div>`;
      try {
        await send({ subject: summary, text: `Geannuleerd: ${reason}.`, html, ics, method: 'CANCEL' });
        await d.ref.set({ cancelledAt: new Date().toISOString(), cancelReason: reason, sequence: (a.sequence ?? 0) + 1, cancelScore: now?.ratingScore ?? null }, { merge: true });
        cancelled++;
        console.log(`Geannuleerd: ${user.email} — ${a.spotName} ${a.dateStr} (${reason})`);
      } catch (err) {
        if (!DRY_RUN) console.error(`Annuleren mislukt voor ${user.email} (${a.dateStr}):`, err);
      }
    }
  }

  if (DRY_RUN) console.log(`::notice title=Agenda (proef)::${dryLog.length ? dryLog.join('%0A') : 'niets te doen'}`);
  console.log(`Monitor klaar: ${scanned} gebruikers gescand, ${sent} uitnodigingen, ${cancelled} annuleringen.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
