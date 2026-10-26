// Terugtoets NzSurf v2 tegen NzSurf, hybride, concept en de beste andere bron, op alle
// opgeslagen auditdata. Alleen lezen. Resultaat als ::notice-annotaties (één per spot)
// zodat het zonder logtoegang te lezen is. Draaien: workflow "Voorspellingsaudit" met
// backtest = true.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AuditForecastDoc, AuditObsDoc, PARAMS, LEAD_BUCKETS, auditView, buildPairs, cleanObservations, fairScores, scorePairs } from '../src/utils/forecastAudit';
import { buildConceptDocs, CONCEPT_SOURCE } from '../src/utils/forecastBlend';
import { buildHybridDocs, HYBRID_SOURCE } from '../src/utils/forecastHybrid';
import { buildV2Docs, V2_SOURCE } from '../src/utils/forecastV2';
import { DEFAULT_RULE, componentRanking, componentScores, dayRanking, dayScores, obsTruth, pairedSurfScores } from '../src/utils/surfVerdict';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) throw new Error('Ontbrekende env-var: FIREBASE_SERVICE_ACCOUNT');
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(sa)) }), process.env.FIRESTORE_DATABASE_ID || 'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10');

const OURS = ['nzsurf', CONCEPT_SOURCE, HYBRID_SOURCE, V2_SOURCE, 'v2-zonder'];
const SHORT: Record<string, string> = { nzsurf: 'NZ', [CONCEPT_SOURCE]: 'concept', [HYBRID_SOURCE]: 'hybride', [V2_SOURCE]: 'V2', 'v2-zonder': 'V2-0' };
const f = (x: number, d = 2) => x.toFixed(d);
const notice = (title: string, lines: string[]) => console.log(`::notice title=${title}::${lines.join('%0A')}`);

const [fcSnap, obsSnap] = await Promise.all([db.collection('auditForecasts').get(), db.collection('auditObservations').get()]);
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
}
