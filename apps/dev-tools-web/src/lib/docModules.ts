/**
 * All markdown i Clanker-repot (byggtid / dev-start), grupperat per app/område i menyn.
 * Innehåll laddas via Vite-pluginen `clankerRepoMarkdown` (virtual:clanker-repo-md) så att
 * filer utanför apps/dev-tools-web (t.ex. andra webbappar under apps/) inkluderas.
 */
import { markdownBySlug } from "virtual:clanker-repo-md";

const modules: Record<string, string> = markdownBySlug;

export function getDocSlugs(): string[] {
  return Object.keys(modules).sort((a, b) => a.localeCompare(b));
}

/** Gruppnyckel för sidomenyn: repo-rot, app-namn, docs, pihole, … */
function categoryKeyForSlug(slug: string): string {
  if (!slug.includes("/")) return "Repository";
  const [a, b] = slug.split("/");
  if (a === "apps") return b ?? "apps";
  if (a === "docs") return "docs (repo)";
  if (a === "pihole") return "Pi-hole";
  return a;
}

function categorySortRank(key: string): number {
  if (key === "Repository") return 0;
  if (key === "docs (repo)") return 1;
  if (key === "Pi-hole") return 2;
  return 10;
}

export function groupSlugsByCategory(slugs: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const slug of slugs) {
    const cat = categoryKeyForSlug(slug);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(slug);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      const ra = categorySortRank(a);
      const rb = categorySortRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, "sv");
    }),
  );
}

export function getDocMarkdown(slug: string): string | undefined {
  return modules[slug];
}
