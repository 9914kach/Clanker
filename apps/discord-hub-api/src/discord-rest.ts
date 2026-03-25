import type { AppEnv } from "./env.js";
import type { DiscordTokenPayload } from "./discord-tokens.js";

export const DISCORD_API_V10 = "https://discord.com/api/v10";

export type DiscordTokenExchangeResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export async function exchangeAuthorizationCode(
  env: AppEnv,
  code: string,
): Promise<DiscordTokenExchangeResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.discordRedirectUri,
  });
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordTokenExchangeResponse>;
}

export async function refreshAccessToken(
  env: AppEnv,
  refreshToken: string,
): Promise<DiscordTokenExchangeResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordTokenExchangeResponse>;
}

export function tokenPayloadFromExchange(
  exchanged: DiscordTokenExchangeResponse,
): DiscordTokenPayload {
  const expires_at_ms = Date.now() + exchanged.expires_in * 1000;
  return {
    access_token: exchanged.access_token,
    refresh_token: exchanged.refresh_token ?? null,
    expires_at_ms,
    scope: exchanged.scope,
  };
}

export function mergeRefreshIntoPayload(
  previous: DiscordTokenPayload,
  exchanged: DiscordTokenExchangeResponse,
): DiscordTokenPayload {
  const expires_at_ms = Date.now() + exchanged.expires_in * 1000;
  return {
    access_token: exchanged.access_token,
    refresh_token:
      exchanged.refresh_token ?? previous.refresh_token ?? null,
    expires_at_ms,
    scope: exchanged.scope,
  };
}

export type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
};

function normalizeDiscordUser(raw: Record<string, unknown>): DiscordUser {
  return {
    id: String(raw.id),
    username: String(raw.username),
    avatar: typeof raw.avatar === "string" ? raw.avatar : null,
    global_name: typeof raw.global_name === "string" ? raw.global_name : null,
    banner: typeof raw.banner === "string" ? raw.banner : null,
    accent_color:
      typeof raw.accent_color === "number" && Number.isFinite(raw.accent_color)
        ? raw.accent_color
        : null,
  };
}

export async function fetchDiscordUsersMe(
  accessToken: string,
): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API_V10}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord @me failed: ${res.status} ${text}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return normalizeDiscordUser(raw);
}

export type DiscordOAuth2Me = {
  application: { id: string; name?: string };
  scopes: string[];
  expires: string;
  user?: { id: string; username: string };
};

export async function fetchDiscordOAuth2Me(
  accessToken: string,
): Promise<DiscordOAuth2Me> {
  const res = await fetch(`${DISCORD_API_V10}/oauth2/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord oauth2/@me failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordOAuth2Me>;
}

const PROXY_PATH_SAFE = /^[a-zA-Z0-9/@._:-]+$/;

export function assertDiscordProxyPath(pathAfterPrefix: string): string {
  const trimmed = pathAfterPrefix.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed.length === 0) {
    throw new Error("empty path");
  }
  if (trimmed.includes("..") || trimmed.includes("\\")) {
    throw new Error("invalid path");
  }
  if (!PROXY_PATH_SAFE.test(trimmed)) {
    throw new Error("invalid path characters");
  }
  return trimmed;
}

export function pathMatchesAllowlist(
  path: string,
  prefixes: readonly string[],
): boolean {
  if (prefixes.length === 0) {
    return false;
  }
  for (const raw of prefixes) {
    const base = raw.trim().replace(/\/+$/, "");
    if (base.length === 0) {
      continue;
    }
    if (path === base || path.startsWith(`${base}/`)) {
      return true;
    }
  }
  return false;
}

const RATE_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-reset-after",
  "x-ratelimit-bucket",
  "x-ratelimit-scope",
  "retry-after",
] as const;

export function forwardRateLimitHeaders(
  from: Headers,
  to: Headers,
): void {
  for (const h of RATE_HEADERS) {
    const v = from.get(h);
    if (v) {
      to.set(h, v);
    }
  }
}
