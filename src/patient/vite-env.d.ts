/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APOTH_STAGE?: "production" | "staging";
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
