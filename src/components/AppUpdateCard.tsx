import React, { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Download, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { openExternalUrl } from '../utils/calendarUtils';

/**
 * Update-knop in de app: vergelijkt het buildnummer van deze APK met de nieuwste
 * build (release `latest-build`), downloadt de APK in de app zelf en opent het
 * installatiescherm van Android. Alle gegevens blijven staan (zelfde ondertekening).
 * Terugval: downloaden via de browser.
 */
const APK_URL = 'https://github.com/BASBRWS/Nzsurf/releases/download/latest-build/nzsurf-latest.apk';
const RELEASE_API = 'https://api.github.com/repos/BASBRWS/Nzsurf/releases/tags/latest-build';
const CURRENT_BUILD = Number(import.meta.env.VITE_BUILD_NUMBER) || null;

// Eigen plugin (plugins/nzs-apk-updater): downloaden in de app en het installatiescherm openen.
interface ApkUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string }): Promise<{ bytes: number }>;
  addListener(ev: 'progress', fn: (p: { pct: number; bytes: number }) => void): Promise<{ remove: () => void }>;
}
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

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
  const [dl, setDl] = useState<{ pct?: number; msg?: string; busy: boolean; needPermission?: boolean }>({ busy: false });

  const update = async () => {
    setStarted(false);
    try {
      const { allowed } = await ApkUpdater.canInstall();
      if (!allowed) { setDl({ busy: false, needPermission: true }); return; }
    } catch {
      // Oude APK zonder de plugin: via de browser zoals vroeger.
      openExternalUrl(APK_URL); setStarted(true); return;
    }
    setDl({ busy: true, pct: 0, msg: 'Downloaden…' });
    const sub = await ApkUpdater.addListener('progress', p => setDl(d => ({ ...d, pct: p.pct })));
    try {
      await ApkUpdater.downloadAndInstall({ url: APK_URL });
      setDl({ busy: false, msg: 'Kies in het scherm van Android "Bijwerken". Je gegevens blijven staan.' });
    } catch (e) {
      setDl({ busy: false, msg: `${e instanceof Error ? e.message : e}. Probeer het opnieuw, of download via de browser hieronder.` });
    } finally { sub.remove(); }
  };

  const check = () => {
    setState('checking');
    fetchLatest().then(l => { setLatest(l); setState('idle'); }).catch(() => setState('error'));
  };
  useEffect(() => { if (Capacitor.isNativePlatform()) check(); }, []);

  if (!Capacitor.isNativePlatform()) return null;

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
        onClick={update} disabled={dl.busy}
        className={`w-full text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${newer === false ? 'bg-white border border-slate-300 text-slate-800' : 'bg-slate-900 text-white'}`}
      >
        {dl.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {dl.busy ? `Downloaden… ${dl.pct && dl.pct > 0 ? `${dl.pct}%` : ''}` : newer === false ? 'Toch opnieuw installeren' : 'Bijwerken'}
      </button>
      {dl.busy && typeof dl.pct === 'number' && dl.pct >= 0 && (
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true"><div className="h-full bg-slate-900 transition-all" style={{ width: `${dl.pct}%` }} /></div>
      )}
      {dl.needPermission && (
        <div className="text-[12px] text-slate-700 space-y-1.5">
          <p>Android vraagt eenmalig toestemming om updates te installeren vanuit NzSurf. Zet "Toestaan uit deze bron" aan en tik daarna opnieuw op Bijwerken.</p>
          <button onClick={() => { ApkUpdater.openInstallSettings(); setDl({ busy: false }); }} className="underline underline-offset-2 font-semibold cursor-pointer">Naar de instelling</button>
        </div>
      )}
      {dl.msg && !dl.busy && <p className="text-[11px] text-slate-600">{dl.msg}</p>}
      <button onClick={() => { openExternalUrl(APK_URL); setStarted(true); }} className="text-[11px] text-slate-500 underline underline-offset-2 cursor-pointer">Lukt het niet? Download via de browser</button>
      {started && (
        <p className="text-[11px] text-slate-600">
          De download start in je browser. Tik daarna op de melding "nzsurf-latest.apk" en kies <b>Bijwerken/Installeren</b>.
          Vraagt Android om "installeren uit deze bron" toe te staan, zet dat aan voor je browser. Je gegevens blijven staan.
        </p>
      )}
    </section>
  );
}
