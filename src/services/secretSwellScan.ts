// "Scan Secret Swell": de webapp van Secret Swell openen in een browser binnen NzSurf.
// Jij scrolt door Ouddorp en de Maasvlakte; een klein script in die pagina noteert na elk
// stilstaan wat er zichtbaar is (tekst met positie en achtergrondkleur) en stuurt dat naar
// NzSurf. Bij sluiten leest de AI elk uniek scherm af (zelfde velden als bij de
// schermafbeeldingen) en worden de getallen opgeslagen als bron "secretswell".
//
// Alleen in de Android-app (native). Er gaat niets naar Secret Swell; we lezen alleen wat
// jij in je eigen sessie te zien krijgt.

import { Capacitor } from '@capacitor/core';
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { readSecretSwellScreenText, saveSecretSwellReads } from './secretSwellImport';
import { secretSwellSpotOf, type SecretSwellRead } from '../utils/siteParsers';

export const SECRETSWELL_WEB = 'https://app.secret-swell.com/';

export interface Snap { at: number; url: string; frame: string; canvas: boolean; lines: string[] }

// Script in de Secret Swell-pagina. Na scrollen/wijzigen (700 ms stil): zichtbare tekst-
// elementen en gekleurde balkjes verzamelen, als "x,y,b,h | kleur | tekst" van boven naar
// beneden; alleen versturen als het scherm echt anders is. Plus een klein label onderaan.
const WATCHER = String.raw`(() => {
  if (window.__nzsWatch) return; window.__nzsWatch = true;
  let sent = 0, last = '', timer = 0;
  const pill = document.createElement('div');
  pill.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483647;background:#12292b;color:#f7f3eb;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:999px;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.25)';
  const setPill = () => { pill.textContent = 'NzSurf kijkt mee · ' + sent + ' scherm' + (sent === 1 ? '' : 'en'); };
  setPill(); (document.body || document.documentElement).appendChild(pill);
  const colorOf = el => {
    for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) {
      const c = getComputedStyle(e).backgroundColor;
      const m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m || (m[4] !== undefined && +m[4] < 0.3)) continue;
      const r = +m[1], g = +m[2], b = +m[3], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 40) return '';               // grijs/wit/zwart: geen betekenis
      return r > 180 && g < 110 ? 'rood' : r > 190 && g > 120 && b < 110 ? 'oranje' : g > 140 && r < 150 ? 'groen' : 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return '';
  };
  const collect = () => {
    const W = innerWidth, H = innerHeight, out = [];
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (const el of all) {
      if (el === pill || el.children.length > 3) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.1) continue;
      const c = colorOf(el);
      if (!own && !(c && r.height <= 14 && r.width >= 20)) continue;  // tekst, of een gekleurde balk
      out.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') + ' | ' + (c || '-') + ' | ' + own.slice(0, 60));
      if (out.length >= 450) break;
    }
    out.sort((a, b) => { const ay = +a.split(',')[1], by = +b.split(',')[1]; return Math.abs(ay - by) > 6 ? ay - by : +a.split(',')[0] - +b.split(',')[0]; });
    return out;
  };
  const send = () => {
    const lines = collect();
    const key = lines.map(l => l.split(' | ')[2]).join('|');
    if (!lines.length || key === last) return;
    last = key; sent++; setPill();
    const canvas = !!document.querySelector('flutter-view, flt-glass-pane, canvas');
    window.mobileApp && window.mobileApp.postMessage({ detail: { type: 'nzs-snap', url: location.href, canvas, lines } });
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(send, 700); };
  addEventListener('scroll', later, true); addEventListener('resize', later);
  new MutationObserver(later).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  later();
})();`;

/** Open Secret Swell; geeft de verzamelde schermen terug zodra je de browser sluit. */
export async function scanSecretSwell(onSnap: (n: number) => void): Promise<Snap[]> {
  if (!Capacitor.isNativePlatform()) throw new Error('Scannen kan alleen in de Android-app.');
  const snaps: Snap[] = [];
  await InAppBrowser.removeAllListeners();
  return new Promise<Snap[]>((resolve, reject) => {
    const inject = () => InAppBrowser.executeScript({ code: WATCHER }).catch(() => { /* pagina nog niet klaar */ });
    InAppBrowser.addListener('messageFromWebview', ev => {
      const d = (ev?.detail || {}) as { type?: string; url?: string; canvas?: boolean; lines?: string[] };
      if (d.type !== 'nzs-snap' || !d.lines?.length) return;
      snaps.push({ at: Date.now(), url: d.url || '', frame: '', canvas: !!d.canvas, lines: d.lines });
      onSnap(snaps.length);
    });
    InAppBrowser.addListener('browserPageLoaded', inject);
    InAppBrowser.addListener('urlChangeEvent', () => setTimeout(inject, 800));
    InAppBrowser.addListener('closeEvent', async () => { await InAppBrowser.removeAllListeners(); resolve(snaps); });
    InAppBrowser.addListener('pageLoadError', () => { /* netwerk: gebruiker ziet het zelf; sluiten levert op wat er is */ });
    InAppBrowser.openWebView({
      url: SECRETSWELL_WEB,
      title: 'Scroll door Ouddorp en Maasvlakte',
      toolbarType: ToolBarType.COMPACT,
      isPresentAfterPageLoad: false,
    }).then(() => setTimeout(inject, 1500)).catch(reject);
  });
}

/**
 * Verwerk de schermen: dubbele en bijna-lege overslaan, elk scherm laten aflezen, per spot
 * opslaan. De ruwe schermen gaan ook naar auditRaw (admin), om een vaste uitlezer te bouwen.
 */
export async function processSecretSwellScan(snaps: Snap[], onStep?: (s: string) => void): Promise<{ points: number; summary: string[] }> {
  const summary: string[] = [];
  const useful = snaps.filter(s => s.lines.filter(l => !l.endsWith('| ')).length >= 8);
  if (!useful.length) {
    const canvas = snaps.some(s => s.canvas);
    throw new Error(snaps.length
      ? `De schermen bevatten bijna geen leesbare tekst${canvas ? ' (Secret Swell tekent de pagina als afbeelding)' : ''}. Uitlezen kan zo niet; gebruik de schermafbeeldingen.`
      : 'Geen schermen gezien. Was je ingelogd en heb je door de verwachting gescrold?');
  }
  // Bewaar de ruwe schermen (klein, tekst) voor controle en een vaste uitlezer later.
  const day = new Date().toISOString().slice(0, 10);
  try { await setDoc(doc(db, 'auditRaw', `${day}_secretswell-scan_${Date.now()}`), { at: new Date().toISOString(), source: 'secretswell-scan', snaps: useful.slice(0, 40) }); } catch { /* niet erg */ }

  // Max. 16 schermen aflezen (kosten); de laatste per inhoud wint.
  const pick = useful.slice(-16);
  const bySpot = new Map<string, SecretSwellRead[]>();
  let lastSpot: string | undefined;
  for (let i = 0; i < pick.length; i++) {
    onStep?.(`Scherm ${i + 1} van ${pick.length} aflezen…`);
    let read: SecretSwellRead;
    try { read = await readSecretSwellScreenText(pick[i].lines.join('\n')); }
    catch (e) { summary.push(`✗ scherm ${i + 1}: niet af te lezen (${e instanceof Error ? e.message.slice(0, 60) : e})`); continue; }
    let spotId = secretSwellSpotOf(read);
    if (spotId === null) { summary.push(`– scherm ${i + 1}: "${read.spot}" is geen Ouddorp of Maasvlakte`); continue; }
    // Doorgescrold zonder spotnaam in beeld: hoort bij de laatst geziene spot.
    if (spotId === undefined) spotId = lastSpot;
    if (!spotId) { summary.push(`– scherm ${i + 1}: spot onbekend`); continue; }
    lastSpot = spotId;
    if (!bySpot.has(spotId)) bySpot.set(spotId, []);
    bySpot.get(spotId)!.push(read);
  }
  if (!bySpot.size) throw new Error(summary.join(' | ') || 'Geen Ouddorp of Maasvlakte gevonden in de schermen.');
  onStep?.('Opslaan…');
  const points = await saveSecretSwellReads(bySpot, new Date(useful[0].at), { label: 'Secret Swell (meegekeken)', note: 'tijdens scrollen in de Secret Swell-webapp meegelezen en door AI afgelezen' }, summary);
  if (!points) throw new Error(summary.join(' | ') || 'Geen bruikbare getallen gevonden.');
  return { points, summary };
}
