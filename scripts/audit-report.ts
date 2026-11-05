// Het volledige auditrapport (eerlijke vergelijking) maken uit alle opgeslagen data, zonder
// de app. Alleen lezen uit Firestore; schrijft reports/audit-rapport.html. Draaien via de
// workflow "Audit: rapport maken".
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync } from 'node:fs';
import { AuditForecastDoc, AuditObsDoc, SpotReportLike, auditView, cleanObservations } from '../src/utils/forecastAudit';
import { buildV2Docs, V2_SOURCE } from '../src/utils/forecastV2';
import { buildFullReport } from '../src/utils/auditReport';
import type { WebcamMeasurement } from '../src/services/webcamMeasure';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) throw new Error('Ontbrekende env-var: FIREBASE_SERVICE_ACCOUNT');
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(sa)) }), process.env.FIRESTORE_DATABASE_ID || 'ai-studio-remixremixnoordz-046b6585-a0c1-4903-b816-9b6f82aa9b10');

const SPOTS = [
  { id: 'ouddorp-p-noordweg', name: 'Ouddorp', buoy: 'boei Maasgeul 2, 20 km van Ouddorp — oudere dagen Schouwenbank, 41 km' },
  { id: 'maasvlakte', name: 'Maasvlakte', buoy: 'boei Maasgeul 2, vlak voor de Maasvlakte (±5 km) — oudere dagen Schouwenbank' },
];

const [fcSnap, obsSnap, repSnap, camSnap] = await Promise.all([
  db.collection('auditForecasts').get(), db.collection('auditObservations').get(),
  db.collection('spotReports').get(), db.collection('auditRaw').where('kind', '==', 'webcam').get(),
]);
const docs = fcSnap.docs.map(d => d.data() as AuditForecastDoc);
const obs = cleanObservations(obsSnap.docs.map(d => d.data() as AuditObsDoc));
const reports = repSnap.docs.map(d => d.data() as SpotReportLike);
const webcam = camSnap.docs.map(d => d.data() as WebcamMeasurement).sort((a, b) => b.runAt.localeCompare(a.runAt));
const dates = obs.map(o => o.date).sort();
const fmtD = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');
const spots = SPOTS.map(sp => {
  const fc = auditView(docs.filter(f => (f.spotId || 'ouddorp-p-noordweg') === sp.id), sp.id);
  let v2: AuditForecastDoc[] = [];
  try { v2 = buildV2Docs(fc, obs); } catch (e) { console.warn('v2 niet berekend', e); }
  return { id: sp.id, name: sp.name, forecasts: [...fc, ...v2], buoyNote: sp.buoy };
});
const webcamSites = [...docs.filter(f => f.spotId === 'maasvlakte'), ...(spots.find(x => x.id === 'maasvlakte')?.forecasts.filter(f => f.source === V2_SOURCE) || [])];
const { html } = buildFullReport({ spots, observations: obs, reports, webcam, webcamSites, periodLabel: `alle gemeten data (${fmtD(dates[0])} t/m ${fmtD(dates[dates.length - 1])})` });
mkdirSync('reports', { recursive: true });
writeFileSync('reports/audit-rapport.html', html);
console.log(`::notice title=Rapport::${html.length} tekens, ${docs.length} verwachtingen, ${obs.length} meetdagen`);
