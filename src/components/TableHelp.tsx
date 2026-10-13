import React from 'react';
import { Info } from 'lucide-react';

/** Inklapbare uitleg onder een tabel: "Zo lees je deze tabel". */
export function TableHelp({ children, title = 'Zo lees je deze tabel' }: { children: React.ReactNode; title?: string }) {
  return (
    <details className="rounded-lg bg-amber-50/70 border border-amber-200 px-2.5 py-1.5 text-[11px] text-slate-700">
      <summary className="cursor-pointer font-bold text-amber-900 flex items-center gap-1 select-none">
        <Info className="w-3.5 h-3.5 shrink-0" /> {title}
      </summary>
      <div className="mt-1.5 space-y-1 leading-snug [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5">{children}</div>
    </details>
  );
}
