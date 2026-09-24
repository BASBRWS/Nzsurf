// Bouwt een iCalendar (.ics) met METHOD:REQUEST — dat toont Google Agenda
// automatisch als een afspraakVERZOEK in de agenda van de ontvanger, ook als
// de app/site dicht is. Geen Calendar-API of extra Google-rechten nodig.

export interface IcsInput {
  uid: string; // stabiel per dag/spot, zodat updates dezelfde afspraak zijn
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeName?: string;
}

function stamp(d: Date): string {
  // UTC-formaat: YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Escapet tekst volgens RFC 5545 (komma, puntkomma, backslash, newline).
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Vouwt regels langer dan 75 octetten volgens RFC 5545 (line folding).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

export function buildIcsRequest(input: IcsInput): string {
  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//NzSurf//Surf Alerts//NL',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(input.end)}`,
    `SUMMARY:${esc(input.summary)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `LOCATION:${esc(input.location)}`,
    `ORGANIZER;CN=NzSurf:mailto:${input.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${
      input.attendeeName ? `;CN=${esc(input.attendeeName)}` : ''
    }:mailto:${input.attendeeEmail}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT3H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Surfsessie komt eraan',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}
