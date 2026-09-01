/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constanten (zie define in vite.config.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_NUMBER__: string;
