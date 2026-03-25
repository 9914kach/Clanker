import { config as loadDotenv } from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGuildSummary } from "./bot-guild-summary.js";
import { assertBotGuildAccess } from "./bot-guild-access.js";
import {
  exchangeAuthorizationCode,
  fetchDiscordOAuth2Me,
  fetchDiscordUsersMe,
} from "./discord-rest.js";
import {
  proxyBotDiscordApi,
  proxyUserDiscordApi,
  resolveUserDiscordTokens,
  setOAuthCookiesAfterLogin,
} from "./discord-proxy.js";
import { DISCORD_OAUTH_TOKENS_COOKIE } from "./discord-tokens.js";
import {
  getGatewayRuntime,
  startDiscordGateway,
} from "./discord-gateway.js";
import type { AppEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { COOKIE_NAME, verifySession, type SessionPayload } from "./session.js";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE = 600;

type LeagueRegion = "EUW" | "EUNE" | "NA" | "KR" | "BR";

type LeagueConnection = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

const leagueConnections = new Map<string, LeagueConnection>();

function secureCookie(env: AppEnv): boolean {
  return env.nodeEnv === "production";
}

function discordAuthorizeUrl(env: AppEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.discordClientId,
    redirect_uri: env.discordRedirectUri,
    response_type: "code",
    scope: env.discordOAuthScopes,
    state,
  });
  if (env.discordOAuthPrompt) {
    params.set("prompt", env.discordOAuthPrompt);
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function extractProxySuffix(fullPath: string, mount: string): string | null {
  if (fullPath === mount || fullPath === `${mount}/`) {
    return "";
  }
  const withSlash = `${mount}/`;
  if (!fullPath.startsWith(withSlash)) {
    return null;
  }
  return fullPath.slice(withSlash.length);
}

function parseLeagueRegion(value: unknown): LeagueRegion | null {
  if (
    value === "EUW" ||
    value === "EUNE" ||
    value === "NA" ||
    value === "KR" ||
    value === "BR"
  ) {
    return value;
  }
  return null;
}

function parseLeaguePayload(raw: unknown): {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
} | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const riotId = typeof payload.riotId === "string" ? payload.riotId.trim() : "";
  const tagLine =
    typeof payload.tagLine === "string"
      ? payload.tagLine.trim().replace(/^#/, "")
      : "";
  const region = parseLeagueRegion(payload.region);
  const autoSync = payload.autoSync === true;
  const rankPreference = payload.rankPreference === "flex" ? "flex" : "solo";
  const statusMessage =
    typeof payload.statusMessage === "string" ? payload.statusMessage.trim() : "";

  if (!riotId || !tagLine || !region) {
    return null;
  }

  return {
    riotId,
    tagLine,
    region,
    autoSync,
    rankPreference,
    statusMessage,
  };
}

async function requireSession(
  env: AppEnv,
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }
  return verifySession(env.sessionSecret, token);
}

function createApp(env: AppEnv) {
  const app = new Hono();

  app.get("/api/auth/discord", (c) => {
    const state = randomBytes(32).toString("hex");
    setCookie(c, STATE_COOKIE, state, {
      path: "/",
      httpOnly: true,
      secure: secureCookie(env),
      sameSite: "Lax",
      maxAge: STATE_MAX_AGE,
    });
    return c.redirect(discordAuthorizeUrl(env, state));
  });

  app.get("/api/auth/discord/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const err = c.req.query("error");
    const redirectFail = `${env.frontendUrl}/login?error=oauth`;

    if (err) {
      deleteCookie(c, STATE_COOKIE, { path: "/" });
      return c.redirect(redirectFail);
    }

    const stored = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    if (!code || !state || !stored || !timingSafeEqualString(stored, state)) {
      return c.redirect(redirectFail);
    }

    try {
      const exchanged = await exchangeAuthorizationCode(env, code);
      const user = await fetchDiscordUsersMe(exchanged.access_token);
      const baseSession = {
        sub: user.id,
        username: user.username,
        avatar: user.avatar,
        global_name: user.global_name,
        banner: user.banner,
        accent_color: user.accent_color,
      };
      await setOAuthCookiesAfterLogin(c, env, baseSession, exchanged);
      return c.redirect(`${env.frontendUrl}/dashboard`);
    } catch {
      return c.redirect(redirectFail);
    }
  });

  app.get("/api/auth/me", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const base = {
      id: session.sub,
      username: session.username,
      avatar: session.avatar,
      global_name: session.global_name,
      banner: session.banner,
      accent_color: session.accent_color,
    };

    const resolved = await resolveUserDiscordTokens(c, env, session);
    if (!resolved.ok) {
      return c.json({
        ...base,
        discord: {
          application: null,
          scopes: session.discordScopes ?? [],
          expires: session.discordAuthExpires ?? null,
          live: false,
        },
      });
    }

    try {
      const oauth = await fetchDiscordOAuth2Me(resolved.payload.access_token);
      return c.json({
        ...base,
        discord: {
          application: {
            id: oauth.application.id,
            name: oauth.application.name ?? "",
          },
          scopes: oauth.scopes,
          expires: oauth.expires,
          live: true,
        },
      });
    } catch {
      return c.json({
        ...base,
        discord: {
          application: null,
          scopes:
            session.discordScopes ??
            resolved.payload.scope.split(/\s+/).filter(Boolean),
          expires:
            session.discordAuthExpires ??
            new Date(resolved.payload.expires_at_ms).toISOString(),
          live: false,
        },
      });
    }
  });

  app.post("/api/auth/logout", (c) => {
    deleteCookie(c, COOKIE_NAME, { path: "/" });
    deleteCookie(c, DISCORD_OAUTH_TOKENS_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/api/integrations/league/status", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const connection = leagueConnections.get(session.sub) ?? null;
    return c.json({ connected: connection !== null, connection });
  });

  app.post("/api/integrations/league/connect", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const parsed = parseLeaguePayload(rawPayload);
    if (!parsed) {
      return c.json(
        {
          error:
            "Ogiltig payload. Kräver riotId, tagLine och region (EUW/EUNE/NA/KR/BR).",
        },
        400,
      );
    }

    const connection: LeagueConnection = {
      ...parsed,
      linkedAt: new Date().toISOString(),
      lastSyncRequestedAt: null,
    };

    leagueConnections.set(session.sub, connection);

    return c.json({
      connected: true,
      connection,
      message:
        "League-koppling sparad. Nästa steg är att ansluta Riot API och hämta match/rank-data.",
    });
  });

  app.post("/api/integrations/league/sync", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const connection = leagueConnections.get(session.sub);
    if (!connection) {
      return c.json({ error: "No linked League account" }, 404);
    }

    const updated: LeagueConnection = {
      ...connection,
      lastSyncRequestedAt: new Date().toISOString(),
    };

    leagueConnections.set(session.sub, updated);

    return c.json({
      connected: true,
      connection: updated,
      message: "Synk förberedd. Koppla in Riot API-klient i nästa steg.",
    });
  });

  app.post("/api/integrations/league/disconnect", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    leagueConnections.delete(session.sub);
    return c.json({ connected: false });
  });

  app.all("/api/discord/*", async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const star = extractProxySuffix(c.req.path, "/api/discord");
    if (star === null || star === "") {
      return c.json({ error: "Missing path" }, 400);
    }
    return proxyUserDiscordApi(c, env, session, star);
  });

  app.all("/api/bot/discord/*", async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const star = extractProxySuffix(c.req.path, "/api/bot/discord");
    if (star === null || star === "") {
      return c.json({ error: "Missing path" }, 400);
    }
    return proxyBotDiscordApi(c, env, star);
  });

  app.get("/api/bot/guild/:id/summary", async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const guildId = c.req.param("id");
    if (!/^\d{5,32}$/.test(guildId)) {
      return c.json({ error: "Invalid guild id", code: "invalid_guild_id" }, 400);
    }
    const access = await assertBotGuildAccess(env, session.sub, guildId);
    if (!access.ok) {
      return c.json(access.body, access.status);
    }
    const r = await fetchGuildSummary(env.discordBotToken!, guildId);
    if (!r.ok) {
      const e = r.error;
      const status =
        e.status === 404 ? 404 : e.status === 403 ? 403 : e.status === 504 ? 504 : 502;
      return c.json({ error: e.message, code: e.code }, status);
    }
    return c.json(r.summary);
  });

  app.get("/api/bot/live/health", async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const rt = getGatewayRuntime();
    if (!rt) {
      return c.json({
        gateway_connected: false,
        last_heartbeat_ack_at: null,
        last_dispatch_at: null,
        guilds_subscribed: env.discordGatewayGuildIds,
        reconnect_attempt: 0,
        intents: env.discordGatewayIntents,
        degraded: true,
        degraded_reason:
          "Gateway not running — set DISCORD_BOT_TOKEN and non-empty DISCORD_GATEWAY_GUILD_IDS",
      });
    }
    return c.json(rt.getHealth());
  });

  app.get("/api/bot/live/guild/:id", async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const guildId = c.req.param("id");
    if (!/^\d{5,32}$/.test(guildId)) {
      return c.json({ error: "Invalid guild id", code: "invalid_guild_id" }, 400);
    }
    const access = await assertBotGuildAccess(env, session.sub, guildId);
    if (!access.ok) {
      return c.json(access.body, access.status);
    }
    const rt = getGatewayRuntime();
    if (!rt) {
      return c.json({
        guild_id: guildId,
        gateway_connected: false,
        gateway_degraded: true,
        gateway_degraded_reason:
          "Gateway not running — set DISCORD_BOT_TOKEN and DISCORD_GATEWAY_GUILD_IDS",
        last_event_at: null,
        voice_users: [],
      });
    }
    return c.json(rt.getGuildLive(guildId));
  });

  return app;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
loadDotenv({ path: path.join(repoRoot, ".env") });
loadDotenv({
  path: path.join(repoRoot, "apps/discord-hub-api/.env"),
  override: true,
});

const env = loadEnv();
const app = createApp(env);
startDiscordGateway(env);

function shutdownGateway(): void {
  getGatewayRuntime()?.stop();
}

process.once("SIGINT", () => {
  shutdownGateway();
  process.exit(0);
});
process.once("SIGTERM", () => {
  shutdownGateway();
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`discord-hub-api listening on http://127.0.0.1:${info.port}`);
  },
);
