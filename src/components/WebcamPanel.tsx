import React, { useEffect, useMemo, useState } from 'react';
import { Video, Loader2, Download } from 'lucide-react';
import { AuditObsDoc, ObsPoint, toCsv } from '../utils/forecastAudit';
import {
  WebcamMeasurement, getVideoId, setVideoId, loadWebcamMeasurements, runWebcamMeasurement,
} from '../services/webcamMeasure';

/**
 * Beta: knop "meet 60 s" voor de webcam aan het Maasvlaktestrand, plus de
 * metingen naast de boei Maasgeul 2 (golf op zee → golf aan het strand).
 */

const fmt = (v: number | undefined, d = 1) => (typeof v === 'number' ? v.toFixed(d).replace('.', ',') : '—');

/** Dichtstbijzijnde boeimeting (binnen 45 min) en of die van Maasgeul 2 komt. */
function buoyAt(t: string, observations: AuditObsDoc[]): { p: ObsPoint; maasgeul: boolean } | null {
  const ms = Date.parse(t);
  let best: { p: ObsPoint; maasgeul: boolean; d: number } | null = null;
  for (const doc of observations) {
    const maasgeul = (doc.stations || []).some(s => /^Hm0@maasgeul/i.test(s));
    for (const p of doc.points) {
      if (typeof p.hs !== 'number') continue;
      const d = Math.abs(Date.parse(p.t) - ms);
      if (d <= 45 * 60e3 && (!best || d < best.d)) best = { p, maasgeul, d };
    }
  }
  return best ? { p: best.p, maasgeul: best.maasgeul } : null;
}

export function WebcamPanel({ observations, onDownload, enabled }: {
  observations: AuditObsDoc[];
  onDownload: (name: string, content: string, type: string) => void;
  enabled: boolean;
}) {
  const [items, setItems] = useState<WebcamMeasurement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<{ busy: boolean; status?: string; error?: string }>({ busy: false });
  const [videoId, setVid] = useState(getVideoId());

  useEffect(() => {
    loadWebcamMeasurements().then(setItems).catch(e => setLoadError(e?.message || String(e)));
  }, []);

  const rows = useMemo(() => (items || []).map(m => {
    const b = buoyAt(m.runAt, observations);
    const beach = m.result.waveFaceM;
    return { m, b, ratio: b && typeof beach === 'number' && b.p.hs! > 0.05 && m.result.framesUsable > 0 ? beach / b.p.hs! : undefined };
  }), [items, observations]);

  const ratios = rows.map(r => r.ratio).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : undefined;

  const start = async () => {
    setRun({ busy: true, status: 'starten…' });
    try {
      const m = await runWebcamMeasurement(s => setRun(r => ({ ...r, status: s })));
      setItems(prev => [m, ...(prev || [])]);
      setRun({ busy: false, status: m.result.framesUsable
        ? `✓ ${fmt(m.result.waveFaceM)} m (${m.result.heightClass ?? '?'}, ${m.result.quality ?? '?'}) — ${m.result.framesUsable}/${m.frames} beelden bruikbaar`
        : `✓ opgeslagen, maar de branding was op geen beeld goed te zien (${m.frames} beelden)` });
    } catch (e: any) {
      setRun({ busy: false, error: e?.message || String(e) });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      {enabled ? (
        <button disabled={run.busy} onClick={start}
          className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
          {run.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />} Webcam Maasvlakte: meet 60 s
        </button>
      ) : (
        <p className="text-[11px] text-slate-500">De webcammeting werkt alleen in de Android-app.</p>
      )}
      {run.status && <p className="text-[11px] font-mono text-slate-700">{run.status}</p>}
      {run.error && <p className="text-[11px] font-mono text-rose-700">✗ {run.error}</p>}
      <p className="text-[11px] text-slate-500">
        Opent de livestream van Strandweer.nu (camera op de reddingspost, 10 m hoog) en legt 60 s lang elke 5 s een beeld vast; Gemini schat daaruit de brekende golf.
        Vraagt YouTube om toestemming, tik dan op "Alles accepteren"; speelt de video niet, tik op ▶. De camera draait: beelden zonder zee tellen niet mee.
        De boei Maasgeul 2 ligt vlak voor de Maasvlakte; de boeiwaarde van hetzelfde uur verschijnt na de volgende ophaalronde (4× per dag).
      </p>
      <details className="text-[11px] text-slate-600">
        <summary className="cursor-pointer">Stream-adres (als de livestream opnieuw is gestart)</summary>
        <div className="flex gap-2 mt-1.5 items-center">
          <input defaultValue={videoId} onBlur={e => setVid(setVideoId(e.target.value))}
            className="flex-1 border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]" placeholder="YouTube-link of ID" />
          <span className="font-mono">{videoId}</span>
        </div>
      </details>

      {loadError && <p className="text-[11px] text-rose-700">Kon webcammetingen niet laden: {loadError}</p>}
      {rows.length > 0 && (
        <>
          <p className="text-xs text-slate-700">
            {rows.length} metingen{median !== undefined && ratios.length >= 5
              ? <> · strand ÷ zee (mediaan van {ratios.length}): <b>{fmt(median, 2)}</b> — de golf aan het strand is ongeveer {Math.round(median * 100)}% van de boeihoogte</>
              : ratios.length ? <> · {ratios.length} met boeiwaarde (vanaf 5 verschijnt de verhouding strand ÷ zee)</> : null}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-slate-500">
                <th className="pr-2">Tijd</th><th className="pr-2 text-right">Strand (m)</th><th className="pr-2">Klasse</th><th className="pr-2">Kwaliteit</th>
                <th className="pr-2 text-right">Zee Hs</th><th className="pr-2 text-right">Tm02</th><th className="pr-2 text-right">Wind</th><th className="pr-2 text-right">÷</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 30).map(({ m, b, ratio }) => (
                  <tr key={m.runAt} className="border-t border-slate-100 align-top">
                    <td className="pr-2 font-mono whitespace-nowrap">{new Date(m.runAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="pr-2 text-right">{m.result.framesUsable ? fmt(m.result.waveFaceM) : '—'}</td>
                    <td className="pr-2">{m.result.heightClass ?? '—'}</td>
                    <td className="pr-2">{m.result.quality ?? '—'}</td>
                    <td className="pr-2 text-right">{b ? `${fmt(b.p.hs, 2)}${b.maasgeul ? '' : '*'}` : 'volgt'}</td>
                    <td className="pr-2 text-right">{b ? fmt(b.p.tm02) : ''}</td>
                    <td className="pr-2 text-right">{b && typeof b.p.windKn === 'number' ? `${Math.round(b.p.windKn)} kn` : ''}</td>
                    <td className="pr-2 text-right">{fmt(ratio, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.some(r => r.b && !r.b.maasgeul) && <p className="text-[10px] text-slate-500">* boeiwaarde niet van Maasgeul 2 (terugval Schouwenbank).</p>}
          {rows[0]?.m.result.note && <p className="text-[11px] text-slate-600 italic">Laatste meting: {rows[0].m.result.note}</p>}
          {rows[0]?.m.thumb && <img src={rows[0].m.thumb} alt="Beeld laatste webcammeting" className="rounded-lg max-w-full w-72 border border-slate-200" />}
          <button onClick={() => onDownload(`nzsurf-webcam-maasvlakte-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map(({ m, b, ratio }) => ({
              tijd_utc: m.runAt, beelden: m.frames, bruikbaar: m.result.framesUsable, strand_m: m.result.waveFaceM ?? '',
              strand_min: m.result.rangeM?.[0] ?? '', strand_max: m.result.rangeM?.[1] ?? '', klasse: m.result.heightClass ?? '',
              kwaliteit: m.result.quality ?? '', lijnen: m.result.breakingLines ?? '', water: m.result.waterSurface ?? '', surfers: m.result.surfers ?? '',
              zekerheid: m.result.confidence ?? '', zee_hs_m: b?.p.hs ?? '', zee_tm02_s: b?.p.tm02 ?? '', zee_richting: b?.p.dir ?? '',
              wind_kn: b?.p.windKn ?? '', windrichting: b?.p.windDir ?? '', boei_maasgeul: b ? (b.maasgeul ? 'ja' : 'nee') : '',
              strand_gedeeld_door_zee: ratio ?? '', opmerking: m.result.note ?? '',
            }))), 'text/csv;charset=utf-8')}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Webcammetingen (CSV)
          </button>
        </>
      )}
    </div>
  );
}
