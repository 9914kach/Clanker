import { config as loadDotenv } from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { COOKIE_NAME, signSession, verifySession } from "./session.js";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE = 600;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secureCookie(env: AppEnv): boolean {
  return env.nodeEnv === "production";
}

function discordAuthorizeUrl(
  env: AppEnv,
  state: string,
): string {
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
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const session = await verifySession(env.sessionSecret, token);
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
