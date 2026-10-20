import { Capacitor } from '@capacitor/core';

/**
 * Bestand bewaren/exporteren. Op de website: gewone download. In de app (Android
 * WebView) werkt een download-link niet; daar schrijven we het bestand naar de
 * cache en openen we het deelmenu (opslaan in Bestanden/Drive, mailen, …).
 */
export async function saveFile(name: string, content: string, type: string): Promise<void> {
  // CSV met BOM, zodat Excel de tekens (é, °) goed leest.
  const data = /csv/i.test(type) && !content.startsWith('\uFEFF') ? `\uFEFF${content}` : content;
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Bestand opslaan of delen' });
    } catch (e: any) {
      // Annuleren van het deelmenu is geen fout.
      if (!/cancel/i.test(String(e?.message || e))) throw e;
    }
    return;
  }
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Binair bestand (bv. PDF) als base64 bewaren/delen; zelfde gedrag als saveFile. */
export async function saveBinaryFile(name: string, base64: string, type: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Bestand opslaan of delen' });
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message || e))) throw e;
    }
    return;
  }
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Zelfde als saveFile, maar toont een melding als het misgaat (voor knoppen). */
export function saveFileOrAlert(name: string, content: string, type: string): void {
  saveFile(name, content, type).catch(e => window.alert(`Exporteren mislukt: ${e?.message || e}`));
}
