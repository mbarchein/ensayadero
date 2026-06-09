/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_URL: string
  readonly VITE_VAPID_PUBLIC_KEY: string
  readonly VITE_FACEBOOK_ENABLED: string
  readonly VITE_LEGAL_ENTITY: string
  readonly VITE_LEGAL_TAX_ID: string
  readonly VITE_LEGAL_ADDRESS: string
  readonly VITE_PRIVACY_EMAIL: string
  readonly VITE_CONTACT_EMAIL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
