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
};

export default config;
