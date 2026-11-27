/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the production site, used for the admin "open published app" link. */
  readonly VITE_PUBLIC_APP_URL?: string;
  /** Support email shown on the About, Privacy and Terms pages. */
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
