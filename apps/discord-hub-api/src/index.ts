import { config as loadDotenv } from "dotenv";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
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
import { getPublicProfile, upsertProfileFromSession } from "./profile-store.js";
import {
  RiotApiError,
  fetchLeaguePlayerSnapshot,
  type LeagueRankPreference,
  type LeagueRegion,
} from "./riot-lol.js";
import { closeDb, initDb, verifyDbConnection } from "./db.js";
import {
  createWheelGroup,
  createWheelSession,
  deleteLeagueConnection,
  deleteLeagueSnapshot,
  deleteWheelGroup,
  getLeagueConnection,
  getLeagueSnapshot,
  getWheelGroup,
  listRecentWheelSessions,
  listWheelGroups,
  upsertLeagueConnection,
  upsertLeagueSnapshot,
  updateWheelGroup,
} from "./repo.js";
import { COOKIE_NAME, verifySession, type SessionPayload } from "./session.js";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE = 600;
const DISCORD_SNOWFLAKE_RE = /^\d{5,32}$/;

type LeagueConnection = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: LeagueRankPreference;
  statusMessage: string;
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

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
  rankPreference: LeagueRankPreference;
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

function respondWithRiotError(c: Context, error: RiotApiError) {
  if (error.retryAfterSeconds !== null) {
    c.header("Retry-After", String(error.retryAfterSeconds));
  }

  if (error.code === "riot_account_not_found") {
    return c.json(
      {
        error:
          "Riot-kontot hittades inte. Kontrollera Riot ID, tagline och vald region.",
        code: error.code,
      },
      404,
    );
  }

  if (error.code === "riot_rate_limited") {
    return c.json(
      {
        error:
          "Riot API rate limit uppnådd. Vänta lite och prova synk igen.",
        code: error.code,
      },
      429,
    );
  }

  if (error.code === "riot_auth_failed") {
    return c.json(
      {
        error:
          "Riot API-nyckeln är ogiltig eller har gått ut. Uppdatera RIOT_API_KEY.",
        code: error.code,
      },
      502,
    );
  }

  return c.json(
    {
      error: "Riot API svarade med ett oväntat fel under synk.",
      code: error.code,
    },
    502,
  );
}

function createApp(env: AppEnv) {
  const app = new Hono();

  app.get("/api/auth/discord", (c) => {
    const state = randomBytes(32).toString("hex");
    setCookie(c, STATE_COOKIE, state, {
      path: "/",
      httpOnly: true,
      secure: env.cookieSecure,
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
      if (env.oauthCallbackVerboseLog) {
        console.error(
          "discord-hub-api: OAuth callback — Discord returned error query param:",
          err,
        );
      }
      deleteCookie(c, STATE_COOKIE, { path: "/" });
      return c.redirect(redirectFail);
    }

    const stored = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    if (!code || !state || !stored || !timingSafeEqualString(stored, state)) {
      if (env.oauthCallbackVerboseLog) {
        console.error(
          "discord-hub-api: OAuth callback — state validation failed (CSRF or missing cookie).",
          "hint: DISCORD_REDIRECT_URI must match the portal exactly; over HTTP with NODE_ENV=production set COOKIE_SECURE=0.",
          {
            hasCode: Boolean(code),
            hasState: Boolean(state),
            hasStoredStateCookie: Boolean(stored),
            statesMatch:
              stored && state ? timingSafeEqualString(stored, state) : false,
          },
        );
      }
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
      await upsertProfileFromSession(baseSession);
      await setOAuthCookiesAfterLogin(c, env, baseSession, exchanged);
      return c.redirect(`${env.frontendUrl}/dashboard`);
    } catch (e) {
      if (env.oauthCallbackVerboseLog) {
        console.error("discord-hub-api: OAuth callback — token or user fetch failed:", e);
      }
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
    await upsertProfileFromSession(session);

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

  const WheelParticipant = z.string().trim().min(1).max(48);
  const WheelParticipants = z.array(WheelParticipant).min(1).max(64);

  function normalizeWheelParticipants(list: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= 64) break;
    }
    return out;
  }

  app.get("/api/wheel/groups", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    const groups = await listWheelGroups(session.sub);
    return c.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        participants: Array.isArray(g.participants) ? (g.participants as string[]) : [],
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      })),
    });
  });

  app.get("/api/wheel/groups/:id", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    const id = c.req.param("id");
    if (!id || id.length > 64) return c.json({ error: "Invalid id" }, 400);
    const group = await getWheelGroup(session.sub, id);
    if (!group) return c.json({ error: "Not found" }, 404);

    return c.json({
      group: {
        id: group.id,
        name: group.name,
        participants: Array.isArray(group.participants)
          ? (group.participants as string[])
          : [],
        createdAt: group.created_at,
        updatedAt: group.updated_at,
      },
    });
  });

  app.post("/api/wheel/groups", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    let rawPayload: unknown;
    try {
      rawPayload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const schema = z.object({
      name: z.string().trim().min(1).max(64),
      participants: WheelParticipants,
    });

    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      return c.json({ error: "Invalid payload" }, 400);
    }

    const id = randomUUID();
    const participants = normalizeWheelParticipants(parsed.data.participants);
    if (participants.length === 0) return c.json({ error: "No participants" }, 400);

    await createWheelGroup({
      id,
      ownerUserId: session.sub,
      name: parsed.data.name,
      participants,
    });

    return c.json({ id }, 201);
  });

  app.put("/api/wheel/groups/:id", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    const id = c.req.param("id");
    if (!id || id.length > 64) return c.json({ error: "Invalid id" }, 400);

    let rawPayload: unknown;
    try {
      rawPayload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const schema = z.object({
      name: z.string().trim().min(1).max(64),
      participants: WheelParticipants,
    });
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);

    const participants = normalizeWheelParticipants(parsed.data.participants);
    if (participants.length === 0) return c.json({ error: "No participants" }, 400);

    const ok = await updateWheelGroup({
      id,
      ownerUserId: session.sub,
      name: parsed.data.name,
      participants,
    });
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  });

  app.delete("/api/wheel/groups/:id", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    const id = c.req.param("id");
    if (!id || id.length > 64) return c.json({ error: "Invalid id" }, 400);
    const ok = await deleteWheelGroup(session.sub, id);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  });

  app.get("/api/wheel/sessions/recent", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Number(limitRaw) : 12;
    const sessions = await listRecentWheelSessions(session.sub, Number.isFinite(limit) ? limit : 12);
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        groupId: s.group_id,
        seed: s.seed,
        teamCount: s.team_count,
        teamMode: s.team_mode,
        participants: Array.isArray(s.participants) ? (s.participants as string[]) : [],
        winner: s.winner,
        teams: Array.isArray(s.teams) ? (s.teams as string[][]) : [],
        createdAt: s.created_at,
      })),
    });
  });

  app.post("/api/wheel/sessions", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await upsertProfileFromSession(session);

    let rawPayload: unknown;
    try {
      rawPayload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const schema = z.object({
      groupId: z.string().trim().min(8).max(64).nullable().optional(),
      seed: z.string().trim().min(1).max(128).nullable().optional(),
      teamCount: z.number().int().min(1).max(16),
      teamMode: z.enum(["balanced", "equal"]),
      participants: WheelParticipants,
      winner: z.string().trim().min(1).max(48).nullable().optional(),
      teams: z.array(z.array(WheelParticipant)).min(1).max(16),
    });

    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);

    const participants = normalizeWheelParticipants(parsed.data.participants);
    if (participants.length === 0) return c.json({ error: "No participants" }, 400);

    const normalizedTeams = parsed.data.teams
      .map((t) => normalizeWheelParticipants(t))
      .slice(0, parsed.data.teamCount);

    const flattened = normalizedTeams.flat();
    const participantKey = new Set(participants.map((p) => p.toLocaleLowerCase()));
    const uniqueTeamKey = new Set<string>();

    for (const p of flattened) {
      const k = p.toLocaleLowerCase();
      if (!participantKey.has(k)) {
        return c.json({ error: "Teams contain unknown participants" }, 400);
      }
      if (uniqueTeamKey.has(k)) {
        return c.json({ error: "Teams contain duplicates" }, 400);
      }
      uniqueTeamKey.add(k);
    }

    if (uniqueTeamKey.size !== participantKey.size) {
      return c.json({ error: "Teams do not cover all participants" }, 400);
    }

    const winner = parsed.data.winner?.trim() ? parsed.data.winner.trim() : null;
    if (winner) {
      const wk = winner.toLocaleLowerCase();
      if (!participantKey.has(wk)) return c.json({ error: "Winner not in participants" }, 400);
    }

    const id = randomUUID();
    await createWheelSession({
      id,
      ownerUserId: session.sub,
      groupId: parsed.data.groupId ?? null,
      seed: parsed.data.seed ?? null,
      teamCount: parsed.data.teamCount,
      teamMode: parsed.data.teamMode,
      participants,
      winner,
      teams: normalizedTeams,
    });

    return c.json({ id }, 201);
  });

  app.get("/api/integrations/league/status", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const dbConn = await getLeagueConnection(session.sub);
    const connection =
      dbConn === null
        ? null
        : {
            riotId: dbConn.riot_id,
            tagLine: dbConn.tag_line,
            region: dbConn.region,
            autoSync: dbConn.auto_sync,
            rankPreference: dbConn.rank_preference,
            statusMessage: dbConn.status_message,
            linkedAt: dbConn.linked_at,
            lastSyncRequestedAt: dbConn.last_sync_requested_at,
          };
    const sync = await getLeagueSnapshot(session.sub);
    return c.json({ connected: connection !== null, connection, sync });
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

    await upsertProfileFromSession(session);
    await upsertLeagueConnection(session.sub, {
      riot_id: connection.riotId,
      tag_line: connection.tagLine,
      region: connection.region,
      auto_sync: connection.autoSync,
      rank_preference: connection.rankPreference,
      status_message: connection.statusMessage,
      linked_at: connection.linkedAt,
      last_sync_requested_at: connection.lastSyncRequestedAt,
    });
    await deleteLeagueSnapshot(session.sub);

    return c.json({
      connected: true,
      connection,
      sync: null,
      message: "League-koppling sparad. Kontot är redo att synkas via Riot API.",
    });
  });

  app.post("/api/integrations/league/sync", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const dbConn = await getLeagueConnection(session.sub);
    const connection = dbConn
      ? ({
          riotId: dbConn.riot_id,
          tagLine: dbConn.tag_line,
          region: dbConn.region,
          autoSync: dbConn.auto_sync,
          rankPreference: dbConn.rank_preference,
          statusMessage: dbConn.status_message,
          linkedAt: dbConn.linked_at,
          lastSyncRequestedAt: dbConn.last_sync_requested_at,
        } satisfies LeagueConnection)
      : null;
    if (!connection) {
      return c.json({ error: "No linked League account" }, 404);
    }

    if (!env.riotApiKey) {
      return c.json(
        {
          error:
            "RIOT_API_KEY saknas i backend-miljön. Lägg till den innan du kör synk.",
          code: "riot_api_key_missing",
        },
        503,
      );
    }

    const updated: LeagueConnection = {
      ...connection,
      lastSyncRequestedAt: new Date().toISOString(),
    };

    await upsertProfileFromSession(session);
    await upsertLeagueConnection(session.sub, {
      riot_id: updated.riotId,
      tag_line: updated.tagLine,
      region: updated.region,
      auto_sync: updated.autoSync,
      rank_preference: updated.rankPreference,
      status_message: updated.statusMessage,
      linked_at: updated.linkedAt,
      last_sync_requested_at: updated.lastSyncRequestedAt,
    });

    try {
      const sync = await fetchLeaguePlayerSnapshot({
        apiKey: env.riotApiKey,
        region: updated.region,
        riotId: updated.riotId,
        tagLine: updated.tagLine,
        rankPreference: updated.rankPreference,
        matchCount: 5,
      });

      await upsertLeagueSnapshot(session.sub, sync);

      return c.json({
        connected: true,
        connection: updated,
        sync,
        message: `Synk klar. Hämtade ${sync.recentMatches.length} matcher från Riot API.`,
      });
    } catch (error) {
      if (error instanceof RiotApiError) {
        return respondWithRiotError(c, error);
      }

      console.error("League sync failed", error);
      return c.json(
        {
          error: "Okänt fel vid League-synk.",
          code: "league_sync_failed",
        },
        500,
      );
    }
  });

  app.post("/api/integrations/league/disconnect", async (c) => {
    const session = await requireSession(env, getCookie(c, COOKIE_NAME));
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await upsertProfileFromSession(session);
    await deleteLeagueConnection(session.sub);
    await deleteLeagueSnapshot(session.sub);
    return c.json({ connected: false });
  });

  app.get("/api/public/profile/:userId", async (c) => {
    const userId = c.req.param("userId");
    if (!DISCORD_SNOWFLAKE_RE.test(userId)) {
      return c.json({ error: "Invalid user id", code: "invalid_user_id" }, 400);
    }

    const profile = await getPublicProfile(userId);
    if (!profile) {
      return c.json({ error: "Profile not found", code: "profile_not_found" }, 404);
    }

    return c.json(profile);
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
    if (!DISCORD_SNOWFLAKE_RE.test(guildId)) {
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
    if (!DISCORD_SNOWFLAKE_RE.test(guildId)) {
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

function shutdownGateway(): void {
  getGatewayRuntime()?.stop();
}

async function shutdownAndExit(code: number): Promise<void> {
  shutdownGateway();
  await closeDb();
  process.exit(code);
}

async function main(): Promise<void> {
  const env = loadEnv();
  initDb(env);
  if (env.databaseUrl) {
    try {
      await verifyDbConnection();
      console.log("discord-hub-api: Postgres connection OK");
    } catch (e) {
      console.error(
        "discord-hub-api: DATABASE_URL is set but Postgres is not reachable. Check network, firewall, and credentials.",
      );
      throw e;
    }
  }

  const app = createApp(env);
  startDiscordGateway(env);

  process.once("SIGINT", () => {
    void shutdownAndExit(0);
  });
  process.once("SIGTERM", () => {
    void shutdownAndExit(0);
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
