import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, apiUrl } from '../lib/api';

// In de APK is er geen eigen server; de website draait dezelfde /api-route.
const SITE = 'https://www.noordzeesurf.nl';

/** Gemini via de server-route; in de APK zonder VITE_API_BASE via de website (native HTTP, geen CORS). */
export async function generateViaServer(body: unknown): Promise<string> {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    const res = await CapacitorHttp.post({ url: `${SITE}/api/gemini/generateContent`, headers: { 'Content-Type': 'application/json' }, data: body });
    let data: any = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { throw new Error(`server gaf geen JSON (HTTP ${res.status})`); }
    }
    if (res.status >= 400) throw new Error(data?.error || `HTTP ${res.status}`);
    return data?.text || '';
  }
  const res = await fetch(apiUrl('/api/gemini/generateContent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await res.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error(`server gaf geen JSON (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data?.text || '';
}
