const modules = import.meta.glob<string>("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const DOC_PREFIX = "../../docs/";
const DOC_SUFFIX = ".md";

export function filePathToSlug(filePath: string): string {
  if (!filePath.startsWith(DOC_PREFIX) || !filePath.endsWith(DOC_SUFFIX)) {
    return "";
  }
  return filePath.slice(DOC_PREFIX.length, -DOC_SUFFIX.length);
}

export function slugToFilePath(slug: string): string {
  return `${DOC_PREFIX}${slug}${DOC_SUFFIX}`;
}

export function getDocSlugs(): string[] {
  return Object.keys(modules)
    .map(filePathToSlug)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function getDocMarkdown(slug: string): string | undefined {
  const key = slugToFilePath(slug);
  return modules[key];
}

export function groupSlugsByCategory(slugs: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const slug of slugs) {
    const slash = slug.indexOf("/");
    const category = slash === -1 ? "—" : slug.slice(0, slash);
    if (!map.has(category)) map.set(category, []);
    map.get(category)!.push(slug);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}
