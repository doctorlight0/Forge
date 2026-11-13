/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string
  readonly VITE_USE_BACKEND_PROXY?: string
  readonly VITE_ESCROW_CONTRACT_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css'
declare module '@near-wallet-selector/modal-ui/styles.css'
