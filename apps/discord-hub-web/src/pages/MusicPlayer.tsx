import { useCallback, useEffect, useRef, useState } from "react";
import { MusicSeekProgressBar } from "@/components/MusicSeekProgressBar";
import { Navigate } from "react-router-dom";
import {
  Music,
  Pause,
  Play,
  SkipForward,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import { Input } from "@clanker/ui/components/input";
import { cn } from "@clanker/ui/lib/utils";
import { apiUrl } from "@/config";
import { discordAvatarUrl } from "@/lib/discordCdn";
import { useHubLayout } from "@/hooks/use-hub-layout";

const GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";
const POLL_MS = 3_000;

// ── Types ────────────────────────────────────────────────────────────────────

type MusicSource = "youtube" | "soundcloud" | "spotify";

type NowPlaying = {
  guild_id: string;
  track_url: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  source: MusicSource;
  requested_by: string;
  channel_id: string;
  is_paused: boolean;
  started_at: string;
};

type QueueItem = {
  id: number;
  track_url: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  source: MusicSource;
  requested_by: string;
  added_at: string;
};

type MusicState = {
  now_playing: NowPlaying | null;
  queue: QueueItem[];
  total_in_queue: number;
};

type VoiceStateMember = {
  user_id: string;
  channel_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

type VoiceStatesResponse = {
  channels: { channel_id: string; channel_name: string | null; members: VoiceStateMember[] }[];
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SourceBadge({ source }: { source: MusicSource }) {
  const labels: Record<MusicSource, string> = {
    youtube: "YT",
    soundcloud: "SC",
    spotify: "SP",
  };
  const colors: Record<MusicSource, string> = {
    youtube: "bg-red-500/15 text-red-400",
    soundcloud: "bg-orange-500/15 text-orange-400",
    spotify: "bg-green-500/15 text-green-400",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        colors[source],
      )}
    >
      {labels[source]}
    </span>
  );
}

function RequesterAvatar({
  userId,
  voiceStates,
}: {
  userId: string;
  voiceStates: VoiceStatesResponse | null;
}) {
  const member = voiceStates?.channels
    .flatMap((ch) => ch.members)
    .find((m) => m.user_id === userId);
  const src = discordAvatarUrl(userId, member?.avatar ?? null, 32);
  const name = member ? (member.global_name ?? member.username) : userId;
  return (
    <img
      src={src}
      alt={name}
      title={name}
      className="size-5 shrink-0 rounded-full object-cover opacity-80"
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MusicPlayerPage() {
  const { me } = useHubLayout();

  const [music, setMusic] = useState<MusicState | null>(null);
  const [voiceStates, setVoiceStates] = useState<VoiceStatesResponse | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  // Clock tick for progress bar
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);

  // Poll music state
  const fetchMusic = useCallback(async () => {
    if (!GUILD_ID) return;
    try {
      const res = await fetch(
        apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/music`),
        { credentials: "include" },
      );
      if (res.ok) setMusic(await res.json() as MusicState);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchMusic();
    const t = window.setInterval(() => void fetchMusic(), POLL_MS);
    return () => window.clearInterval(t);
  }, [fetchMusic]);

  // Poll voice states (for avatar resolution + channel id)
  useEffect(() => {
    if (!GUILD_ID) return;
    const load = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/voice-states`),
          { credentials: "include" },
        );
        if (res.ok) setVoiceStates(await res.json() as VoiceStatesResponse);
      } catch {
        // silent
      }
    };
    void load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  const cmd = useCallback(
    async (action: string, body?: Record<string, unknown>) => {
      if (!GUILD_ID) return;
      setBusy(true);
      try {
        await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/music/${action}`),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
          },
        );
        await fetchMusic();
      } finally {
        setBusy(false);
      }
    },
    [fetchMusic],
  );

  const removeFromQueue = useCallback(
    async (itemId: number) => {
      if (!GUILD_ID) return;
      setRemovingIds((prev) => new Set(prev).add(itemId));
      try {
        await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/music/queue/${itemId}`),
          { method: "DELETE", credentials: "include" },
        );
        await fetchMusic();
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [fetchMusic],
  );

  const resolveChannelId = (): string | null => {
    if (music?.now_playing?.channel_id) return music.now_playing.channel_id;
    if (me.status !== "user") return null;
    for (const ch of voiceStates?.channels ?? []) {
      if (ch.members.some((m) => m.user_id === me.profile.id)) return ch.channel_id;
    }
    return null;
  };

  const handlePlay = async () => {
    const q = query.trim();
    if (!q || busy) return;
    const channelId = resolveChannelId();
    if (!channelId) {
      alert("Gå med i en röstkanal på Discord för att spela musik.");
      return;
    }
    await cmd("play", { query: q, channelId });
    setQuery("");
    inputRef.current?.focus();
  };

  if (me.status === "guest") return <Navigate to="/login" replace />;
  if (!GUILD_ID) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Sätt <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">VITE_DISCORD_HUB_GUILD_ID</code> för att använda musikspelaren.
      </div>
    );
  }

  const np = music?.now_playing ?? null;
  const queue = music?.queue ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      {/* ── Now Playing ────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Music className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Spelas nu
          </h2>
        </div>

        {np ? (
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex gap-4">
              {/* Thumbnail */}
              <div className="shrink-0">
                {np.thumbnail ? (
                  <img
                    src={np.thumbnail}
                    alt=""
                    className="size-24 rounded-xl object-cover shadow-md"
                  />
                ) : (
                  <div className="flex size-24 items-center justify-center rounded-xl bg-muted text-3xl">
                    🎵
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <p className="truncate text-base font-semibold leading-tight">{np.title}</p>
                {np.artist && (
                  <p className="truncate text-sm text-muted-foreground">{np.artist}</p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <SourceBadge source={np.source} />
                  {np.is_paused && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-yellow-500/20 text-yellow-500">
                      Pausad
                    </span>
                  )}
                  <RequesterAvatar userId={np.requested_by} voiceStates={voiceStates} />
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <MusicSeekProgressBar
                track={np}
                nowMs={nowMs}
                onSeek={(sec) => void cmd("seek", { seekSec: sec })}
              />
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="size-11 rounded-full"
                disabled={busy}
                onClick={() => void cmd(np.is_paused ? "resume" : "pause")}
                title={np.is_paused ? "Återuppta" : "Pausa"}
              >
                {np.is_paused ? <Play className="size-5" /> : <Pause className="size-5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-11 rounded-full"
                disabled={busy}
                onClick={() => void cmd("skip")}
                title="Hoppa över"
              >
                <SkipForward className="size-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-11 rounded-full text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void cmd("stop")}
                title="Stoppa och rensa kö"
              >
                <Square className="size-5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card py-12 text-center">
            <span className="text-4xl">🎵</span>
            <p className="text-sm text-muted-foreground">Inget spelas just nu</p>
          </div>
        )}
      </section>

      {/* ── Add to queue ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Lägg till i kö
          </h2>
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="YouTube, Spotify, SoundCloud eller sökterm…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handlePlay(); }}
            className="rounded-xl"
          />
          <Button
            disabled={!query.trim() || busy}
            onClick={() => void handlePlay()}
            className="shrink-0 rounded-xl"
          >
            Spela
          </Button>
        </div>
      </section>

      {/* ── Queue ──────────────────────────────────────────────────────── */}
      <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Kö
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {music?.total_in_queue ?? queue.length}
              </span>
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground">
              <span className="text-2xl">🎵</span>
              <p>Kön är tom</p>
            </div>
          ) : (
          <div className="flex flex-col gap-1.5">
            {queue.map((item, idx) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 transition-colors hover:bg-muted/40"
              >
                {/* Position */}
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>

                {/* Thumbnail */}
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="size-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                    🎵
                  </div>
                )}

                {/* Track info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                  {item.artist && (
                    <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <SourceBadge source={item.source} />
                    {item.duration_sec && (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {fmtDuration(item.duration_sec)}
                      </span>
                    )}
                    <RequesterAvatar userId={item.requested_by} voiceStates={voiceStates} />
                  </div>
                </div>

                {/* Remove */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  disabled={removingIds.has(item.id)}
                  onClick={() => void removeFromQueue(item.id)}
                  title="Ta bort från kö"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          )}
        </section>
    </div>
  );
}
