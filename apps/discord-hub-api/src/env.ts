const REQUIRED_STRINGS = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "SESSION_SECRET",
  "FRONTEND_URL",
] as const;

function missingEnv(names: readonly string[]): string[] {
  return names.filter((n) => !(process.env[n]?.trim()));
}

export function loadEnv() {
  const missing = missingEnv(REQUIRED_STRINGS);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(", ")} — sätt dem i repots .env (se apps/discord-hub-api/.env.example).`,
    );
  }

  return {
    port: Number(process.env.PORT ?? "3001"),
    discordClientId: process.env.DISCORD_CLIENT_ID!.trim(),
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET!.trim(),
    discordRedirectUri: process.env.DISCORD_REDIRECT_URI!.trim(),
    sessionSecret: process.env.SESSION_SECRET!.trim(),
    frontendUrl: process.env.FRONTEND_URL!.trim().replace(/\/$/, ""),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}

export type AppEnv = ReturnType<typeof loadEnv>;
