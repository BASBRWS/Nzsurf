// Injecteert een expliciete debug-signingConfig in het (in CI gegenereerde)
// android/app/build.gradle, zodat assembleDebug gegarandeerd onze vaste keystore
// gebruikt (android/app/nzsurf-debug.keystore) i.p.v. een door AGP zelf
// gegenereerde debug-key. Nodig voor een stabiele SHA-1 (native Google-login).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const p = 'android/app/build.gradle';
let s = readFileSync(p, 'utf8');

if (s.includes('signingConfigs')) {
  console.log('signingConfigs al aanwezig; niet gewijzigd');
  process.exit(0);
}

const block = [
  '    signingConfigs {',
  '        debug {',
  "            storeFile file('nzsurf-debug.keystore')",
  "            storePassword 'android'",
  "            keyAlias 'androiddebugkey'",
  "            keyPassword 'android'",
  '        }',
  '    }',
  '',
].join('\n');

// Voeg het blok direct na de eerste 'android {' toe.
s = s.replace(/android\s*\{/, (m) => m + '\n' + block);
writeFileSync(p, s);

if (!existsSync('android/app/nzsurf-debug.keystore')) {
  console.warn('LET OP: android/app/nzsurf-debug.keystore ontbreekt');
}
console.log('signingConfig geinjecteerd');
