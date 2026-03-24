/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Bas-URL för backend, t.ex. https://api.dindomän.se eller tom för samma host + /api */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
