import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    // Bronkaarten meeleveren (Lighthouse: "bronkaarten ontbreken"); de clientcode is
    // toch al openbaar en bevat geen geheimen (Gemini-sleutel zit op de server).
    // De APK-build zet NO_SOURCEMAP=true: de maps (~9 MB) horen niet in de app.
    build: {
      sourcemap: process.env.NO_SOURCEMAP !== 'true',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
