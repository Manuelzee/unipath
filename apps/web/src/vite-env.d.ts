/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key (pk_test_… or pk_live_…). Required for sign-in. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Optional Clerk Frontend API proxy URL. */
  readonly VITE_CLERK_PROXY_URL?: string;
  /** Public URL of the production site, used for the admin "open published app" link. */
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
