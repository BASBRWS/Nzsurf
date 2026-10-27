/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Buildnummer van de APK (GitHub Actions run_number); leeg op de website. */
  readonly VITE_BUILD_NUMBER?: string;
  readonly VITE_DISTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
