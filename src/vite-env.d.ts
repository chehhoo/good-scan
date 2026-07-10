/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOD_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
