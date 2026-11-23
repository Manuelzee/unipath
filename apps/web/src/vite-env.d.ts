/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the production site, used for the admin "open published app" link. */
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
