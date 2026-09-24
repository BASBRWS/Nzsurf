import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string; // bijv. "NzSurf <alerts@nzsurf.nl>"
}

export interface InviteMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  ics: string; // iCalendar met METHOD:REQUEST
}

// Stuurt een e-mail met de agenda-uitnodiging. De `icalEvent` met method REQUEST
// zorgt dat Gmail/Google Agenda het als afspraakverzoek toont ("Toevoegen aan agenda").
export async function sendInvite(cfg: SmtpConfig, mail: InviteMail): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: cfg.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    icalEvent: {
      method: 'REQUEST',
      content: mail.ics,
      filename: 'surfsessie.ics',
    },
  });
}
