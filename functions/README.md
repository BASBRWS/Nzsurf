# NzSurf server-monitoring (agenda-uitnodiging bij topdagen)

Deze Cloud Function draait **los van de app/site** en mailt automatisch een
**agenda-uitnodiging (.ics, METHOD:REQUEST)** naar iedere gebruiker die in zijn
profiel "Agenda-afspraak bij topdagen" aan heeft staan, zodra de surf op zijn
favoriete spot **score ≥ 7,0** haalt. Google Agenda toont die mail automatisch
als afspraakverzoek — ook als niemand de app open heeft.

- **`surfCalendarMonitor`** — draait automatisch 2×/dag (07:00 en 18:00 NL-tijd).
- **`surfCalendarMonitorNow`** — handmatige test-trigger (HTTP, met geheim token).

De surfscore wordt berekend met **exact dezelfde code als de app** (gekopieerd
naar `src/app/` via `scripts/sync-functions-logic.sh`, draait automatisch bij deploy).

---

## Eenmalige setup

### 1. Firebase Blaze-plan
Cloud Functions (v2) vereist het **Blaze**-plan (pay-as-you-go). Bij dit lage
volume (2 runs/dag) blijf je vrijwel zeker binnen de gratis tier.
→ Firebase Console → ⚙️ → Usage and billing → wijzig naar Blaze.

### 2. E-mailverzender (SMTP)
Je hebt SMTP-gegevens nodig om te mailen. Twee makkelijke opties:

**Optie A — Resend (aanrader, gratis tier):**
- Maak account op resend.com, verifieer een afzenderdomein (of gebruik hun test-adres).
- SMTP: host `smtp.resend.com`, poort `465`, user `resend`, pass = je API-key.

**Optie B — Gmail met app-wachtwoord:**
- Zet 2FA aan op je Google-account → maak een "app-wachtwoord".
- SMTP: host `smtp.gmail.com`, poort `465`, user = je gmail, pass = app-wachtwoord.
- Afzender (`MAIL_FROM`) moet dan je eigen gmail zijn.

### 3. Secrets zetten
Vanuit de repo-root:

```bash
firebase functions:secrets:set SMTP_HOST      # bijv. smtp.resend.com
firebase functions:secrets:set SMTP_PORT      # bijv. 465
firebase functions:secrets:set SMTP_USER      # bijv. resend
firebase functions:secrets:set SMTP_PASS      # je API-key / app-wachtwoord
firebase functions:secrets:set MAIL_FROM      # bijv. "NzSurf <alerts@jouwdomein.nl>"
firebase functions:secrets:set TRIGGER_TOKEN  # zelf verzonnen geheim voor de testknop
```

### 4. Deployen
```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```
(De predeploy-stap synct automatisch de scorelogica en bouwt de functie.)

---

## Testen zonder te wachten op het schema
```bash
curl "https://europe-west1-<PROJECT_ID>.cloudfunctions.net/surfCalendarMonitorNow?token=<TRIGGER_TOKEN>"
```
Antwoord bijv. `{"ok":true,"scanned":3,"sent":1}`. Log bekijken: `firebase functions:log`.

---

## Belangrijke aandachtspunten

- **Database-ID.** De functie leest uit de named database die de app gebruikt:
  `ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10`
  (uit `firebase-applet-config.json`). Let op: `firebase.json` noemt een *andere*
  database-ID voor de rules — dat is bewust gescheiden. Klopt de app-database niet
  meer? Zet dan `FIRESTORE_DATABASE_ID` als env-var of pas de constante in
  `src/index.ts` aan.
- **Wie krijgt mail.** Iedere `users`-document met een `email` én
  `calendarAlertsEnabled` niet op `false` (default aan, gelijk aan de UI-toggle).
  Wil je strikt opt-in (alleen bij expliciet aangevinkt)? Wijzig in `src/index.ts`
  de check naar `user.calendarAlertsEnabled !== true → skip`.
- **Welke spot.** De favoriete spot van de gebruiker (`favoriteSpotId`), anders de
  eerste standaardspot.
- **Ontdubbeling.** Per gebruiker/spot/dag wordt maximaal één invite verstuurd
  (collectie `calendarAlertsSent`). Verwijder een document daar om opnieuw te sturen.
- **Drempel & horizon.** Score ≥ 7,0, en alleen dagen tot 5 dagen vooruit
  (`MONITOR_THRESHOLD` / `HORIZON_DAYS` bovenin `src/index.ts`).
