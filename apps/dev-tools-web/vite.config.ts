import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { clankerRepoMarkdownPlugin } from "./plugins/clankerRepoMarkdown";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
/** Samma värdnamn som Caddy (dev.clanker.tools). */
const caddyDevHost = "dev.clanker.tools";

const pkg = JSON.parse(
  fs.readFileSync(path.join(appDir, "package.json"), "utf-8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // process.env innehåller inte .env automatiskt — loadEnv läser repots rot (envDir).
  const env = loadEnv(mode, repoRoot, "");
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT;
  const serverBehindCaddyProxy =
    hmrClientPort !== undefined && hmrClientPort !== "" && Number(hmrClientPort) > 0;

  return {
    envDir: repoRoot,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME_ISO__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [clankerRepoMarkdownPlugin(repoRoot), react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(appDir, "src"),
      },
    },
    server: {
      host: true,
      allowedHosts: [caddyDevHost, "localhost"],
      port: 5174,
      strictPort: false,
      ...(serverBehindCaddyProxy && {
        origin: `http://${caddyDevHost}`,
        hmr: {
          host: caddyDevHost,
          protocol: "ws",
          clientPort: Number(hmrClientPort),
        },
      }),
      fs: {
        allow: [path.resolve(appDir, "../..")],
      },
    },
  };
});
