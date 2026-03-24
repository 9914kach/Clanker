import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { PluginContext } from "rollup";

const VIRTUAL_ID = "virtual:clanker-repo-md";
const RESOLVED = "\0" + VIRTUAL_ID;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".cursor",
]);

function collectMarkdownRelPaths(repoRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(path.relative(repoRoot, full));
      }
    }
  }
  walk(repoRoot);
  return out;
}

export function clankerRepoMarkdownPlugin(repoRoot: string): Plugin {
  return {
    name: "clanker-repo-markdown",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED;
    },
    load(this: PluginContext, id) {
      if (id !== RESOLVED) return null;

      const relPaths = collectMarkdownRelPaths(repoRoot);
      const lines: string[] = ["export const markdownBySlug = {"];

      for (const rel of relPaths) {
        const norm = rel.split(path.sep).join("/");
        const slug = norm.endsWith(".md") ? norm.slice(0, -3) : norm;
        const abs = path.join(repoRoot, norm);
        this.addWatchFile(abs);
        const body = fs.readFileSync(abs, "utf-8");
        lines.push(`  ${JSON.stringify(slug)}: ${JSON.stringify(body)},`);
      }

      lines.push("};");
      return lines.join("\n");
    },
  };
}
