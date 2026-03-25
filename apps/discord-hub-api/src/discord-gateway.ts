import WebSocket from "ws";
import { DISCORD_API_V10 } from "./discord-rest.js";
import type { AppEnv } from "./env.js";
import type {
  GuildLivePayload,
  LiveHealthPayload,
  LiveVoiceUser,
} from "./bot-guild-types.js";

const GATEWAY_VERSION = 10;

const OPCODES = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

const GUILD_VOICE_STATES_INTENT = 1 << 7;

function parseVoiceUser(d: Record<string, unknown>): LiveVoiceUser | null {
  let user_id: string | null =
    typeof d.user_id === "string" ? d.user_id : null;
  if (!user_id && d.user && typeof d.user === "object") {
    const u = (d.user as { id?: unknown }).id;
    if (typeof u === "string") {
      user_id = u;
    }
  }
  if (!user_id) {
    return null;
  }
  const channel_id =
    d.channel_id === null || d.channel_id === undefined
      ? null
      : typeof d.channel_id === "string"
        ? d.channel_id
        : null;
  return {
    user_id,
    channel_id,
    session_id: typeof d.session_id === "string" ? d.session_id : null,
    self_mute: typeof d.self_mute === "boolean" ? d.self_mute : null,
    self_deaf: typeof d.self_deaf === "boolean" ? d.self_deaf : null,
    mute: typeof d.mute === "boolean" ? d.mute : null,
    deaf: typeof d.deaf === "boolean" ? d.deaf : null,
  };
}

async function fetchGatewayWsUrl(botToken: string): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(`${DISCORD_API_V10}/gateway/bot`, {
      signal: ac.signal,
      headers: {
        Authorization: `Bot ${botToken}`,
        "User-Agent": "Clanker-discord-hub-api/1.0",
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as { url?: string };
    if (typeof j.url !== "string" || !j.url.startsWith("wss://")) {
      return null;
    }
    const base = j.url.split("?")[0];
    return `${base}/?v=${GATEWAY_VERSION}&encoding=json`;
  } catch {
    return null;
  }
}

export class DiscordGatewayRuntime {
  private readonly env: AppEnv;
  private readonly watchGuilds: ReadonlySet<string>;
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private connected = false;
  private lastHeartbeatAckAt: string | null = null;
  private lastDispatchAt: string | null = null;
  private reconnectAttempt = 0;
  private fatalStop = false;
  private fatalReason: string | null = null;
  private voiceByGuild = new Map<string, Map<string, LiveVoiceUser>>();
  private runToken = 0;

  constructor(env: AppEnv) {
    this.env = env;
    this.watchGuilds = new Set(env.discordGatewayGuildIds);
    for (const id of env.discordGatewayGuildIds) {
      this.voiceByGuild.set(id, new Map());
    }
  }

  getHealth(): LiveHealthPayload {
    const intents = this.env.discordGatewayIntents;
    const voiceOk = (intents & GUILD_VOICE_STATES_INTENT) !== 0;
    let degraded = false;
    let degradedReason: string | null = null;
    if (!voiceOk) {
      degraded = true;
      degradedReason =
        "GUILD_VOICE_STATES intent not set; voice live data will stay empty";
    }
    if (this.fatalStop && this.fatalReason) {
      degraded = true;
      degradedReason = this.fatalReason;
    }
    if (this.reconnectAttempt >= 5 && !this.connected) {
      degraded = true;
      degradedReason = "gateway reconnect failing repeatedly";
    }

    return {
      gateway_connected: this.connected,
      last_heartbeat_ack_at: this.lastHeartbeatAckAt,
      last_dispatch_at: this.lastDispatchAt,
      guilds_subscribed: [...this.watchGuilds],
      reconnect_attempt: this.reconnectAttempt,
      intents,
      degraded,
      degraded_reason: degradedReason,
    };
  }

  getGuildLive(guildId: string): GuildLivePayload {
    const health = this.getHealth();
    const subscribed = this.watchGuilds.has(guildId);
    const map = this.voiceByGuild.get(guildId);
    const voice_users: LiveVoiceUser[] = [];
    if (map) {
      for (const u of map.values()) {
        if (u.channel_id !== null) {
          voice_users.push(u);
        }
      }
    }
    const voiceIntent =
      (this.env.discordGatewayIntents & GUILD_VOICE_STATES_INTENT) !== 0;
    let gateway_degraded = health.degraded;
    let gateway_degraded_reason = health.degraded_reason;
    if (!subscribed) {
      gateway_degraded = true;
      gateway_degraded_reason =
        "Guild not listed in DISCORD_GATEWAY_GUILD_IDS (gateway ignores this guild)";
    }
    return {
      guild_id: guildId,
      gateway_connected: this.connected,
      gateway_degraded,
      gateway_degraded_reason,
      last_event_at: this.lastDispatchAt,
      voice_users: subscribed && voiceIntent ? voice_users : [],
    };
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.clearHeartbeat();
    const jitter = 0.85 + Math.random() * 0.15;
    const ms = Math.max(5_000, Math.floor(intervalMs * jitter));
    this.heartbeatTimer = setInterval(() => {
      this.send({ op: OPCODES.HEARTBEAT, d: this.seq });
    }, ms);
  }

  private identify(): void {
    if (!this.env.discordBotToken) {
      return;
    }
    this.send({
      op: OPCODES.IDENTIFY,
      d: {
        token: this.env.discordBotToken,
        intents: this.env.discordGatewayIntents,
        properties: {
          os: "linux",
          browser: "clanker-discord-hub",
          device: "clanker-discord-hub",
        },
      },
    });
  }

  private resume(): void {
    if (!this.env.discordBotToken || !this.sessionId || this.seq === null) {
      this.identify();
      return;
    }
    this.send({
      op: OPCODES.RESUME,
      d: {
        token: this.env.discordBotToken,
        session_id: this.sessionId,
        seq: this.seq,
      },
    });
  }

  private touchEvent(): void {
    this.lastDispatchAt = new Date().toISOString();
  }

  private applyVoiceState(guildId: string, d: Record<string, unknown>): void {
    if (!this.watchGuilds.has(guildId)) {
      return;
    }
    const vs = parseVoiceUser(d);
    if (!vs) {
      return;
    }
    let m = this.voiceByGuild.get(guildId);
    if (!m) {
      m = new Map();
      this.voiceByGuild.set(guildId, m);
    }
    if (vs.channel_id === null) {
      m.delete(vs.user_id);
    } else {
      m.set(vs.user_id, vs);
    }
    this.touchEvent();
  }

  private onGuildCreate(d: Record<string, unknown>): void {
    const id = d.id;
    if (typeof id !== "string" || !this.watchGuilds.has(id)) {
      return;
    }
    const vsList = d.voice_states;
    if (!Array.isArray(vsList)) {
      return;
    }
    let m = this.voiceByGuild.get(id);
    if (!m) {
      m = new Map();
      this.voiceByGuild.set(id, m);
    }
    m.clear();
    for (const raw of vsList) {
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        const guild_id = typeof o.guild_id === "string" ? o.guild_id : id;
        this.applyVoiceState(guild_id, { ...o, guild_id });
      }
    }
    this.touchEvent();
  }

  private dispatch(t: string, d: unknown): void {
    if (!d || typeof d !== "object") {
      return;
    }
    const o = d as Record<string, unknown>;

    if (t === "READY") {
      const sid = o.session_id;
      if (typeof sid === "string") {
        this.sessionId = sid;
      }
      this.touchEvent();
      return;
    }

    if (t === "VOICE_STATE_UPDATE") {
      const gid = o.guild_id;
      if (typeof gid === "string") {
        this.applyVoiceState(gid, o);
      }
      return;
    }

    if (t === "GUILD_CREATE") {
      this.onGuildCreate(o);
    }
  }

  private onMessage(data: WebSocket.RawData): void {
    let msg: { op: number; d?: unknown; s?: number | null; t?: string };
    try {
      msg = JSON.parse(data.toString()) as typeof msg;
    } catch {
      return;
    }

    if (typeof msg.s === "number") {
      this.seq = msg.s;
    }

    switch (msg.op) {
      case OPCODES.HELLO: {
        const d = msg.d as { heartbeat_interval?: number } | undefined;
        const hi = d?.heartbeat_interval;
        if (typeof hi === "number") {
          this.startHeartbeat(hi);
        }
        if (this.sessionId !== null && this.seq !== null) {
          this.resume();
        } else {
          this.identify();
        }
        break;
      }
      case OPCODES.HEARTBEAT_ACK:
        this.lastHeartbeatAckAt = new Date().toISOString();
        break;
      case OPCODES.DISPATCH:
        if (typeof msg.t === "string") {
          this.dispatch(msg.t, msg.d);
        }
        break;
      case OPCODES.RECONNECT:
        this.ws?.close(4000, "reconnect");
        break;
      case OPCODES.INVALID_SESSION: {
        const canResume = msg.d === true;
        if (!canResume) {
          this.sessionId = null;
          this.seq = null;
          this.clearHeartbeat();
          this.ws?.close(4000, "invalid session");
        } else {
          const delay = 1000 + Math.random() * 4000;
          setTimeout(() => this.resume(), delay);
        }
        break;
      }
      default:
        break;
    }
  }

  async runLoop(): Promise<void> {
    const token = this.runToken;
    if (!this.env.discordBotToken || this.watchGuilds.size === 0) {
      return;
    }

    while (token === this.runToken && !this.fatalStop) {
      const url = await fetchGatewayWsUrl(this.env.discordBotToken);
      if (!url) {
        console.error("discord-gateway: failed to get gateway URL");
        await sleep(backoffMs(this.reconnectAttempt++));
        continue;
      }

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.on("open", () => {
          this.connected = true;
          this.reconnectAttempt = 0;
        });

        ws.on("message", (data) => this.onMessage(data));

        ws.on("close", (code) => {
          this.connected = false;
          this.clearHeartbeat();
          if (code === 4004) {
            this.fatalStop = true;
            this.fatalReason = "invalid bot token (gateway close 4004)";
            console.error("discord-gateway: authentication failed, stopping gateway");
          }
          resolve();
        });

        ws.on("error", () => {
          /* close event follows */
        });
      });

      this.ws = null;
      if (token !== this.runToken || this.fatalStop) {
        break;
      }
      const wait = backoffMs(this.reconnectAttempt++);
      await sleep(wait);
    }
  }

  stop(): void {
    this.runToken += 1;
    this.clearHeartbeat();
    this.fatalStop = true;
    try {
      this.ws?.close(1000, "shutdown");
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connected = false;
  }
}

function backoffMs(attempt: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
  return base + Math.floor(Math.random() * 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let gatewayRuntime: DiscordGatewayRuntime | undefined;

export function startDiscordGateway(env: AppEnv): DiscordGatewayRuntime | undefined {
  if (!env.discordBotToken || env.discordGatewayGuildIds.length === 0) {
    return undefined;
  }
  gatewayRuntime = new DiscordGatewayRuntime(env);
  void gatewayRuntime.runLoop();
  return gatewayRuntime;
}

export function getGatewayRuntime(): DiscordGatewayRuntime | undefined {
  return gatewayRuntime;
}
