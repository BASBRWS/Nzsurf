// Terugtoets NzSurf v2 tegen NzSurf, hybride, concept en de beste andere bron, op alle
// opgeslagen auditdata. Alleen lezen. Resultaat als ::notice-annotaties (één per spot)
// zodat het zonder logtoegang te lezen is. Draaien: workflow "Voorspellingsaudit" met
// backtest = true.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AuditForecastDoc, AuditObsDoc, PARAMS, LEAD_BUCKETS, auditView, buildPairs, cleanObservations, fairScores, scorePairs, slotKey } from '../src/utils/forecastAudit';
import { buildConceptDocs, CONCEPT_SOURCE } from '../src/utils/forecastBlend';
import { buildHybridDocs, HYBRID_SOURCE } from '../src/utils/forecastHybrid';
import { buildV2Docs, V2_SOURCE } from '../src/utils/forecastV2';
import { DEFAULT_RULE, componentRanking, componentScores, dayRanking, dayScores, isDaytime, obsTruth, observedVars, obsIndex, pairedSurfScores, reportTruth } from '../src/utils/surfVerdict';
import type { SpotReportLike, AuditPoint } from '../src/utils/forecastAudit';
import { DEFAULT_SPOTS } from '../src/constants';
import { SPOT_CATALOG, toSurfSpot } from '../src/data/spotCatalog';
import { chanceFactors, withAreaDefaults } from '../src/utils/spotKnowledge';
import { windQualityFor } from '../src/utils/windQuality';
import type { ForecastData, SurfSpot } from '../src/types';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) throw new Error('Ontbrekende env-var: FIREBASE_SERVICE_ACCOUNT');
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(sa)) }), process.env.FIRESTORE_DATABASE_ID || 'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10');

const OURS = ['nzsurf', CONCEPT_SOURCE, HYBRID_SOURCE, V2_SOURCE, 'v2-zonder'];
const SHORT: Record<string, string> = { nzsurf: 'NZ', [CONCEPT_SOURCE]: 'concept', [HYBRID_SOURCE]: 'hybride', [V2_SOURCE]: 'V2', 'v2-zonder': 'V2-0' };
const f = (x: number, d = 2) => x.toFixed(d);
const notice = (title: string, lines: string[]) => console.log(`::notice title=${title}::${lines.join('%0A')}`);

const [fcSnap, obsSnap, repSnap] = await Promise.all([db.collection('auditForecasts').get(), db.collection('auditObservations').get(), db.collection('spotReports').get()]);
const reports = repSnap.docs.map(d => d.data() as SpotReportLike);

// ── Diagnose: waarom zegt NzSurf "nee" op momenten die surfbaar waren? ─────
// kans = 100 × grootte × periode × wind × getij. Per gemist moment: welke factor drukt
// het hardst (de kleinste), en had alléén die factor het verschil gemaakt (kans/factor ≥ 45)?
// Live v2 en nieuwe v1-runs hebben de factoren opgeslagen ("why"); oudere v1-runs
// rekenen we na uit de punten (getij dan onbekend = 1, dus benadering).
const DIAG_SPOTS: Record<string, SurfSpot> = {
  'ouddorp-p-noordweg': withAreaDefaults(DEFAULT_SPOTS.find(x => x.id === 'ouddorp-p-noordweg')!),
  maasvlakte: withAreaDefaults({ ...toSurfSpot(SPOT_CATALOG.find(x => x.id === 'maasvlakte')!), lat: 51.9292, lng: 3.9766 }),
};
const FACTOR_NL: Record<string, string> = { s: 'grootte aan strand', p: 'periode', w: 'wind', t: 'getij' };
function factorsOf(spot: SurfSpot, p: AuditPoint): { s: number; p: number; w: number; t: number; approx: boolean } | null {
  if (p.why) return { ...p.why, approx: false };
  if (typeof p.hs !== 'number' || typeof p.tp !== 'number') return null;
  const wq = typeof p.windDir === 'number' && typeof p.windKn === 'number' ? windQualityFor(spot.coastlineAngle, p.windDir, p.windKn).windQuality : undefined;
  const f = { timestamp: p.t, waveHeight: p.hs, swellPeriod: p.tp, swellDirection: p.dir ?? 300, windSpeed: p.windKn ?? 0, windDirection: p.windDir ?? 0,
    spotWaveHeight: p.spotHs, windQuality: wq, waterTemp: 12, airTemp: 12, isDaylight: true } as ForecastData;
  return { ...chanceFactors(spot, f), approx: true };
}
function diagnose(spotId: string, docs: AuditForecastDoc[], source: string, truth: (t: number, s: string) => boolean | undefined, truthName: string, obsIdx?: ReturnType<typeof obsIndex>): string | null {
  const spot = DIAG_SPOTS[spotId];
  let tp = 0, fn = 0, tn = 0, fp = 0, approx = 0;
  const lim: Record<string, number> = { s: 0, p: 0, w: 0, t: 0 }, alone: Record<string, number> = { s: 0, p: 0, w: 0, t: 0 };
  const fpWhy: Record<string, number> = { 'golf < 0,6 m': 0, 'periode te kort': 0, 'te veel wind': 0, 'meerdere': 0, 'overig': 0 };
  const seen = new Set<string>();
  for (const d of docs.filter(x => x.source === source)) for (const p of d.points || []) {
    const t = Date.parse(p.t);
    if (!isDaytime(t) || p.lead <= 0 || p.lead > 72 || typeof p.chance !== 'number') continue;
    const key = `${Math.round(t / 3600e3)}|${d.runDate}`; if (seen.has(key)) continue; seen.add(key);
    const tr = truth(t, source); if (tr === undefined) continue;
    const ok = p.chance >= 45;
    if (tr && ok) tp++; else if (!tr && !ok) tn++;
    else if (tr && !ok) {
      fn++;
      const fx = factorsOf(spot, p); if (!fx) continue; if (fx.approx) approx++;
      const ks = ['s', 'p', 'w', 't'] as const;
      const k = ks.reduce((a, b) => (fx[b] < fx[a] ? b : a));
      lim[k]++;
      if (p.chance / Math.max(0.05, fx[k]) >= 45) alone[k]++;
    } else {
      fp++;
      const o = obsIdx?.get(new Date(t).toISOString().slice(0, 13));
      if (o) {
        const v = observedVars(o); const why: string[] = [];
        if ((v.hs ?? 0) < DEFAULT_RULE.minWave) why.push('golf < 0,6 m');
        if ((v.tp ?? 0) < DEFAULT_RULE.minPeriod) why.push('periode te kort');
        if ((v.windKn ?? 0) > DEFAULT_RULE.maxOnshoreKn) why.push('te veel wind');
        fpWhy[why.length === 1 ? why[0] : why.length ? 'meerdere' : 'overig']++;
      }
    }
  }
  const pos = tp + fn, neg = tn + fp;
  if (pos + neg < 10) return null;
  const pc = (a: number, b: number) => (b ? `${Math.round(100 * a / b)}%` : '–');
  const limTxt = Object.entries(lim).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${FACTOR_NL[k]} ${pc(n, fn)} (alleen dit: ${alone[k]})`).join(', ');
  const fpTxt = obsIdx ? Object.entries(fpWhy).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') : '';
  return `${source} tegen ${truthName}: ${pos} surfbaar, gevangen ${pc(tp, pos)}; ${neg} niet, terecht nee ${pc(tn, neg)}. Gemist (${fn}${approx ? `, ${approx} benaderd` : ''}): ${limTxt || '–'}.${fp ? ` Onterecht ja (${fp})${fpTxt ? `: meting zegt ${fpTxt}` : ''}.` : ''}`;
}
const all = fcSnap.docs.map(d => d.data() as AuditForecastDoc);
const obs = cleanObservations(obsSnap.docs.map(d => d.data() as AuditObsDoc));
console.log(`${all.length} verwachtingen, ${obs.length} meetdagen; wind omgerekend naar 10 m: ${obs.filter(o => o.windAt10m).length} dagen`);

for (const spotId of ['ouddorp-p-noordweg', 'maasvlakte']) {
  const t0 = Date.now();
  const fc = auditView(all.filter(d => (d.spotId || 'ouddorp-p-noordweg') === spotId), spotId);
  const concept = buildConceptDocs(fc, obs);
  const hybrid = buildHybridDocs(fc, obs, concept);
  const v2 = buildV2Docs(fc, obs);
  // Zelfde v2 zonder laag 2 (bijsturen met de laatste meting), om die laag apart te toetsen.
  const v2raw = buildV2Docs(fc, obs, { nowcast: false }).map(d => ({ ...d, source: 'v2-zonder', label: 'v2 zonder bijsturing' }));
  const docs = [...fc, ...concept, ...hybrid, ...v2, ...v2raw];
  const pairs = buildPairs(docs, obs);
  console.log(`${spotId}: ${v2.length} v2-runs in ${Date.now() - t0} ms; laatste: ${v2[v2.length - 1]?.note}`);

  const lines: string[] = [];
  for (const prm of PARAMS) {
    const sc = scorePairs(pairs.filter(p => p.param === prm.key)).filter(s => s.n >= 20);
    if (!sc.length) continue;
    const ours = OURS.map(s => { const i = sc.findIndex(x => x.source === s); return i < 0 ? null : `${SHORT[s]} #${i + 1} ${f(sc[i].mae, prm.key === 'hs' ? 2 : 1)} (bias ${f(sc[i].bias, prm.key === 'hs' ? 2 : 1)})`; }).filter(Boolean);
    const best = sc.find(x => !OURS.includes(x.source));
    lines.push(`${prm.label}: ${ours.join(' · ')} | beste ander: ${best ? `${best.label} ${f(best.mae, prm.key === 'hs' ? 2 : 1)}` : '–'} (${sc.length} bronnen)`);
  }
  // Positie van v2 zoals in het rapport: alleen NzSurf, v2 en de externe bronnen.
  const field = pairs.filter(p => ![CONCEPT_SOURCE, HYBRID_SOURCE, 'v2-zonder'].includes(p.source));
  const pos: string[] = [];
  for (const prm of PARAMS) {
    const sc = scorePairs(field.filter(p => p.param === prm.key)).filter(s => s.n >= 20);
    const i = sc.findIndex(x => x.source === V2_SOURCE), j = sc.findIndex(x => x.source === 'nzsurf');
    if (i >= 0) pos.push(`${prm.label} v2 #${i + 1}/${sc.length} (NzSurf #${j + 1}) top3: ${sc.slice(0, 3).map(x => `${x.label.split(' (')[0]} ${f(x.mae, prm.key === 'hs' ? 2 : 1)}`).join(', ')}`);
  }
  const fieldDocs = docs.filter(d => ![CONCEPT_SOURCE, HYBRID_SOURCE, 'v2-zonder'].includes(d.source));
  const tr = obsTruth(obs, DEFAULT_RULE);
  const hr = componentRanking(componentScores(fieldDocs, obs, DEFAULT_RULE, tr), 'total').filter(r => r.n >= 20);
  const dr = dayRanking(dayScores(fieldDocs, DEFAULT_RULE, tr, Date.now())).filter(r => r.n >= 8);
  const at = (rk: { source: string; pct: number }[], s: string) => { const i = rk.findIndex(r => r.source === s); return i < 0 ? '–' : `#${i + 1}/${rk.length} ${rk[i].pct}%`; };
  pos.push(`Te surfen per uur: v2 ${at(hr, V2_SOURCE)} · NzSurf ${at(hr, 'nzsurf')} · top: ${hr.slice(0, 3).map(r => `${r.source} ${r.pct}%`).join(', ')}`);
  pos.push(`Te surfen per dag: v2 ${at(dr, V2_SOURCE)} · NzSurf ${at(dr, 'nzsurf')} · top: ${dr.slice(0, 3).map(r => `${r.source} ${r.pct}%`).join(', ')}`);
  notice(`Positie v2 ${spotId}`, pos);

  const truth = obsTruth(obs, DEFAULT_RULE);
  const hourRank = componentRanking(componentScores(docs, obs, DEFAULT_RULE, truth), 'total');
  const dayRank = dayRanking(dayScores(docs, DEFAULT_RULE, truth, Date.now()));
  const show = (rank: { source: string; pct: number; n: number }[]) => rank.filter(r => OURS.includes(r.source) || r.source === 'wompy')
    .map(r => `${SHORT[r.source] ?? r.source} ${r.pct}% (n${r.n}, #${rank.indexOf(r) + 1})`).join(' · ');
  lines.push(`Te surfen per uur: ${show(hourRank)}`);
  lines.push(`Te surfen per dag: ${show(dayRank)}`);
  notice(`Terugtoets ${spotId}`, lines);

  const bl: string[] = [];
  for (const key of ['hs', 'windKn'] as const) {
    for (const b of LEAD_BUCKETS) {
      const sc = scorePairs(pairs.filter(p => p.param === key && p.bucket === b.key)).filter(s => s.n >= 20);
      if (!sc.length) continue;
      const cell = (s: string) => { const x = sc.find(y => y.source === s); return x ? `${SHORT[s]} ${f(x.mae, key === 'hs' ? 2 : 1)}` : null; };
      const best = sc.find(x => !OURS.includes(x.source));
      bl.push(`${key} ${b.key}: ${OURS.map(cell).filter(Boolean).join(' · ')} | ${best?.label.split(' (')[0]} ${best ? f(best.mae, key === 'hs' ? 2 : 1) : ''}`);
    }
  }
  notice(`Per looptijd ${spotId}`, bl);

  // Eerlijk: zelfde uren als NzSurf, één stem per meetuur, 90%-interval (zonder concept/hybride/v2-zonder).
  const fairPairs = pairs.filter(p => ![CONCEPT_SOURCE, HYBRID_SOURCE, 'v2-zonder'].includes(p.source));
  const fl: string[] = [];
  for (const prm of PARAMS) {
    const sc = fairScores(fairPairs, prm.key);
    if (!sc.length) continue;
    const rk = sc.filter(x => x.ranked);
    const d = prm.key === 'hs' ? 2 : 1;
    const fmt = (x: typeof sc[number]) => `${(SHORT[x.source] ?? x.label.split(' (')[0])} #${rk.indexOf(x) + 1 || '-'} ${f(x.mae, d)}${x.mean && x.source !== 'nzsurf' ? ` Δ${x.delta >= 0 ? '+' : ''}${f(x.delta, d)} [${f(x.lo, d)};${f(x.hi, d)}]` : ''} (${x.hours}u/${x.days}d)`;
    const show = rk.slice(0, 4);
    for (const s of ['nzsurf', V2_SOURCE]) { const x = sc.find(y => y.source === s); if (x && !show.includes(x)) show.push(x); }
    fl.push(`${prm.label}: ${show.map(fmt).join(' · ')} | ${rk.length}/${sc.length} met rang`);
  }
  const truthF = obsTruth(obs, DEFAULT_RULE);
  const paired = pairedSurfScores(docs.filter(d => ![CONCEPT_SOURCE, HYBRID_SOURCE, 'v2-zonder'].includes(d.source)), DEFAULT_RULE, truthF);
  fl.push(`Te surfen vs NzSurf (zelfde momenten): ${paired.slice(0, 6).map(r => `${SHORT[r.source] ?? r.source} ${r.score}% vs ${r.ref}% Δ${r.delta >= 0 ? '+' : ''}${r.delta} [${r.lo};${r.hi}] n${r.moments}/${r.days}d${r.ranked ? '' : ' (te weinig)'}`).join(' · ')}`);
  notice(`Eerlijk ${spotId}`, fl);

  // Rechtstreeks v2 tegen één bron, per vooruitkijkklasse en per omstandigheid (zelfde 3-uursvakken).
  const vs = (a: string, b: string, filt: (p: typeof pairs[number]) => boolean, param: 'hs' | 'tp' | 'windKn' | 'dir') => {
    const m = (src: string) => { const r = new Map<string, number[]>(); for (const p of pairs) if (p.source === src && p.param === param && filt(p)) { const k = `${slotKey(p.t)}|${p.bucket}`; (r.get(k) || r.set(k, []).get(k)!).push(Math.abs(p.err)); } return r; };
    const A = m(a), B = m(b); let sa = 0, sb = 0, n = 0;
    for (const [k, va] of A) { const vb = B.get(k); if (!vb) continue; sa += va.reduce((x, y) => x + y, 0) / va.length; sb += vb.reduce((x, y) => x + y, 0) / vb.length; n++; }
    return n ? `${f(sa / n, param === 'hs' ? 2 : 1)} vs ${f(sb / n, param === 'hs' ? 2 : 1)} (n${n})` : '–';
  };
  const dl: string[] = [];
  for (const b of LEAD_BUCKETS) dl.push(`hs ${b.key}: V2 vs DWD ${vs(V2_SOURCE, 'dwd', p => p.bucket === b.key, 'hs')} · V2 vs NZ ${vs(V2_SOURCE, 'nzsurf', p => p.bucket === b.key, 'hs')}`);
  dl.push(`hs <1 m: V2 vs NZ ${vs(V2_SOURCE, 'nzsurf', p => (p.obsHs ?? 0) < 1, 'hs')} · 1–2 m: ${vs(V2_SOURCE, 'nzsurf', p => (p.obsHs ?? 0) >= 1 && (p.obsHs ?? 0) < 2, 'hs')} · ≥2 m: ${vs(V2_SOURCE, 'nzsurf', p => (p.obsHs ?? 0) >= 2, 'hs')}`);
  dl.push(`wind ≥20 kn: V2 vs NZ ${vs(V2_SOURCE, 'nzsurf', p => (p.obsWindKn ?? 0) >= 20, 'windKn')} · <20: ${vs(V2_SOURCE, 'nzsurf', p => (p.obsWindKn ?? 0) < 20, 'windKn')}`);
  dl.push(`periode V2 vs NZ: ${vs(V2_SOURCE, 'nzsurf', () => true, 'tp')} · swellrichting d4+ V2-punten: ${pairs.filter(p => p.source === V2_SOURCE && p.param === 'dir' && (p.bucket === 'd4-5' || p.bucket === 'd6-7')).length}`);
  notice(`Direct ${spotId}`, dl);

  const oIdx = obsIndex(obs);
  const tObs = obsTruth(obs, DEFAULT_RULE), tRep = reportTruth(reports, spotId);
  const nRep = reports.filter(r => r.spotId === spotId && r.userRating).length;
  const ml = [
    diagnose(spotId, fc, 'nzsurf', tObs, 'meting (boeiregel)', oIdx),
    diagnose(spotId, fc, 'nzsurf-v2-live', tObs, 'meting (boeiregel)', oIdx),
    diagnose(spotId, fc, 'nzsurf', tRep, `meldingen (${nRep})`),
    diagnose(spotId, fc, 'nzsurf-v2-live', tRep, `meldingen (${nRep})`),
  ].filter((x): x is string => !!x);
  notice(`Missers ${spotId}`, ml.length ? ml : [`nog te weinig momenten (live v2 sinds ${fc.filter(d => d.source === 'nzsurf-v2-live').map(d => d.runDate).sort()[0] ?? 'nog niet'}; meldingen met oordeel: ${nRep})`]);
}
