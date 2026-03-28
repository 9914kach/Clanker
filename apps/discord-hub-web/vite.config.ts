import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const caddyDevHost = "dev.clanker.discord";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT;
  const directPort = Number(env.VITE_DIRECT_PORT) > 0 ? Number(env.VITE_DIRECT_PORT) : 5175;
  // Prefer explicit dev proxy target so root `PORT` (e.g. other services) does not break /api.
  const apiPortRaw =
    env.DISCORD_HUB_API_DEV_PORT?.trim() || env.PORT?.trim() || "";
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
