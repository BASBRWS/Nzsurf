# NzSurf agenda-monitor (volledig web-only, geen terminal)

Deze monitor draait als **GitHub Actions-taak** (net als je APK-build) en mailt
automatisch een **agenda-uitnodiging (.ics)** naar iedere gebruiker die in zijn
profiel "Agenda-afspraak bij topdagen" aan heeft staan, zodra de surf op zijn
favoriete spot **score ≥ 7,0** haalt. Google Agenda toont dat als afspraakverzoek —
ook als de app/site dicht is. Geen Firebase CLI, geen Blaze nodig.

Je hoeft alleen in **twee websites** wat in te stellen: de Firebase-console en GitHub.

---

## Stap 1 — Firebase-console: service-account-sleutel downloaden

1. Ga naar de [Firebase-console](https://console.firebase.google.com/) → jouw project.
2. ⚙️ (Project settings) → tabblad **Service accounts**.
3. Klik **Generate new private key** → **Generate key**. Er wordt een **JSON-bestand**
   gedownload. Open dat bestand en kopieer de **volledige inhoud** (alles, van `{` tot `}`).

> Deze sleutel geeft de monitor lees/schrijf-toegang tot je database. Bewaar hem veilig;
> plak hem straks alleen als GitHub-secret (komt niet in de code).

---

## Stap 2 — GitHub: secrets toevoegen

Ga naar je repo op GitHub → **Settings** → **Secrets and variables** → **Actions** →
knop **New repository secret**. Voeg deze zes toe:

| Naam | Waarde |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT` | de volledige JSON-inhoud uit stap 1 |
| `SMTP_HOST` | `smtp.strato.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `webmaster@noordzeesurf.nl` |
| `SMTP_PASS` | het wachtwoord van die mailbox |
| `MAIL_FROM` | `NzSurf <webmaster@noordzeesurf.nl>` |

(Optioneel, alleen als je database-ID afwijkt: maak onder **Variables** een variabele
`FIRESTORE_DATABASE_ID`. Standaard gebruikt de monitor de app-database uit
`firebase-applet-config.json`.)

---

## Stap 3 — Testen (handmatig, via de website)

1. Repo → tabblad **Actions** → links **"Surf agenda-monitor"**.
2. Knop **Run workflow** → **Run workflow**.
3. Open de run en bekijk het log. Onderaan zie je bijv.:
   `Monitor klaar: 1 gebruikers gescand, 0 invites verstuurd.`
   (`0` verstuurd = er is nu simpelweg geen dag met score ≥ 7,0.)

> Let op: de **automatische 2×/dag-planning werkt pas als dit op de `main`-branch staat.**
> GitHub draait geplande (cron) workflows alleen vanaf de standaardbranch. Merge de
> branch dus naar `main` (via een pull request op github.com) om de dagelijkse runs te
> activeren. De handmatige testknop werkt ook zonder merge.

---

## Hoe het werkt

- **Wanneer:** automatisch om ~07:00 en ~18:00 NL-tijd (cron staat in UTC in
  `.github/workflows/surf-calendar-monitor.yml`), plus handmatig via de Run-knop.
- **Wie:** iedere `users`-record met een e-mailadres én de toggle niet uit (default aan).
- **Welke spot:** de favoriete spot van de gebruiker, anders de eerste standaardspot.
- **Score:** exact dezelfde berekening als de app (`src/utils/dailyForecastUtils.ts`).
- **Ontdubbeling:** max. één uitnodiging per gebruiker/spot/dag
  (Firestore-collectie `calendarAlertsSent`). Wil je opnieuw sturen? Verwijder het
  betreffende document daar.
- **Drempel/horizon:** ≥ 7,0 en dagen tot 5 dagen vooruit
  (`MONITOR_THRESHOLD` / `HORIZON_DAYS` bovenin `scripts/surf-calendar-monitor.ts`).

---

## Aandachtspunten

- **Spam/aflevering:** je verstuurt vanaf je eigen Strato-adres, dat komt meestal netjes
  aan. Landt een testmail in spam, dan helpt een **SPF-record** in de DNS van
  `noordzeesurf.nl` (ik zag er nu geen). Vraag het gerust, dan lever ik de exacte regel.
- **Named database:** de monitor leest `ai-studio-remixremixnoordz-…`. Zie je bij de test
  `0 gebruikers gescand` terwijl je zelf bent ingelogd met de toggle aan, dan staat je
  data in een andere database en pas ik de constante (of de `FIRESTORE_DATABASE_ID`
  variabele) aan.
