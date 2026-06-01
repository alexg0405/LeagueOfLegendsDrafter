/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_NEXUS_WEB: '0' | '1'
  readonly VITE_NEXUS_TAURI: '0' | '1'
}
