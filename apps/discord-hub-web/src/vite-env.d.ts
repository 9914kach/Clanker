/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Bas-URL för backend, t.ex. https://api.dindomän.se eller tom för samma host + /api */
  readonly VITE_API_URL?: string;
  /** Optional websocket base URL for shared wheel collaboration, e.g. ws://localhost:3002 */
  readonly VITE_WHEEL_COLLAB_URL?: string;
  /** Guild snowflake för server-widget på dashboard (bot + gateway måste vara konfigurerade i API) */
  readonly VITE_DISCORD_HUB_GUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
