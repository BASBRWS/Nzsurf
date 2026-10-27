// Zet een release-signingConfig in het (in CI gegenereerde) android/app/build.gradle,
// met de upload-sleutel voor Google Play. Wachtwoorden komen uit omgevingsvariabelen,
// niet uit het bestand.
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'android/app/build.gradle';
let s = readFileSync(p, 'utf8');
if (s.includes('nzsurf-upload.jks')) { console.log('release-signing al aanwezig'); process.exit(0); }

const block = [
  '    signingConfigs {',
  '        release {',
  "            storeFile file('nzsurf-upload.jks')",
  "            storePassword System.getenv('UPLOAD_KEYSTORE_PASSWORD')",
  "            keyAlias System.getenv('UPLOAD_KEY_ALIAS')",
  "            keyPassword System.getenv('UPLOAD_KEY_PASSWORD')",
  '        }',
  '    }',
  '',
].join('\n');
s = s.replace(/android\s*\{/, m => m + '\n' + block);
// De release-buildType gebruikt deze sleutel.
s = s.replace(/release\s*\{\s*\n(\s*)minifyEnabled/, (m, ind) => `release {\n${ind}signingConfig signingConfigs.release\n${ind}minifyEnabled`);
if (!/signingConfig signingConfigs\.release/.test(s)) { console.error('Kon release-buildType niet vinden'); process.exit(1); }
writeFileSync(p, s);
console.log('release-signing geïnjecteerd');
