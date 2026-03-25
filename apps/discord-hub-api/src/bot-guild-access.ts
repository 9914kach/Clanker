import type { AppEnv } from "./env.js";
import { verifyUserIsGuildMember } from "./bot-guild-summary.js";

export type AccessErrorBody = {
  error: string;
  code: string;
};

export async function assertBotGuildAccess(
  env: AppEnv,
  sessionUserId: string,
  guildId: string,
): Promise<
  { ok: true } | { ok: false; status: 403 | 503; body: AccessErrorBody }
> {
  if (!env.discordBotToken) {
    return {
      ok: false,
      status: 503,
      body: { error: "Bot not configured", code: "bot_not_configured" },
    };
  }

  if (env.discordHubAllowedGuildIds.length > 0) {
    if (!env.discordHubAllowedGuildIds.includes(guildId)) {
      return {
        ok: false,
        status: 403,
        body: { error: "Guild not in allowlist", code: "guild_not_allowed" },
      };
    }
  }

  if (env.discordHubEnforceGuildMembership) {
    const member = await verifyUserIsGuildMember(
      env.discordBotToken,
      guildId,
      sessionUserId,
    );
    if (!member) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "User is not a member of this guild",
          code: "not_guild_member",
        },
      };
    }
  }

  return { ok: true };
}
