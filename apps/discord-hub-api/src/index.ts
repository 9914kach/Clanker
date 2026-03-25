import { config as loadDotenv } from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { COOKIE_NAME, signSession, verifySession, type SessionPayload } from "./session.js";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE = 600;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

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
    scope: "identify",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(
  env: AppEnv,
  code: string,
): Promise<{ access_token: string }> {
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
  return res.json() as Promise<{ access_token: string }>;
}

type DiscordUser = {
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

async function fetchDiscordMe(accessToken: string): Promise<DiscordUser> {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord @me failed: ${res.status} ${text}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return normalizeDiscordUser(raw);
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
      const { access_token } = await exchangeCode(env, code);
      const user = await fetchDiscordMe(access_token);
      const token = await signSession(env.sessionSecret, {
        sub: user.id,
        username: user.username,
        avatar: user.avatar,
        global_name: user.global_name,
        banner: user.banner,
        accent_color: user.accent_color,
      });
      setCookie(c, COOKIE_NAME, token, {
        path: "/",
        httpOnly: true,
        secure: secureCookie(env),
        sameSite: "Lax",
        maxAge: SESSION_MAX_AGE,
      });
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
    return c.json({
      id: session.sub,
      username: session.username,
      avatar: session.avatar,
      global_name: session.global_name,
      banner: session.banner,
      accent_color: session.accent_color,
    });
  });

  app.post("/api/auth/logout", (c) => {
    deleteCookie(c, COOKIE_NAME, { path: "/" });
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

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`discord-hub-api listening on http://127.0.0.1:${info.port}`);
  },
);
