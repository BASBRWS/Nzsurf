// Test de e-mailketen los van Firestore/voorspelling: stuurt één testmail met een
// voorbeeld-agenda-uitnodiging (.ics METHOD:REQUEST) naar TEST_TO.
//
// Draaien:  bun run scripts/mail-test.ts
// Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, TEST_TO.

import nodemailer from 'nodemailer';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Ontbrekende env-var: ${name}`);
  return v;
}

const smtp = {
  host: req('SMTP_HOST'),
  port: Number(process.env.SMTP_PORT || '465'),
  user: req('SMTP_USER'),
  pass: req('SMTP_PASS'),
  from: req('MAIL_FROM', 'NzSurf'),
};
const to = req('TEST_TO', 'sebastiaan.boom@gmail.com');

// Strato eist dat de From exact de ingelogde mailbox is; MAIL_FROM = alleen de naam.
const senderAddress = smtp.user;
const fromName = (smtp.from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || 'NzSurf').trim();

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Voorbeeld-sessie: morgen 08:00–10:00 lokaal.
const start = new Date();
start.setDate(start.getDate() + 1);
start.setHours(8, 0, 0, 0);
const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
const uid = `nzsurf-test-${Date.now()}@nzsurf`;

const ics = [
  'BEGIN:VCALENDAR', 'PRODID:-//NzSurf//Surf Alerts//NL', 'VERSION:2.0',
  'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
  `UID:${uid}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
  'SUMMARY:🏄 TEST — Surfsessie NzSurf', 'DESCRIPTION:Dit is een testuitnodiging van NzSurf.',
  'LOCATION:Ouddorp (P Noordweg)', `ORGANIZER;CN=NzSurf:mailto:${senderAddress}`,
  `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${to}`,
  'SEQUENCE:0', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');

async function main() {
  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  // Niet-geheime vormcontrole (GitHub maskeert de geheime waarden zelf).
  console.log(`Diag: SMTP_USER bevat '@': ${smtp.user.includes('@')} | domein: ${smtp.user.split('@')[1] || '(geen domein!)'}`);
  console.log(`Diag: MAIL_FROM domein: ${(smtp.from.match(/@([^>\s]+)/)?.[1]) || '(geen adres in MAIL_FROM — alleen naam, dat is ok)'}`);
  console.log(`Versturen naar ${to} via ${smtp.host}:${smtp.port} als ${senderAddress} ...`);
  const info = await transporter.sendMail({
    from: { name: fromName, address: senderAddress },
    sender: senderAddress,
    envelope: { from: senderAddress, to },
    to,
    subject: '🏄 NzSurf test — agenda-uitnodiging',
    text: 'Dit is een testmail van NzSurf. Als je dit ziet, werkt de mailketen. Er zit een voorbeeld-agenda-uitnodiging bij.',
    html: '<p>Dit is een <b>testmail van NzSurf</b>. Werkt de mailketen? Dan zie je hieronder ook een agenda-uitnodiging die je kunt toevoegen.</p>',
    icalEvent: { method: 'REQUEST', content: ics, filename: 'nzsurf-test.ics' },
  });
  console.log(`Verstuurd. messageId=${info.messageId} response=${info.response}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('Test mislukt:', err); process.exit(1); });
