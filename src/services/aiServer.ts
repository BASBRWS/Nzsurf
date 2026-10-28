import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, apiUrl } from '../lib/api';

/**
 * Beeldanalyse voor de Beta-tools (webcam, Secret Swell).
 *
 * - Staat er op deze telefoon een eigen Claude-sleutel (Beta → AI-sleutel), dan gaat
 *   de vraag rechtstreeks naar de Claude API. De sleutel blijft op het toestel
 *   (localStorage): niet in git, niet in Firestore, niet op de server.
 * - Anders: Gemini via de server-route (in de APK via de website, native HTTP).
 *
 * Aanroepers geven het Gemini-formaat ({ model, contents: [{ inlineData }, { text }] });
 * voor Claude wordt dat omgezet.
 */

// In de APK is er geen eigen server; de website draait dezelfde /api-route.
const SITE = 'https://www.noordzeesurf.nl';
const KEY_STORE = 'nzs_claude_key';
const MODEL_STORE = 'nzs_claude_model';
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';

const read = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* geen opslag */ } };

export const getClaudeKey = () => read(KEY_STORE);
export const setClaudeKey = (key: string) => write(KEY_STORE, key.trim());
export const getClaudeModel = () => read(MODEL_STORE) || CLAUDE_DEFAULT_MODEL;
export const setClaudeModel = (m: string) => write(MODEL_STORE, m.trim());
export const aiProviderLabel = () => (getClaudeKey() ? `Claude (${getClaudeModel()})` : 'Gemini (server)');
export const maskKey = (k: string) => (k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••');

interface GeminiBody { model?: string; contents: any[]; config?: any }

/** Vraag met afbeeldingen; antwoord als tekst. Kiest Claude als er een sleutel is. */
export async function generateViaServer(body: GeminiBody): Promise<string> {
  const key = getClaudeKey();
  return key ? generateClaude(body, key) : generateGemini(body);
}

async function generateClaude(body: GeminiBody, key: string): Promise<string> {
  const parts = (Array.isArray(body.contents) ? body.contents : [body.contents]).flatMap((c: any): any[] =>
    typeof c === 'string' ? [{ type: 'text', text: c }]
    : c?.inlineData ? [{ type: 'image', source: { type: 'base64', media_type: c.inlineData.mimeType || 'image/jpeg', data: c.inlineData.data } }]
    : typeof c?.text === 'string' ? [{ type: 'text', text: c.text }]
    : []);
  // Tekst na de afbeeldingen (zoals de prompts zijn opgebouwd).
  const payload = { model: getClaudeModel(), max_tokens: 2000, messages: [{ role: 'user', content: parts }] };
  const headers: Record<string, string> = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  let status: number, data: any;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({ url: 'https://api.anthropic.com/v1/messages', headers, data: payload });
    status = res.status;
    data = typeof res.data === 'string' ? safeJson(res.data) : res.data;
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { ...headers, 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify(payload),
    });
    status = res.status;
    data = safeJson(await res.text());
  }
  if (status >= 400) throw new Error(`Claude: ${data?.error?.message || `HTTP ${status}`}`);
  const text = (data?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  // Claude zet JSON soms tussen ```json-blokken of met een zin ervoor: pak het JSON-deel.
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

/**
 * Fouten die betekenen "AI is nu niet bereikbaar" (geen server in de app, tegoed op,
 * geen netwerk). Daar valt de app stil terug op de eigen adviesmotor; geen foutlog.
 */
export function isAiUnavailable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /geen JSON|tegoed|credits are depleted|RESOURCE_EXHAUSTED|prepayment|Failed to fetch|Failed to parse URL|NetworkError|Load failed|HTTP 40[24]|HTTP 5\d\d/i.test(m);
}

// Eén keer "niet bereikbaar" → een halfuur niet opnieuw proberen (scheelt wachten en logs).
let unavailableUntil = 0;
export const aiCoolingDown = () => Date.now() < unavailableUntil;
export const markAiUnavailable = () => { unavailableUntil = Date.now() + 30 * 60e3; };

function safeJson(s: string) { try { return JSON.parse(s); } catch { return { error: { message: s.slice(0, 160) } }; } }

async function generateGemini(body: GeminiBody): Promise<string> {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    const res = await CapacitorHttp.post({ url: `${SITE}/api/gemini/generateContent`, headers: { 'Content-Type': 'application/json' }, data: body });
    let data: any = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { throw new Error(`server gaf geen JSON (HTTP ${res.status})`); }
    }
    if (res.status >= 400) throw new Error(geminiError(data?.error, res.status));
    return data?.text || '';
  }
  const res = await fetch(apiUrl('/api/gemini/generateContent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await res.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error(`server gaf geen JSON (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(geminiError(data?.error, res.status));
  return data?.text || '';
}

/** Leesbare melding; tegoed op → wijs op de Claude-sleutel. */
function geminiError(err: unknown, status: number): string {
  const s = typeof err === 'string' ? err : JSON.stringify(err ?? '');
  if (/RESOURCE_EXHAUSTED|credits are depleted|prepayment/i.test(s)) {
    return 'Gemini-tegoed van de server is op. Stel onder "AI-sleutel" je eigen Claude-sleutel in.';
  }
  return s || `HTTP ${status}`;
}
