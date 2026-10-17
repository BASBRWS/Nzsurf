// NzSurf blend — terugtoets op een ruwe audit-export.
//
// Bij elke run gebruikt de blend alleen metingen van vóór die run en wordt hij
// vergeleken met de ruwe bronnen over dezelfde uren (0–72 u vooruit).
//
// Draaien:   bun run scripts/forecast-blend-backtest.ts nzsurf-audit-ruw-JJJJ-MM-DD.json
//            (of: npx tsx scripts/forecast-blend-backtest.ts <bestand>)

import { readFileSync } from 'node:fs';
import { AuditForecastDoc, AuditObsDoc, cleanObservations } from '../src/utils/forecastAudit';
import { blendForecast } from '../src/utils/forecastBlend';

const file = process.argv[2];
if (!file) { console.error('Gebruik: forecast-blend-backtest.ts <audit-export.json>'); process.exit(1); }
const audit = JSON.parse(readFileSync(file, 'utf8')) as { forecasts: AuditForecastDoc[]; observations: AuditObsDoc[] };

const hk = (t: number) => Math.round(t / 3_600_000);
const obs: Record<number, any> = {};
for (const d of cleanObservations(audit.observations)) for (const p of d.points) obs[hk(Date.parse(p.t))] = p;
const ang = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

const COMPARE = ['dwd', 'meteofrance', 'gfs', 'knmi'];
const VARS = [['hs', 'hs'], ['tp', 'tm02'], ['windKn', 'windKn'], ['windDir', 'windDir']] as const;
const err: Record<string, Record<string, number[]>> = {};
const add = (name: string, v: string, e: number) => ((err[name] ??= {})[v] ??= []).push(e);

// Eén toetsmoment per rundag (de DWD-run als ankerpunt).
const runTimes = [...new Set(audit.forecasts.filter(f => f.source === 'dwd').map(f => f.runAt))].sort();

for (const runAt of runTimes) {
  const asOf = Date.parse(runAt) + 60_000;
  const res = blendForecast(audit.forecasts, audit.observations, asOf);
  const latest = Object.fromEntries(COMPARE.map(src => [src, audit.forecasts
    .filter(f => f.source === src && Date.parse(f.runAt) <= asOf)
    .sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0]]));

  for (const h of res.hours) {
    const t = Date.parse(h.t), o = obs[hk(t)], lead = (t - asOf) / 3_600_000;
    if (!o || lead < 0 || lead > 72) continue;
    for (const [v, ov] of VARS) {
      if (o[ov] == null || (v === 'windDir' && (o.windKn ?? 0) <= 5)) continue;
      const bv = (h as any)[v];
      if (bv != null) add('Blend', v, v === 'windDir' ? ang(bv, o[ov]) : Math.abs(bv - o[ov]));
      for (const src of COMPARE) {
        const p = latest[src]?.points.find(q => hk(Date.parse(q.t)) === hk(t)) as any;
        if (p?.[v] != null) add(`${src} (ruw)`, v, v === 'windDir' ? ang(p[v], o[ov]) : Math.abs(p[v] - o[ov]));
      }
    }
  }
}

const mae = (a?: number[]) => a?.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const f = (x: number, d: number, w: number) => (Number.isNaN(x) ? '–' : x.toFixed(d)).padStart(w);
console.log('Gemiddelde absolute fout, 0–72 u vooruit');
console.log('bron'.padEnd(20) + 'Hs (m)'.padStart(8) + 'Per (s)'.padStart(9) + 'Wind (kn)'.padStart(11) + 'Richt (°)'.padStart(11) + 'n'.padStart(6));
for (const [k, v] of Object.entries(err)) {
  console.log(k.padEnd(20) + f(mae(v.hs), 2, 8) + f(mae(v.tp), 2, 9) + f(mae(v.windKn), 1, 11) +
    f(mae(v.windDir), 0, 11) + String((v.hs ?? v.windKn ?? []).length).padStart(6));
}
