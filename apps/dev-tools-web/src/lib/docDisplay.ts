/**
 * Visningsnamn för docs-menyn och sidhuvuden (inte URL-slugs).
 */

/** Interna kategorinycklar → rubrik i sidomenyn */
const CATEGORY_HEADINGS: Record<string, string> = {
  Repository: "Clanker",
  "docs (repo)": "Homelab-docs",
  "Pi-hole": "Pi-hole",
};

/** apps/<mappnamn> → läsbart namn */
const APP_HEADINGS: Record<string, string> = {
  "discord-hub-web": "Discord hub — webb",
  "discord-hub-api": "Discord hub — API",
  "dev-tools-web": "Dev tools",
};

function humanizeSegment(segment: string): string {
  const s = segment.replace(/[-_]+/g, " ").trim();
  if (!s) return segment;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lastSegment(slug: string): string {
  const i = slug.lastIndexOf("/");
  return i === -1 ? slug : slug.slice(i + 1);
}

/** Första topprubriken `# …` i markdown (ignorerar tomma rader). */
export function extractFirstH1(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("# ") && !t.startsWith("##")) {
      return t.slice(2).trim().replace(/\s+#+\s*$/, "").trim();
    }
    break;
  }
  return undefined;
}

export function getCategoryHeading(categoryKey: string): string {
  if (CATEGORY_HEADINGS[categoryKey]) return CATEGORY_HEADINGS[categoryKey];
  if (APP_HEADINGS[categoryKey]) return APP_HEADINGS[categoryKey];
  return humanizeSegment(categoryKey);
}

/**
 * Titel i menyn: gärna H1 om den är kort nog; annars mänsklig sökväg.
 * (Undvik megalonga menyrader.)
 */
const NAV_H1_MAX = 52;

export function getDocNavTitle(
  slug: string,
  markdown: string | undefined,
): string {
  if (markdown) {
    const h1 = extractFirstH1(markdown);
    if (h1 && h1.length <= NAV_H1_MAX) return h1;
  }
  return getDocTitleFallback(slug);
}

/** Sidans huvudrubrik ovanför innehållet. */
export function getDocPageTitle(
  slug: string,
  markdown: string | undefined,
): string {
  if (markdown) {
    const h1 = extractFirstH1(markdown);
    if (h1) return h1;
  }
  return getDocTitleFallback(slug);
}

function getDocTitleFallback(slug: string): string {
  const base = lastSegment(slug);
  if (base === "README") return "Översikt";
  return humanizeSegment(base);
}
