import React, { useState } from 'react';
import { auth, signOut } from '../lib/firebase';
import { deleteMyAccount } from '../services/accountDeletion';

// Contactadres voor privacyvragen (ook in public/privacy.html en account-verwijderen.html).
export const CONTACT_EMAIL = 'info@noordzeesurf.nl';

/** Onderaan Ik: uitloggen en account verwijderen (bevestigen door 'verwijder' te typen). */
export const AccountCard: React.FC<{ email?: string | null }> = ({ email }) => {
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const busy = !!step && !done && !error;

  const run = async () => {
    setError(null);
    try {
      await deleteMyAccount(setStep);
      setDone(true);
      setStep('Je account en gegevens zijn verwijderd.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section aria-label="Account" className="mt-8 border-t border-[color:var(--tide-line)] pt-5">
      <div className="tide-mono text-[11px] text-[color:var(--tide-sea)]">account</div>
      <p className="mt-2 text-[15px] text-[color:var(--tide-ink)]">Ingelogd als {email || 'onbekend'}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <button onClick={() => signOut(auth)} disabled={busy} className="min-h-[44px] text-[16px] underline underline-offset-4 cursor-pointer">Uitloggen</button>
        {!confirm && <button onClick={() => setConfirm(true)} className="min-h-[44px] text-[16px] underline underline-offset-4 text-[#9a3412] cursor-pointer">Account verwijderen</button>}
      </div>

      {confirm && !done && (
        <div className="mt-3 rounded-2xl border border-[#f1c9a8] bg-[#fdf3ea] p-4 text-[15px] text-[color:var(--tide-ink)]">
          <p className="font-semibold">Account en gegevens definitief verwijderen?</p>
          <p className="mt-1.5 text-[color:var(--tide-sea)]">Je profiel, boards, voorkeuren, spotmeldingen, gedeelde spots, community-berichten en je reacties worden gewist. Dit kan niet ongedaan worden.</p>
          <label className="block mt-3 text-[14px]">Typ <b>verwijder</b> om te bevestigen
            <input value={typed} onChange={e => setTyped(e.target.value)} disabled={busy} autoCapitalize="none"
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px]" />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={run} disabled={typed.trim().toLowerCase() !== 'verwijder' || busy}
              className="min-h-[44px] px-5 rounded-full bg-[#9a3412] text-white text-[15px] font-semibold disabled:opacity-40 cursor-pointer">Verwijder alles</button>
            <button onClick={() => { setConfirm(false); setTyped(''); setError(null); setStep(null); }} disabled={busy}
              className="min-h-[44px] text-[15px] underline underline-offset-4 cursor-pointer">Annuleren</button>
          </div>
        </div>
      )}
      {step && <p role="status" className="mt-3 text-[14px] text-[color:var(--tide-sea)]">{step}</p>}
      {error && <p role="alert" className="mt-2 text-[14px] text-[#9a3412]">Niet gelukt: {error}. Lukt het niet, mail dan naar {CONTACT_EMAIL}.</p>}
      <p className="mt-4 text-[13px] text-[color:var(--tide-mist)]">
        <a href="https://www.noordzeesurf.nl/privacy.html" target="_blank" rel="noreferrer" className="underline underline-offset-2">Privacyverklaring</a>
      </p>
    </section>
  );
};
