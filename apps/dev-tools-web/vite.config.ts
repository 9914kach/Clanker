import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { clankerRepoMarkdownPlugin } from "./plugins/clankerRepoMarkdown";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(appDir, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
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
    port: 5174,
    strictPort: false,
    fs: {
      allow: [path.resolve(appDir, "../..")],
    },
  },
});
