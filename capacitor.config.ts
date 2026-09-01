import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nl.nzsurf.app',
  appName: 'Noordzee Surf Advies',
  webDir: 'dist',
  // De AI-endpoints (/api/*) draaien op een aparte Express-backend. In de APK
  // laadt de webview vanaf https://localhost, dus relatieve /api-calls falen en
  // valt de app terug op de offline adviesmotor. Wil je de AI-features actief
  // hebben, deploy dan server.ts en zet VITE_API_BASE bij de build naar die URL.
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Native Google-login: de plugin doet de sign-in buiten de WebView en levert
    // een idToken; daarmee loggen we in de Firebase JS-SDK in (signInWithCredential).
    // serverClientId = de Web-OAuth-client van het Firebase-project.
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '112380081133-48eq7joafhkficgm60023vmqno0o787j.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
