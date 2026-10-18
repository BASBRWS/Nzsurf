import React, { useEffect, useMemo, useState } from 'react';
import { Video, Loader2, Download } from 'lucide-react';
import { AuditObsDoc, ObsPoint, toCsv } from '../utils/forecastAudit';
import {
  WebcamMeasurement, getVideoId, setVideoId, loadWebcamMeasurements, runWebcamMeasurement, webcamSpots, NEARBY_KM,
} from '../services/webcamMeasure';
import { webcamRow, summarizeWebcam, nearbyEstimates } from '../utils/webcamVerify';
import { SurfSpot } from '../types';
import { getClaudeKey, setClaudeKey, getClaudeModel, setClaudeModel, maskKey, CLAUDE_DEFAULT_MODEL } from '../services/aiServer';

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

const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.abs(Math.round((f - 1) * 100))}%`;

export function WebcamPanel({ observations, onDownload, enabled, spots = [] }: {
  observations: AuditObsDoc[];
  spots?: SurfSpot[];
  onDownload: (name: string, content: string, type: string) => void;
  enabled: boolean;
}) {
  const [items, setItems] = useState<WebcamMeasurement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<{ busy: boolean; status?: string; error?: string }>({ busy: false });
  const [videoId, setVid] = useState(getVideoId());
  const [claudeKey, setKeyState] = useState(getClaudeKey());
  const [keyDraft, setKeyDraft] = useState('');

  useEffect(() => {
    loadWebcamMeasurements().then(setItems).catch(e => setLoadError(e?.message || String(e)));
  }, []);

  const rows = useMemo(() => (items || []).map(m => webcamRow(m, buoyAt(m.runAt, observations))), [items, observations]);
  const sum = useMemo(() => summarizeWebcam(rows), [rows]);
  const latest = rows.find(r => r.m.nearby?.length || r.m.forecast);
  // Factoren pas doortrekken met genoeg metingen; anders die van de laatste meting (indicatie).
  const seaF = sum.nSea >= 3 ? sum.sea : latest?.sea;
  const totalF = sum.n >= 3 ? sum.total : latest?.total;
  const estimates = nearbyEstimates(latest?.m.nearby, seaF, totalF);
  const cam = useMemo(() => webcamSpots(spots).camera, [spots]);

  const start = async () => {
    setRun({ busy: true, status: 'starten…' });
    try {
      const m = await runWebcamMeasurement(spots, s => setRun(r => ({ ...r, status: s })));
      setItems(prev => [m, ...(prev || [])]);
      setRun({ busy: false, status: m.result.framesUsable
        ? `✓ webcam ${fmt(m.result.waveFaceM)} m (${m.result.heightClass ?? '?'}, ${m.result.quality ?? '?'}) · NzSurf ${m.forecast?.name ?? ''}: ${fmt(m.forecast?.spotHs)} m — ${m.result.framesUsable}/${m.frames} beelden bruikbaar`
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
        Opent de livestream van Strandweer.nu (camera op de reddingspost, 10 m hoog) en legt 60 s lang elke 5 s een beeld vast; de AI schat daaruit de brekende golf.
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

      <details className="text-[11px] text-slate-600" open={!claudeKey && !!run.error && /Gemini-tegoed/.test(run.error)}>
        <summary className="cursor-pointer">AI-sleutel — nu: <b>{claudeKey ? `Claude ${maskKey(claudeKey)}` : 'Gemini (server)'}</b></summary>
        <div className="mt-1.5 space-y-1.5">
          <p>Plak hier je Claude API-sleutel (console.anthropic.com → API keys, begint met <span className="font-mono">sk-ant-</span>). Hij blijft alleen op deze telefoon en wordt gebruikt voor de webcam en de Secret Swell-import.</p>
          <div className="flex gap-2">
            <input type="password" autoComplete="off" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="sk-ant-…"
              className="flex-1 border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]" />
            <button onClick={() => { if (keyDraft.trim()) { setClaudeKey(keyDraft); setKeyState(getClaudeKey()); setKeyDraft(''); } }}
              className="font-bold px-3 py-1 rounded-lg bg-slate-900 text-white cursor-pointer">Opslaan</button>
          </div>
          {claudeKey && (
            <div className="flex gap-2 items-center">
              <span>Model:</span>
              <input defaultValue={getClaudeModel()} onBlur={e => setClaudeModel(e.target.value || CLAUDE_DEFAULT_MODEL)}
                className="flex-1 border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]" />
              <button onClick={() => { setClaudeKey(''); setKeyState(''); }} className="text-rose-700 font-bold cursor-pointer">Verwijderen</button>
            </div>
          )}
        </div>
      </details>

      {loadError && <p className="text-[11px] text-rose-700">Kon webcammetingen niet laden: {loadError}</p>}
      {rows.length > 0 && (
        <>
          <div className="text-xs text-slate-700 space-y-1">
            <p>{rows.length} metingen · getoetst tegen NzSurf voor <b>{cam.name}</b>{sum.n ? <> · {sum.n} vergelijkingen</> : null}</p>
            {sum.n > 0 && <p>
              NzSurf − webcam: gemiddeld <b>{fmt(sum.mae, 2)} m</b> ernaast, bias {sum.bias! >= 0 ? '+' : ''}{fmt(sum.bias, 2)} m
              ({sum.bias! > 0.05 ? 'NzSurf te hoog' : sum.bias! < -0.05 ? 'NzSurf te laag' : 'geen duidelijke scheefheid'}).
              {typeof sum.total === 'number' && <> Webcam ÷ NzSurf (mediaan): {fmt(sum.total, 2)} ({pct(sum.total)}).</>}
            </p>}
            {sum.nSea > 0 && typeof sum.sea === 'number' && <p>
              Opgesplitst met de boei: golfmodel op zee {pct(sum.sea)}{typeof sum.beachFactor === 'number' && <>, vertaling zee → strand bij deze spot {pct(sum.beachFactor)}</>}
              {typeof sum.beachOverBuoy === 'number' && <> · aan het strand komt ~{Math.round(sum.beachOverBuoy * 100)}% van de boeihoogte</>} ({sum.nSea} met boei).
            </p>}
            {sum.n > 0 && sum.n < 15 && <p className="text-[11px] text-amber-700">Nog weinig metingen: pas na ±15 op verschillende dagen zijn deze factoren betrouwbaar.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-slate-500">
                <th className="pr-2">Tijd</th><th className="pr-2 text-right">Webcam</th><th className="pr-2 text-right">NzSurf</th><th className="pr-2">Kwaliteit</th>
                <th className="pr-2 text-right">Model zee</th><th className="pr-2 text-right">Boei Hs</th><th className="pr-2 text-right">Tm02</th><th className="pr-2 text-right">Wind</th><th className="pr-2 text-right">÷ NzSurf</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 30).map(r => (
                  <tr key={r.m.runAt} className="border-t border-slate-100 align-top">
                    <td className="pr-2 font-mono whitespace-nowrap">{new Date(r.m.runAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="pr-2 text-right">{fmt(r.beach)}{r.m.result.heightClass ? <span className="text-slate-400"> {r.m.result.heightClass}</span> : null}</td>
                    <td className="pr-2 text-right">{fmt(r.nzSpot)}</td>
                    <td className="pr-2">{r.m.result.quality ?? '—'}</td>
                    <td className="pr-2 text-right">{fmt(r.m.forecast?.modelHs, 2)}</td>
                    <td className="pr-2 text-right">{r.buoy ? `${fmt(r.buoy.hs, 2)}${r.buoyMaasgeul ? '' : '*'}` : 'volgt'}</td>
                    <td className="pr-2 text-right">{r.buoy ? fmt(r.buoy.tm02) : ''}</td>
                    <td className="pr-2 text-right">{r.buoy && typeof r.buoy.windKn === 'number' ? `${Math.round(r.buoy.windKn)} kn` : ''}</td>
                    <td className="pr-2 text-right">{fmt(r.total, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500">Webcam = geschatte hoogte van de brekende golfwand; NzSurf = verwachte hoogte op de spot; model zee = Open-Meteo bij de spot; boei = Maasgeul 2 (gemeten). Het verschil in definitie (golfwand vs. significante hoogte) zit in de factoren; vergelijk dus vooral de trend.</p>

          {estimates.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700">Spots binnen {NEARBY_KM} km — laatste meting, doorgerekend</p>
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-slate-500"><th className="pr-2">Spot</th><th className="pr-2 text-right">Afstand</th><th className="pr-2 text-right">NzSurf</th><th className="pr-2 text-right">Gecorrigeerd</th><th className="pr-2 text-right">Kans</th></tr></thead>
                <tbody>
                  {estimates.map(e => (
                    <tr key={e.snap.spotId} className="border-t border-slate-100">
                      <td className="pr-2">{e.snap.name}</td>
                      <td className="pr-2 text-right">{fmt(e.snap.distKm)} km</td>
                      <td className="pr-2 text-right">{fmt(e.nz)} m</td>
                      <td className="pr-2 text-right">{e.basis === 'geen' ? '—' : <>{fmt(e.corrected)} m{e.basis === 'totaal' ? <span className="text-amber-600"> ~</span> : null}</>}</td>
                      <td className="pr-2 text-right">{typeof e.snap.chance === 'number' ? `${e.snap.chance}%` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500">
                Alleen de afwijking van het golfmodel op zee wordt doorgetrokken (de spots krijgen dezelfde swell); de vertaling naar het strand blijft per spot die van NzSurf,
                want ligging, zandbanken en pieren verschillen (Ouddorp ligt achter de Voordelta, Hoek van Holland achter de pier).
                <span className="text-amber-600"> ~</span> = nog geen boeiwaarde: dan is de hele afwijking van de Maasvlakte doorgetrokken, alleen een indicatie.
              </p>
            </div>
          )}

          {rows.some(r => r.buoy && !r.buoyMaasgeul) && <p className="text-[10px] text-slate-500">* boeiwaarde niet van Maasgeul 2 (terugval Schouwenbank).</p>}
          {rows[0]?.m.result.note && <p className="text-[11px] text-slate-600 italic">Laatste meting: {rows[0].m.result.note}</p>}
          {rows[0]?.m.forecastError && <p className="text-[11px] text-amber-700">NzSurf-verwachting ontbrak bij de laatste meting: {rows[0].m.forecastError}</p>}
          {rows[0]?.m.thumb && <img src={rows[0].m.thumb} alt="Beeld laatste webcammeting" className="rounded-lg max-w-full w-72 border border-slate-200" />}
          <button onClick={() => onDownload(`nzsurf-webcam-maasvlakte-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map(r => ({
              tijd_utc: r.m.runAt, beelden: r.m.frames, bruikbaar: r.m.result.framesUsable, webcam_m: r.beach ?? '',
              webcam_min: r.m.result.rangeM?.[0] ?? '', webcam_max: r.m.result.rangeM?.[1] ?? '', klasse: r.m.result.heightClass ?? '',
              kwaliteit: r.m.result.quality ?? '', lijnen: r.m.result.breakingLines ?? '', water: r.m.result.waterSurface ?? '', surfers: r.m.result.surfers ?? '',
              zekerheid: r.m.result.confidence ?? '', nzsurf_spot: r.m.forecast?.name ?? '', nzsurf_spot_m: r.nzSpot ?? '', model_zee_m: r.m.forecast?.modelHs ?? '',
              nzsurf_periode_s: r.m.forecast?.period ?? '', nzsurf_kans: r.m.forecast?.chance ?? '',
              boei_hs_m: r.buoy?.hs ?? '', boei_tm02_s: r.buoy?.tm02 ?? '', boei_richting: r.buoy?.dir ?? '',
              wind_kn: r.buoy?.windKn ?? '', windrichting: r.buoy?.windDir ?? '', boei_maasgeul: r.buoy ? (r.buoyMaasgeul ? 'ja' : 'nee') : '',
              webcam_gedeeld_door_nzsurf: r.total ?? '', boei_gedeeld_door_model: r.sea ?? '', strandfactor: r.beachFactor ?? '',
              opmerking: r.m.result.note ?? '',
              ...Object.fromEntries((r.m.nearby || []).map(n => [`nzsurf_${n.spotId}_m`, n.spotHs ?? ''])),
            }))), 'text/csv;charset=utf-8')}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 flex items-center gap-1.5 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Webcammetingen (CSV)
          </button>
        </>
      )}
    </div>
  );
}
