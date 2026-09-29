# NzSurf API-proxy (voor AI-advies in de APK)

De APK heeft geen eigen backend, dus de AI-aanroepen (`/api/gemini/generateContent`
en `/api/moderate-image`) mislukten met _"Server endpoint gaf geen JSON terug ...
`<!doctype html>`"_. Deze kleine PHP-proxy op je eigen hosting lost dat op: hij
stuurt de verzoeken door naar de Google Gemini API, met de API-sleutel veilig
server-side.

## Bestanden
- `api-proxy.php` — de proxy (advies + beeldmoderatie).
- `.htaccess` — routeert `api/...` naar `api-proxy.php` en beschermt sleutelbestanden.

## Installatie (eenmalig)

### 1. Gemini API-sleutel invullen
Open `api-proxy.php` en zet bovenin bij `GEMINI_API_KEY` je Google Gemini
API-sleutel (te maken op https://aistudio.google.com/apikey). PHP-broncode wordt
niet aan bezoekers uitgeleverd, dus de sleutel blijft server-side.

### 2. Uploaden naar je hosting
Upload **`api-proxy.php`** en **`.htaccess`** naar de map die publiek bereikbaar is op:
```
https://www.etaksinsights.nl/noordzeesurf/
```
(In je Strato-webspace is dat de map `noordzeesurf`.)

### 3. Testen in de browser
Open (met een POST-tool, of controleer dat je geen HTML terugkrijgt):
```
https://www.etaksinsights.nl/noordzeesurf/api/gemini/generateContent
```
Een GET geeft `Method not allowed` (JSON) — dat is goed: het betekent dat de
route werkt en PHP draait (geen `<!doctype html>` meer).

### 4. De app naar de proxy laten wijzen
In GitHub → **Settings → Secrets and variables → Actions → Variables** →
**New repository variable**:

| Name | Value |
|------|-------|
| `VITE_API_BASE` | `https://www.etaksinsights.nl/noordzeesurf` |

(Let op: **zonder** afsluitende slash. Het is een *Variable*, geen Secret.)

### 5. APK opnieuw bouwen
Push iets of draai **Actions → "Build Android APK" → Run workflow**. De nieuwe APK
gebruikt dan de proxy en het AI-advies werkt. Zonder deze variabele valt de app
netjes terug op de offline adviesmotor (geen crash).

## Hoe het werkt
De app bouwt de URL als `VITE_API_BASE + "/api/gemini/generateContent"`. De
`.htaccess` stuurt dat naar `api-proxy.php`, die het verzoek (`{ model, contents,
config }`) doorzet naar Gemini en `{ text }` teruggeeft — exact wat de webversie
via `server.ts` doet.

> Tip: de moderatie-API-sleutel en de advies-sleutel zijn dezelfde Gemini-sleutel.
> Eén sleutel volstaat.
