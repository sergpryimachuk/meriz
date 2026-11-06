/// <reference types="vite/client" />

// Variables d'environnement du projet.
// VITE_API_URL : origine du serveur Meriz API (sans /api), lue
// uniquement par src/lib/apiConfig.ts.
// VITE_REVERB_* : serveur de direct (websocket), lu uniquement par
// src/lib/echoConfig.ts. Absentes, l'observation reste en
// rafraîchissement régulier.
// VITE_DEFAULT_TARGET : moteur des nouveaux documents, par exemple
// postgresql@17, lu uniquement par src/lib/defaultTarget.ts.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEFAULT_TARGET?: string
  readonly VITE_REVERB_APP_KEY?: string
  readonly VITE_REVERB_HOST?: string
  readonly VITE_REVERB_PORT?: string
  readonly VITE_REVERB_SCHEME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
