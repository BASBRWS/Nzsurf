# Agenda-functie toevoegen in Google AI Studio (de site)

Deze functie zit al in de GitHub-code (APK). Om hem óók in de **site** te krijgen,
voeg je onderstaande 4 wijzigingen toe in je AI Studio-project. Volgorde maakt niet uit,
maar begin met **stap 1** (nieuw bestand), want de andere stappen verwijzen ernaar.

---

## Stap 1 — NIEUW bestand: `src/utils/calendarUtils.ts`

Maak dit bestand aan en plak exact deze inhoud:

```ts
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
```

> LET OP: dit bestand importeert `@capacitor/core`. Dat pakket zit al in je project
> sinds de Capacitor-toevoeging. Zit het toch niet in de site-omgeving? Vervang dan
> de import + `openExternalUrl` door de simpele web-variant onderaan dit document
> (zie "Alternatief zonder Capacitor").

---

## Stap 2 — `src/types.ts`

Zoek de `interface UserProfile { ... }` en voeg dit veld toe (bijv. onder `favoriteSpotId`):

```ts
  calendarAlertsEnabled?: boolean; // toon "Zet in agenda" bij topdagen (score >= 7.5). Default aan.
```

---

## Stap 3 — `src/components/CompactDailyForecast.tsx`

**3a.** Voeg bovenaan bij de imports toe (onder de bestaande util-imports):

```ts
import { shouldOfferCalendar, buildSurfCalendarUrl, openExternalUrl } from '../utils/calendarUtils';
```

**3b.** Voeg in de `lucide-react`-import het icoon `CalendarPlus` toe, bijv.:

```ts
import {
  // ...bestaande iconen...
  ShieldCheck,
  CalendarPlus
} from 'lucide-react';
```

**3c.** Zoek de kaart-footer (`{/* 6. Card Footer Actions */}`). Vervang het bestaande
"Uur-voor-uur Details"-knopblok door dit blok (de agenda-knop staat ervóór):

```tsx
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {shouldOfferCalendar(day, isLoggedIn, user.calendarAlertsEnabled) && (
                      <button
                        onClick={() => openExternalUrl(buildSurfCalendarUrl(day, spot))}
                        title="Zet deze topsessie in je Google Agenda"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all shadow-sm cursor-pointer"
                      >
                        <CalendarPlus className="w-4 h-4 shrink-0" />
                        <span>Zet in agenda</span>
                      </button>
                    )}

                    <button
                      onClick={() => onSelectForecastHour(day.bestHourData)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-cyan-600 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all shadow-sm cursor-pointer"
                    >
                      <span>Uur-voor-uur Details</span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
```

> De component krijgt al `isLoggedIn`, `user` en `spot` als props binnen — er hoeft
> dus niets aan de props-interface te veranderen.

---

## Stap 4 — `src/components/ProfileSettings.tsx`

**4a.** Voeg bij de imports toe:

```ts
import { CALENDAR_ALERT_THRESHOLD } from '../utils/calendarUtils';
```

En voeg in de `lucide-react`-import `CalendarCheck` toe.

**4b.** Zoek de regel `const updateSkill = ...` en voeg er direct onder toe:

```ts
  const updateCalendarAlerts = (enabled: boolean) => onUpdate({ ...user, calendarAlertsEnabled: enabled });
```

**4c.** Zoek in de `settings`-tab de sectie "Jouw Gegevens" (met gewicht + niveau).
Voeg direct ná die `</section>` deze nieuwe sectie in:

```tsx
          {/* Meldingen: agenda-afspraak bij topdagen */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-cyan-600" />
              </div>
              <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-500">Agenda & Meldingen</h3>
            </div>

            <label
              htmlFor="calendarAlerts"
              className="flex items-center justify-between gap-4 bg-white/90 backdrop-blur-md shadow-sm border border-slate-200 rounded-2xl px-5 py-4 cursor-pointer hover:border-cyan-400 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">Agenda-afspraak bij topdagen</div>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                  Toont een <span className="font-semibold text-emerald-700">"Zet in agenda"</span>-knop wanneer de surf echt goed is
                  (score ≥ {CALENDAR_ALERT_THRESHOLD.toFixed(1)}). Eén tik zet een vooringevulde afspraak in je Google Agenda.
                  Werkt als je met Google bent ingelogd.
                </p>
              </div>
              <div className="relative shrink-0">
                <input
                  id="calendarAlerts"
                  type="checkbox"
                  className="peer sr-only"
                  checked={user.calendarAlertsEnabled !== false}
                  onChange={(e) => updateCalendarAlerts(e.target.checked)}
                />
                <div className="w-11 h-6 rounded-full bg-slate-300 peer-checked:bg-emerald-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </section>
```

---

## Alternatief zonder Capacitor (mocht `@capacitor/core` in de site ontbreken)

Vervang in `src/utils/calendarUtils.ts` de bovenste import en de functie
`openExternalUrl` door deze web-only versie:

```ts
// (verwijder de regel: import { Capacitor } from '@capacitor/core';)

export function openExternalUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
```

De rest van het bestand blijft identiek.

---

## Klaar

Na deze 4 stappen zit de agenda-functie ook in de site. Test: log in met Google,
open een dag met score ≥ 7,5 → er verschijnt een groene **"Zet in agenda"**-knop.
Uitzetten kan via **Profiel → Agenda & Meldingen**.
