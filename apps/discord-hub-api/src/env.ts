const REQUIRED_STRINGS = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "SESSION_SECRET",
  "FRONTEND_URL",
] as const;

const DEFAULT_USER_PROXY_PREFIXES = "users/@me,oauth2/@me";
const DEFAULT_BOT_PROXY_PREFIXES = "guilds/,channels/";

function missingEnv(names: readonly string[]): string[] {
  return names.filter((n) => !(process.env[n]?.trim()));
}

function parseCommaSeparatedPrefixes(raw: string | undefined, fallback: string): string[] {
  const s = (raw?.trim() || fallback).split(",");
  return s.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseSnowflakeList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{5,32}$/.test(s));
}

function parseGatewayIntents(raw: string | undefined): number {
  const key = raw?.trim().toLowerCase() ?? "voice";
  const PRESETS: Record<string, number> = {
    minimal: 1 << 0,
    voice: (1 << 0) | (1 << 7),
    presence: (1 << 0) | (1 << 7) | (1 << 8),
  };
  if (key in PRESETS) {
    return PRESETS[key]!;
  }
  const n = Number.parseInt(key, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 0xffff_ffff) {
    return n;
  }
  return PRESETS.voice;
}

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function falsyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no";
}

/**
 * Session- och OAuth-cookies: `Secure`-flagga. I `NODE_ENV=production` är den
 * true som standard (kräver HTTPS). Sätt `COOKIE_SECURE=0` om du kör prod-läge
 * över HTTP (t.ex. homelab utan TLS) — annars ignoreras state-cookien och
 * inloggning faller tillbaka till `/login?error=oauth`.
 */
function parseCookieSecure(nodeEnv: string): boolean {
  if (truthyEnv("COOKIE_SECURE")) {
    return true;
  }
  if (falsyEnv("COOKIE_SECURE")) {
    return false;
  }
  return nodeEnv === "production";
}

function normalizeOAuthScopes(raw: string | undefined): string {
  const s = raw?.trim() || "identify";
  return s.split(/\s+/).filter(Boolean).join(" ");
}

/** Om satt måste värdet vara en postgres-anslutnings-URL (används av `pg`). */
function parseDatabaseUrl(raw: string | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) {
    return undefined;
  }
  const head = s.slice(0, 14).toLowerCase();
  if (!head.startsWith("postgres://") && !head.startsWith("postgresql://")) {
    throw new Error(
      "DATABASE_URL must start with postgres:// or postgresql:// (see apps/discord-hub-api/.env.example).",
    );
  }
  return s;
}

export type DiscordOAuthPrompt = "consent" | "none";

export function loadEnv() {
  const missing = missingEnv(REQUIRED_STRINGS);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(", ")} — sätt dem i repots .env (se apps/discord-hub-api/.env.example).`,
    );
  }

  const promptRaw = process.env.DISCORD_OAUTH_PROMPT?.trim().toLowerCase();
  let discordOAuthPrompt: DiscordOAuthPrompt | undefined;
  if (promptRaw === "consent" || promptRaw === "none") {
    discordOAuthPrompt = promptRaw;
  } else if (promptRaw !== undefined && promptRaw !== "") {
    throw new Error(
      "DISCORD_OAUTH_PROMPT must be empty, consent, or none (see apps/discord-hub-api/.env.example).",
    );
  }

  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const discordBotToken = botToken || undefined;
  const riotApiKey = process.env.RIOT_API_KEY?.trim() || undefined;

  const nodeEnv = process.env.NODE_ENV ?? "development";
  const cookieSecure = parseCookieSecure(nodeEnv);
  const oauthCallbackVerboseLog =
    nodeEnv !== "production" || truthyEnv("DISCORD_OAUTH_DEBUG");

  return {
    port: Number(process.env.PORT ?? "3001"),
    discordClientId: process.env.DISCORD_CLIENT_ID!.trim(),
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET!.trim(),
    discordRedirectUri: process.env.DISCORD_REDIRECT_URI!.trim(),
    sessionSecret: process.env.SESSION_SECRET!.trim(),
    frontendUrl: process.env.FRONTEND_URL!.trim().replace(/\/$/, ""),
    nodeEnv,
    cookieSecure,
    oauthCallbackVerboseLog,
    discordOAuthScopes: normalizeOAuthScopes(process.env.DISCORD_OAUTH_SCOPES),
    discordOAuthPrompt,
    discordUserProxyPrefixes: parseCommaSeparatedPrefixes(
      process.env.DISCORD_PROXY_USER_PREFIXES,
      DEFAULT_USER_PROXY_PREFIXES,
    ),
    discordBotProxyPrefixes: parseCommaSeparatedPrefixes(
      process.env.DISCORD_PROXY_BOT_PREFIXES,
      DEFAULT_BOT_PROXY_PREFIXES,
    ),
    discordBotToken,
    riotApiKey,
    discordHubAllowedGuildIds: parseSnowflakeList(
      process.env.DISCORD_HUB_ALLOWED_GUILD_IDS,
    ),
    discordHubEnforceGuildMembership: truthyEnv(
      "DISCORD_HUB_ENFORCE_GUILD_MEMBERSHIP",
    ),
    discordGatewayGuildIds: parseSnowflakeList(
      process.env.DISCORD_GATEWAY_GUILD_IDS,
    ),
    discordGatewayIntents: parseGatewayIntents(
      process.env.DISCORD_GATEWAY_INTENTS,
    ),
    databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
  };
}

export type AppEnv = ReturnType<typeof loadEnv>;
