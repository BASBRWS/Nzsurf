import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { openExternalUrl } from '../utils/calendarUtils';

/**
 * Update-knop in de app: vergelijkt het buildnummer van deze APK met de nieuwste
 * build (release `latest-build`) en downloadt de nieuwste APK direct.
 * Na het downloaden tikt de gebruiker op de melding om te installeren; de app
 * wordt bijgewerkt en alle gegevens blijven staan (zelfde ondertekening).
 */
const APK_URL = 'https://github.com/BASBRWS/Nzsurf/releases/download/latest-build/nzsurf-latest.apk';
const RELEASE_API = 'https://api.github.com/repos/BASBRWS/Nzsurf/releases/tags/latest-build';
const CURRENT_BUILD = Number(import.meta.env.VITE_BUILD_NUMBER) || null;
// Play Store-build: updates lopen via Google Play (beleid: een Play-app mag zichzelf niet bijwerken).
const PLAY_BUILD = import.meta.env.VITE_DISTRIBUTION === 'play';

type Latest = { build: number | null; date: string | null };

async function fetchLatest(): Promise<Latest> {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rel = await res.json();
  const build = Number(String(rel.body || '').match(/versionCode\s+(\d+)/)?.[1] || String(rel.name || '').match(/build\s+(\d+)/)?.[1]) || null;
  const asset = (rel.assets || []).find((a: any) => a.name === 'nzsurf-latest.apk');
  return { build, date: asset?.updated_at || rel.published_at || null };
}

export function AppUpdateCard() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [started, setStarted] = useState(false);

  const check = () => {
    setState('checking');
    fetchLatest().then(l => { setLatest(l); setState('idle'); }).catch(() => setState('error'));
  };
  useEffect(() => { if (Capacitor.isNativePlatform() && !PLAY_BUILD) check(); }, []);

  if (!Capacitor.isNativePlatform() || PLAY_BUILD) return null;

  const newer = latest?.build && CURRENT_BUILD ? latest.build > CURRENT_BUILD : null;
  const when = latest?.date ? new Date(latest.date).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-black text-slate-900">App-versie</div>
        <button onClick={check} disabled={state === 'checking'} className="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer disabled:opacity-50">
          {state === 'checking' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Controleren
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Deze app: build {CURRENT_BUILD ?? 'onbekend'}
        {latest?.build ? <> · nieuwste: build {latest.build}{when ? ` (${when})` : ''}</> : null}
      </p>
      {state === 'error' && <p className="text-xs text-rose-700">Kon niet controleren of er een nieuwe versie is (geen internet?). Downloaden kan wel.</p>}
      {newer === false
        ? <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Je hebt de nieuwste versie.</p>
        : newer === true && <p className="text-xs font-bold text-cyan-800">Er is een nieuwe versie beschikbaar.</p>}
      <button
        onClick={() => { openExternalUrl(APK_URL); setStarted(true); }}
        className={`w-full text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer ${newer === false ? 'bg-white border border-slate-300 text-slate-800' : 'bg-slate-900 text-white'}`}
      >
        <Download className="w-4 h-4" /> {newer === false ? 'Toch opnieuw downloaden' : 'Download nieuwste versie'}
      </button>
      {started && (
        <p className="text-[11px] text-slate-600">
          De download start in je browser. Tik daarna op de melding "nzsurf-latest.apk" en kies <b>Bijwerken/Installeren</b>.
          Vraagt Android om "installeren uit deze bron" toe te staan, zet dat aan voor je browser. Je gegevens blijven staan.
        </p>
      )}
    </section>
  );
}
