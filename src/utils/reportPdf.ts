// HTML-rapport → PDF (A4), in de app en op de website, zonder server.
//
// Het rapport wordt in een onzichtbaar frame op A4-breedte opgemaakt, als één beeld
// vastgelegd (html2canvas) en in pagina's geknipt. Knippen gebeurt alleen tussen
// blokken (alinea's, grafieken, tabelrijen), zodat niets doormidden gaat.
// De bibliotheken worden pas geladen als iemand op de PDF-knop tikt.

const PAGE_W = 794;               // A4 bij 96 dpi
const PAGE_H = 1123;
const MARGIN = 36;
const CONTENT_H = PAGE_H - 2 * MARGIN;

/** Maakt een PDF van een volledige HTML-pagina; geeft base64 (zonder data:-voorvoegsel). */
export async function htmlToPdfBase64(html: string, onStatus?: (s: string) => void): Promise<string> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  onStatus?.('opmaken…');
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    await new Promise(r => setTimeout(r, 300));
    // A4-breedte, marges in de pagina zelf.
    doc.body.style.maxWidth = `${PAGE_W - 2 * MARGIN}px`;
    doc.body.style.margin = '0';
    doc.body.style.padding = `0 ${MARGIN}px`;
    frame.style.height = `${doc.documentElement.scrollHeight}px`;
    await new Promise(r => setTimeout(r, 100));

    // Veilige knippunten: onderkant van elk blok en elke tabelrij (in CSS-pixels).
    const cuts = new Set<number>();
    const bodyTop = doc.body.getBoundingClientRect().top;
    // Na een kop (of de inleidende regel eronder) nooit knippen: die gaat mee met zijn inhoud.
    const glued = (el: Element) => /^H[1-3]$/.test(el.tagName)
      || (el.tagName === 'P' && el.classList.contains('meta') && /^H[1-3]$/.test(el.previousElementSibling?.tagName || ''))
      || el.tagName === 'FIGCAPTION';
    doc.body.querySelectorAll('h1,h2,h3,p,ul,li,figure,table,tr,div.sum,div.legend,div.pair,section').forEach(el => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (/^H[1-3]$/.test(el.tagName)) { cuts.add(Math.round(r.top - bodyTop - 4)); return; }
      if (!glued(el)) cuts.add(Math.round(r.bottom - bodyTop));
    });
    // Knippunten binnen een tabelkop, vlak na een kop of na een legenda vallen weg.
    doc.body.querySelectorAll('h1,h2,h3,thead,div.legend').forEach(el => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const b = Math.round(r.bottom - bodyTop);
      for (const c of [...cuts]) if (c > Math.round(r.top - bodyTop) && c <= b + 30) cuts.delete(c);
    });
    const sorted = [...cuts].filter(c => c > 0).sort((a, b) => a - b);
    const total = Math.ceil(doc.body.scrollHeight);

    onStatus?.('vastleggen…');
    const scale = 2;
    const canvas = await html2canvas(doc.body, { scale, backgroundColor: '#ffffff', windowWidth: PAGE_W, useCORS: true, logging: false });

    onStatus?.('pagina’s maken…');
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'], compress: true });
    let y = 0, page = 0;
    while (y < total - 2) {
      // Knip bij het laatste veilige punt binnen de pagina; anders hard op de paginahoogte.
      const limit = y + CONTENT_H;
      const cut = sorted.filter(c => c > y + 40 && c <= limit).pop() ?? Math.min(limit, total);
      const h = Math.max(1, cut - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = Math.ceil(h * scale);
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.floor(y * scale), canvas.width, Math.ceil(h * scale), 0, 0, slice.width, slice.height);
      if (page > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, MARGIN, PAGE_W, h);
      page++;
      pdf.setFontSize(8); pdf.setTextColor(120);
      pdf.text(`${page}`, PAGE_W - MARGIN, PAGE_H - 14, { align: 'right' });
      y = cut;
    }
    return pdf.output('datauristring').split(',')[1];
  } finally {
    frame.remove();
  }
}
