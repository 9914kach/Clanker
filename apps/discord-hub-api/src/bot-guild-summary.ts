import { discordBotFetchJson } from "./discord-bot-fetch.js";
import type { GuildSummaryChannel, GuildSummaryPayload } from "./bot-guild-types.js";

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  approximate_member_count?: number;
  approximate_presence_count?: number;
};

type DiscordChannel = {
  id: string;
  type: number;
  name?: string | null;
  parent_id?: string | null;
};

export async function fetchGuildSummary(
  botToken: string,
  guildId: string,
): Promise<
  | { ok: true; summary: GuildSummaryPayload }
  | { ok: false; error: import("./discord-bot-fetch.js").BotFetchError }
> {
  const g = await discordBotFetchJson<DiscordGuild>(
    botToken,
    `/guilds/${encodeURIComponent(guildId)}?with_counts=true`,
  );
  if (!g.ok) {
    return g;
  }

  const ch = await discordBotFetchJson<DiscordChannel[]>(
    botToken,
    `/guilds/${encodeURIComponent(guildId)}/channels`,
  );
  if (!ch.ok) {
    return ch;
  }

  const channels: GuildSummaryChannel[] = ch.data.map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name ?? null,
    parent_id: c.parent_id ?? null,
  }));

  const summary: GuildSummaryPayload = {
    guild: {
      id: g.data.id,
      name: g.data.name,
      icon: g.data.icon ?? null,
      approximate_member_count:
        typeof g.data.approximate_member_count === "number"
          ? g.data.approximate_member_count
          : null,
      approximate_presence_count:
        typeof g.data.approximate_presence_count === "number"
          ? g.data.approximate_presence_count
          : null,
    },
    channels,
    channel_count: channels.length,
  };

  return { ok: true, summary };
}

export async function verifyUserIsGuildMember(
  botToken: string,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const res = await discordBotFetchJson<unknown>(
    botToken,
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
  );
  return res.ok;
}
