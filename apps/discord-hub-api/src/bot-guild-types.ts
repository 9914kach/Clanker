/** Stable JSON for GET /api/bot/guild/:id/summary */
export type GuildSummaryChannel = {
  id: string;
  type: number;
  name: string | null;
  parent_id: string | null;
};

export type GuildSummaryPayload = {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count: number | null;
    approximate_presence_count: number | null;
  };
  channels: GuildSummaryChannel[];
  channel_count: number;
};

export type LiveVoiceUser = {
  user_id: string;
  channel_id: string | null;
  session_id: string | null;
  self_mute: boolean | null;
  self_deaf: boolean | null;
  mute: boolean | null;
  deaf: boolean | null;
};

export type GuildLivePayload = {
  guild_id: string;
  gateway_connected: boolean;
  gateway_degraded: boolean;
  gateway_degraded_reason: string | null;
  last_event_at: string | null;
  voice_users: LiveVoiceUser[];
};

export type LiveHealthPayload = {
  gateway_connected: boolean;
  last_heartbeat_ack_at: string | null;
  last_dispatch_at: string | null;
  guilds_subscribed: string[];
  reconnect_attempt: number;
  intents: number;
  degraded: boolean;
  degraded_reason: string | null;
};
