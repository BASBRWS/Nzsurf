import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';

const SITE = 'https://www.noordzeesurf.nl/';

/** Op de website: NzSurf op je beginscherm zetten en de app delen. Niet in de Android-app. */
export const InstallCard: React.FC = () => {
  const [, tick] = useState(0);
  const [shared, setShared] = useState<string | null>(null);
  const [showIos, setShowIos] = useState(false);
  useEffect(() => onInstallChange(() => tick(t => t + 1)), []);
  if (Capacitor.isNativePlatform()) return null;

  const installed = isStandalone();
  const ios = isIos();

  const share = async () => {
    const data = { title: 'NoordzeeSurf', text: 'Kan ik vandaag surfen? Surfverwachting voor de Nederlandse kust:', url: SITE };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(SITE);
      setShared('Link gekopieerd');
    } catch { /* gebruiker brak af */ }
  };

  return (
    <section aria-label="App installeren en delen" className="mb-5 rounded-2xl border border-[color:var(--tide-line)] bg-[color:var(--tide-sand)] p-4">
      {!installed && (
        <>
          <p className="text-[17px] font-semibold text-[color:var(--tide-ink)]">Zet NzSurf op je beginscherm</p>
          <p className="mt-1 text-[15px] text-[color:var(--tide-sea)]">Eigen icoon, opent als app, de laatste verwachting ook zonder bereik op het strand.</p>
          {canPromptInstall() ? (
            <button onClick={() => promptInstall()} className="mt-3 min-h-[44px] px-5 rounded-full bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)] text-[15px] font-semibold cursor-pointer">Installeer</button>
          ) : ios ? (
            <>
              <button onClick={() => setShowIos(v => !v)} className="mt-3 min-h-[44px] px-5 rounded-full bg-[color:var(--tide-ink)] text-[color:var(--tide-sand)] text-[15px] font-semibold cursor-pointer">Zo doe je dat</button>
              {showIos && (
                <ol className="mt-3 list-decimal pl-5 space-y-1 text-[15px] text-[color:var(--tide-ink)]">
                  <li>Open deze site in <b>Safari</b>.</li>
                  <li>Tik op <b>Deel</b> (vierkantje met pijl omhoog).</li>
                  <li>Kies <b>Zet op beginscherm</b> en tik op <b>Voeg toe</b>.</li>
                </ol>
              )}
            </>
          ) : (
            <p className="mt-2 text-[14px] text-[color:var(--tide-sea)]">Open het browsermenu (⋮) en kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</p>
          )}
        </>
      )}
      <div className={installed ? '' : 'mt-4 border-t border-[color:var(--tide-line)] pt-3'}>
        <button onClick={share} className="min-h-[44px] text-[16px] underline underline-offset-4 cursor-pointer">Deel NzSurf met een surfmaat</button>
        {shared && <span role="status" className="ml-3 text-[14px] text-[color:var(--tide-sea)]">{shared}</span>}
      </div>
    </section>
  );
};
