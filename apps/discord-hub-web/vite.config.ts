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
  const serverBehindCaddyProxy =
    hmrClientPort !== undefined && hmrClientPort !== "" && Number(hmrClientPort) > 0;

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(appDir, "src"),
      },
    },
    server: {
      // Lyssna på alla interfaces så Caddy (Docker) kan nå Vite via host.docker.internal
      host: true,
      allowedHosts: [caddyDevHost, "localhost"],
      ...(serverBehindCaddyProxy && {
        origin: `http://${caddyDevHost}`,
        hmr: {
          host: caddyDevHost,
          protocol: "ws",
          clientPort: Number(hmrClientPort),
        },
      }),
      // När discord-hub-api kör lokalt: proxa /api till backend under utveckling
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
