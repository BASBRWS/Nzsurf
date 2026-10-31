// "Scan Secret Swell": NzSurf opent de Secret Swell-app en kijkt mee (schermopname, met
// toestemming van Android). Jij scrolt door Ouddorp en de Maasvlakte; NzSurf bewaart één
// beeld per stilstaande scrollpositie. Terug in NzSurf (of via de melding) stopt het
// meekijken; de AI leest de beelden af zoals bij schermafbeeldingen.
//
// Native deel: plugins/nzs-screen-scan (MediaProjection + voorgronddienst). Alleen Android.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { importSecretSwellFrames } from './secretSwellImport';

export const SECRETSWELL_PACKAGE = 'com.secretswell.app';

interface ScreenScanPlugin {
  isInstalled(o: { packageName: string }): Promise<{ installed: boolean }>;
  start(o: { packageName: string; intervalMs?: number; width?: number }): Promise<{ started: boolean }>;
  status(): Promise<{ running: boolean; frames: number }>;
  stop(o?: { dropLastMs?: number }): Promise<{ frames: { at: number; jpeg: string }[] }>;
}
const ScreenScan = registerPlugin<ScreenScanPlugin>('ScreenScan');

export const canScanApp = () => Capacitor.getPlatform() === 'android';

/**
 * Start meekijken en wacht tot de gebruiker terug is in NzSurf. Geeft de beelden terug.
 * `onStatus` krijgt tussentijdse meldingen.
 */
export async function scanSecretSwellApp(onStatus: (s: string) => void): Promise<{ at: number; jpeg: string }[]> {
  if (!canScanApp()) throw new Error('Meekijken kan alleen in de Android-app.');
  const { installed } = await ScreenScan.isInstalled({ packageName: SECRETSWELL_PACKAGE });
  if (!installed) throw new Error('De Secret Swell-app staat niet op deze telefoon.');
  onStatus('Geef toestemming om mee te kijken (kies bij voorkeur alleen de Secret Swell-app).');
  await ScreenScan.start({ packageName: SECRETSWELL_PACKAGE, intervalMs: 1200, width: 720 });
  onStatus('Secret Swell is open: scroll rustig door Ouddorp en de Maasvlakte en kom dan terug naar NzSurf.');
  // Wachten tot NzSurf weer voorgrond is (na even weg geweest te zijn).
  await new Promise<void>(resolve => {
    let away = false;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { away = true; return; }
      if (away) { document.removeEventListener('visibilitychange', onVis); resolve(); }
    };
    document.addEventListener('visibilitychange', onVis);
  });
  const { frames } = await ScreenScan.stop({ dropLastMs: 2500 });
  return frames;
}

export async function scanAndImportSecretSwell(onStatus: (s: string) => void) {
  const frames = await scanSecretSwellApp(onStatus);
  if (!frames.length) throw new Error('Geen beelden vastgelegd. Scroll wat langzamer (even stilhouden per scherm) en probeer opnieuw.');
  onStatus(`${frames.length} beelden vastgelegd; aflezen…`);
  return importSecretSwellFrames(frames.slice(0, 24), onStatus);
}
