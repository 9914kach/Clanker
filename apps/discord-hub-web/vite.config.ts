import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const caddyDevHost = "dev.clanker.discord";

/**
 * hub-api loads `apps/discord-hub-api/.env` (override) for `PORT`; Vite only used to read repo root `.env`,
 * so `/api` proxied to 3001 while the API listened elsewhere. Parse the API env file for proxy target only.
 */
function readHubApiDevPortHints(
  root: string,
): { PORT?: string; DISCORD_HUB_API_DEV_PORT?: string } {
  const filePath = path.join(root, "apps/discord-hub-api/.env");
  const out: { PORT?: string; DISCORD_HUB_API_DEV_PORT?: string } = {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      if (key !== "PORT" && key !== "DISCORD_HUB_API_DEV_PORT") continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key === "PORT") out.PORT = val;
      else out.DISCORD_HUB_API_DEV_PORT = val;
    }
  } catch {
    /* missing or unreadable */
  }
  return out;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiEnv = readHubApiDevPortHints(repoRoot);
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT;
  const directPort = Number(env.VITE_DIRECT_PORT) > 0 ? Number(env.VITE_DIRECT_PORT) : 5175;
  // Root DISCORD_HUB_API_DEV_PORT wins; else match hub-api .env (same order as load order there); else root PORT; default 3001.
  const apiPortRaw =
    env.DISCORD_HUB_API_DEV_PORT?.trim() ||
    apiEnv.DISCORD_HUB_API_DEV_PORT?.trim() ||
    apiEnv.PORT?.trim() ||
    env.PORT?.trim() ||
    "";
  const apiPort = Number(apiPortRaw) > 0 ? Number(apiPortRaw) : 3001;
  const useDirectMode = mode === "direct";
  const useCaddyProxy = mode === "caddy";
  const serverBehindCaddyProxy =
    useCaddyProxy
    && hmrClientPort !== undefined
    && hmrClientPort !== ""
    && Number(hmrClientPort) > 0;
  const caddyClientPort = Number(hmrClientPort);

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      exclude: ["gridstack", "gridstack/dist/gridstack.js"],
    },
    resolve: {
      alias: {
        "@": path.resolve(appDir, "src"),
      },
    },
    server: {
      // Lyssna på alla interfaces så Caddy (Docker) kan nå Vite via host.docker.internal
      host: true,
      ...(useDirectMode && {
        port: directPort,
        strictPort: true,
      }),
      allowedHosts: [caddyDevHost, "localhost"],
      ...(serverBehindCaddyProxy && {
        origin: `http://${caddyDevHost}:${caddyClientPort}`,
        hmr: {
          host: caddyDevHost,
          protocol: "ws",
          clientPort: caddyClientPort,
        },
      }),
      // När discord-hub-api kör lokalt: proxa /api till backend under utveckling
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
