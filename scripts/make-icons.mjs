// Genereert de icoon-/splashbronnen in assets/ uit het NZ-logo.
// Bron: wit monogram op zwart. We trimmen de zwarte rand, schalen het logo en
// bouwen: een adaptieve voorgrond (wit logo, transparant) + zwarte achtergrond,
// een losstaand icoon (zwart vlak + wit logo) en splashschermen.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = process.argv[2];
if (!SRC) throw new Error('Geef het bronpad mee');
mkdirSync('assets', { recursive: true });

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Trim de zwarte rand zodat we het pure logo-vlak overhouden.
const trimmed = await sharp(SRC).trim({ threshold: 30 }).toBuffer();

// Wit logo met transparantie: luminantie van de bron wordt de alfa-laag.
async function whiteLogo(size) {
  const g = await sharp(trimmed)
    .resize({ width: size, height: size, fit: 'inside' })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = g.info;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = g.data[i]; // zwart -> 0 (transparant), wit -> 255
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function canvas(size, background, logoBuf) {
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toBuffer();
}

// Adaptief icoon (voorgrond binnen de veilige zone ~60%) + zwarte achtergrond.
const fg = await whiteLogo(600);
await sharp(await canvas(1024, TRANSPARENT, fg)).toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BLACK } })
  .png().toFile('assets/icon-background.png');

// Losstaand/legacy icoon: zwart vlak + groter wit logo.
const iconLogo = await whiteLogo(720);
await sharp(await canvas(1024, BLACK, iconLogo)).toFile('assets/icon-only.png');

// Splashschermen (licht + donker beide zwart met logo).
const splashLogo = await whiteLogo(900);
await sharp(await canvas(2732, BLACK, splashLogo)).toFile('assets/splash.png');
await sharp(await canvas(2732, BLACK, splashLogo)).toFile('assets/splash-dark.png');

console.log('assets/ gegenereerd: icon-foreground, icon-background, icon-only, splash, splash-dark');
