import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  assertDiscordProxyPath,
  DISCORD_API_V10,
  forwardRateLimitHeaders,
  mergeRefreshIntoPayload,
  pathMatchesAllowlist,
  refreshAccessToken,
  tokenPayloadFromExchange,
  type DiscordTokenExchangeResponse,
} from "./discord-rest.js";
import type { AppEnv } from "./env.js";
import {
  DISCORD_OAUTH_TOKENS_COOKIE,
  sealDiscordTokens,
  unsealDiscordTokens,
  type DiscordTokenPayload,
} from "./discord-tokens.js";
import { COOKIE_NAME, signSession, type SessionPayload } from "./session.js";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionCookieOptions(env: AppEnv) {
  return {
    path: "/" as const,
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "Lax" as const,
    maxAge: SESSION_MAX_AGE,
  };
}

function oauthTokensCookieOptions(env: AppEnv) {
  return {
    path: "/" as const,
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "Lax" as const,
    maxAge: SESSION_MAX_AGE,
  };
}

function scopesFromScopeString(scope: string): string[] {
  return scope.split(/\s+/).filter(Boolean);
}

function authExpiresIso(payload: DiscordTokenPayload): string {
  return new Date(payload.expires_at_ms).toISOString();
}

async function applyTokenRefreshToCookies(
  c: Context,
  env: AppEnv,
  session: SessionPayload,
  nextPayload: DiscordTokenPayload,
): Promise<void> {
  const sealed = await sealDiscordTokens(env.sessionSecret, nextPayload);
  setCookie(c, DISCORD_OAUTH_TOKENS_COOKIE, sealed, oauthTokensCookieOptions(env));
  const jwt = await signSession(env.sessionSecret, {
    sub: session.sub,
    username: session.username,
    avatar: session.avatar,
    global_name: session.global_name,
    banner: session.banner,
    accent_color: session.accent_color,
    discordScopes: scopesFromScopeString(nextPayload.scope),
    discordAuthExpires: authExpiresIso(nextPayload),
  });
  setCookie(c, COOKIE_NAME, jwt, sessionCookieOptions(env));
}

export type ResolvedUserTokens =
  | { ok: true; payload: DiscordTokenPayload }
  | { ok: false; reason: string };

export async function resolveUserDiscordTokens(
  c: Context,
  env: AppEnv,
  session: SessionPayload,
): Promise<ResolvedUserTokens> {
  const sealed = getCookie(c, DISCORD_OAUTH_TOKENS_COOKIE);
  if (!sealed) {
    return { ok: false, reason: "missing_oauth_tokens" };
  }
  let payload = await unsealDiscordTokens(env.sessionSecret, sealed);
  if (!payload) {
    return { ok: false, reason: "invalid_oauth_tokens" };
  }

  if (payload.expires_at_ms <= Date.now() + TOKEN_REFRESH_SKEW_MS) {
    if (!payload.refresh_token) {
      return { ok: false, reason: "expired_no_refresh" };
    }
    try {
      const exchanged = await refreshAccessToken(env, payload.refresh_token);
      payload = mergeRefreshIntoPayload(payload, exchanged);
      await applyTokenRefreshToCookies(c, env, session, payload);
    } catch {
      return { ok: false, reason: "refresh_failed" };
    }
  }

  return { ok: true, payload };
}

function discordTargetUrl(c: Context, starPath: string): string {
  const u = new URL(c.req.url);
  return `${DISCORD_API_V10}/${starPath}${u.search}`;
}

async function forwardDiscordRequest(
  method: string,
  targetUrl: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Clanker-discord-hub-api/1.0");
  }
  return fetch(targetUrl, { ...init, method, headers });
}

export async function proxyUserDiscordApi(
  c: Context,
  env: AppEnv,
  session: SessionPayload,
  starPath: string,
): Promise<Response> {
  let path: string;
  try {
    path = assertDiscordProxyPath(starPath);
  } catch {
    return c.json({ error: "Invalid path" }, 400);
  }
  if (!pathMatchesAllowlist(path, env.discordUserProxyPrefixes)) {
    return c.json({ error: "Path not allowed" }, 403);
  }

  const resolved = await resolveUserDiscordTokens(c, env, session);
  if (!resolved.ok) {
    return c.json({ error: "Discord token unavailable", code: resolved.reason }, 401);
  }
  const { payload } = resolved;

  const targetUrl = discordTargetUrl(c, path);
  const method = c.req.method;
  const reqHeaders = new Headers();
  const ct = c.req.header("content-type");
  if (ct) {
    reqHeaders.set("Content-Type", ct);
  }
  reqHeaders.set("Authorization", `Bearer ${payload.access_token}`);

  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await c.req.arrayBuffer() : undefined;

  let res = await forwardDiscordRequest(method, targetUrl, {
    headers: reqHeaders,
    body: hasBody && body && body.byteLength > 0 ? body : undefined,
  });

  if (res.status === 401 && payload.refresh_token) {
    try {
      const exchanged = await refreshAccessToken(env, payload.refresh_token);
      const nextPayload = mergeRefreshIntoPayload(payload, exchanged);
      await applyTokenRefreshToCookies(c, env, session, nextPayload);
      reqHeaders.set("Authorization", `Bearer ${nextPayload.access_token}`);
      res = await forwardDiscordRequest(method, targetUrl, {
        headers: reqHeaders,
        body: hasBody && body && body.byteLength > 0 ? body : undefined,
      });
    } catch {
      /* fall through with original 401 */
    }
  }

  const out = new Response(res.body, { status: res.status, statusText: res.statusText });
  forwardRateLimitHeaders(res.headers, out.headers);
  const outCt = res.headers.get("content-type");
  if (outCt) {
    out.headers.set("Content-Type", outCt);
  }
  return out;
}

export async function proxyBotDiscordApi(
  c: Context,
  env: AppEnv,
  starPath: string,
): Promise<Response> {
  if (!env.discordBotToken) {
    return c.json({ error: "Bot proxy not configured" }, 503);
  }

  let path: string;
  try {
    path = assertDiscordProxyPath(starPath);
  } catch {
    return c.json({ error: "Invalid path" }, 400);
  }
  if (!pathMatchesAllowlist(path, env.discordBotProxyPrefixes)) {
    return c.json({ error: "Path not allowed" }, 403);
  }

  const targetUrl = discordTargetUrl(c, path);
  const method = c.req.method;
  const reqHeaders = new Headers();
  const ct = c.req.header("content-type");
  if (ct) {
    reqHeaders.set("Content-Type", ct);
  }
  reqHeaders.set("Authorization", `Bot ${env.discordBotToken}`);

  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await c.req.arrayBuffer() : undefined;

  const res = await forwardDiscordRequest(method, targetUrl, {
    headers: reqHeaders,
    body: hasBody && body && body.byteLength > 0 ? body : undefined,
  });

  const out = new Response(res.body, { status: res.status, statusText: res.statusText });
  forwardRateLimitHeaders(res.headers, out.headers);
  const outCt = res.headers.get("content-type");
  if (outCt) {
    out.headers.set("Content-Type", outCt);
  }
  return out;
}

export async function setOAuthCookiesAfterLogin(
  c: Context,
  env: AppEnv,
  session: SessionPayload,
  exchanged: DiscordTokenExchangeResponse,
): Promise<void> {
  const payload = tokenPayloadFromExchange(exchanged);
  const sealed = await sealDiscordTokens(env.sessionSecret, payload);
  setCookie(c, DISCORD_OAUTH_TOKENS_COOKIE, sealed, oauthTokensCookieOptions(env));
  const jwt = await signSession(env.sessionSecret, {
    ...session,
    discordScopes: scopesFromScopeString(payload.scope),
    discordAuthExpires: authExpiresIso(payload),
  });
  setCookie(c, COOKIE_NAME, jwt, sessionCookieOptions(env));
}
