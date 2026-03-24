/**
 * API-anrop ska gå via denna bas-URL.
 * Utveckling: lämna tom och använd Vite-proxy mot /api (se vite.config.ts).
 * Produktion: sätt VITE_API_URL vid build om API ligger på annan host, annars tom + reverse proxy till /api.
 */
export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiBaseUrl();
  if (!base) return p;
  return `${base}${p}`;
}
