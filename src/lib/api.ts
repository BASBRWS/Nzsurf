/**
 * Basis-URL voor de server-side AI-endpoints (/api/*).
 *
 * In de webversie (zelfde origin als de Express-server) is dit leeg, zodat de
 * relatieve paden `/api/...` blijven werken. In de Android-APK laadt de webview
 * vanaf https://localhost en bestaat er geen lokale backend; zet dan bij de
 * build `VITE_API_BASE` naar de URL van de gedeployde server om de AI-features
 * te activeren. Blijft die leeg, dan valt de app netjes terug op de offline
 * adviesmotor.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
