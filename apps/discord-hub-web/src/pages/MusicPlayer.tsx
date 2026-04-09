import { useCallback, useEffect, useRef, useState } from "react";
import { MusicSeekProgressBar } from "@/components/MusicSeekProgressBar";
import { Navigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Music,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import { Input } from "@clanker/ui/components/input";
import { cn } from "@clanker/ui/lib/utils";
import { apiUrl } from "@/config";
import { discordAvatarUrl } from "@/lib/discordCdn";
import { hubMusicPollIntervalMs } from "@/lib/hub-music-poll-interval";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { useMusicArtTextTone } from "@/hooks/use-music-art-text-tone";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";

const GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";

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

/** Spotify app may supply `spotify:track:…`; bot expects https://open.spotify.com/… */
function normalizeSpotifyUriToHttp(s: string): string {
  const t = s.trim();
  const m = t.match(/^spotify:(track|playlist|album|episode):([A-Za-z0-9]+)/i);
  if (m) return `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}`;
  return t;
}

function extractDroppedPlayableUrl(dt: DataTransfer): string | null {
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const line = uriList.split(/\r?\n/).find((l) => l.length > 0 && !l.startsWith("#"));
    if (line) return normalizeSpotifyUriToHttp(line.trim());
  }
  const plain = dt.getData("text/plain");
  if (plain) {
    const trimmed = plain.trim();
    if (/^spotify:/i.test(trimmed)) return normalizeSpotifyUriToHttp(trimmed);
    const urlMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i);
    if (urlMatch) return urlMatch[0];
  }
  const html = dt.getData("text/html");
  if (html) {
    const link = html.match(
      /https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|playlist|album|episode)\/[A-Za-z0-9?=&\-._]+/i,
    );
    if (link) {
      const u = link[0];
      const q = u.indexOf("?");
      return q === -1 ? u : u.slice(0, q);
    }
  }
  return null;
}

function isPlayableDroppedUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^spotify:(track|playlist|album|episode):/i.test(t)) return true;
  if (!/^https?:\/\//i.test(t)) return false;
  return (
    /spotify\.com\//i.test(t) ||
    /youtube\.com\//i.test(t) ||
    /youtu\.be\//i.test(t) ||
    /soundcloud\.com\//i.test(t)
  );
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

function SortableQueueRow({
  item,
  index,
  voiceStates,
  removingIds,
  busy,
  onRemove,
  dragHandleAria,
}: {
  item: QueueItem;
  index: number;
  voiceStates: VoiceStatesResponse | null;
  removingIds: Set<number>;
  busy: boolean;
  onRemove: (id: number) => void;
  dragHandleAria: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.92 } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-xl border border-border/50 bg-card px-2 py-3 transition-colors hover:bg-muted/40 sm:gap-3 sm:px-4"
    >
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/80 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
        aria-label={dragHandleAria}
        disabled={busy}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>

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

      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        disabled={removingIds.has(item.id) || busy}
        onClick={() => void onRemove(item.id)}
        title="Ta bort från kö"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
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
  const { copy } = useHubLocale();
  const d = copy.dashboard;
  const { theme } = useTheme();

  const [music, setMusic] = useState<MusicState | null>(null);
  const [voiceStates, setVoiceStates] = useState<VoiceStatesResponse | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [dropHover, setDropHover] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropDepthRef = useRef(0);

  const artThumbUrl =
    me.status !== "guest" && GUILD_ID ? (music?.now_playing?.thumbnail ?? null) : null;
  const artTextTone = useMusicArtTextTone(artThumbUrl, theme);

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
      if (res.ok) setMusic((await res.json()) as MusicState);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchMusic();
    let timer = window.setInterval(() => void fetchMusic(), hubMusicPollIntervalMs());
    const restart = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void fetchMusic(), hubMusicPollIntervalMs());
      if (!document.hidden) void fetchMusic();
    };
    document.addEventListener("visibilitychange", restart);
    return () => {
      document.removeEventListener("visibilitychange", restart);
      window.clearInterval(timer);
    };
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
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/music/${action}`),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
          },
        );
        if (action === "previous" && res.ok) {
          try {
            const j = (await res.json()) as { wentBack?: boolean };
            if (j.wentBack === false) {
              alert(d.musicPreviousNone);
            }
          } catch {
            /* ignore */
          }
        }
        await fetchMusic();
      } finally {
        setBusy(false);
      }
    },
    [fetchMusic, d.musicPreviousNone],
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

  const reorderQueue = useCallback(
    async (orderedIds: number[]) => {
      if (!GUILD_ID || orderedIds.length === 0) return;
      setBusy(true);
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(GUILD_ID)}/music/queue/reorder`),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds }),
          },
        );
        if (!res.ok) {
          alert(d.musicQueueReorderFailed);
        }
        await fetchMusic();
      } finally {
        setBusy(false);
      }
    },
    [fetchMusic, d.musicQueueReorderFailed],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleQueueDragEnd = useCallback(
    (event: DragEndEvent) => {
      const q = music?.queue ?? [];
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const aid = Number(active.id);
      const oid = Number(over.id);
      const oldIndex = q.findIndex((i) => i.id === aid);
      const newIndex = q.findIndex((i) => i.id === oid);
      if (oldIndex < 0 || newIndex < 0) return;
      const newOrder = arrayMove(q, oldIndex, newIndex).map((row) => row.id);
      void reorderQueue(newOrder);
    },
    [music?.queue, reorderQueue],
  );

  const resolveChannelId = (): string | null => {
    if (music?.now_playing?.channel_id) return music.now_playing.channel_id;
    if (me.status !== "user") return null;
    for (const ch of voiceStates?.channels ?? []) {
      if (ch.members.some((m) => m.user_id === me.profile.id)) return ch.channel_id;
    }
    return null;
  };

  const enqueueQuery = async (raw: string): Promise<boolean> => {
    const q = raw.trim();
    if (!q || busy) return false;
    const channelId = resolveChannelId();
    if (!channelId) {
      alert(d.musicNeedVoiceChannel);
      return false;
    }
    await cmd("play", { query: q, channelId });
    return true;
  };

  const handlePlay = async () => {
    const ok = await enqueueQuery(query);
    if (ok) {
      setQuery("");
      inputRef.current?.focus();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dropDepthRef.current += 1;
    if (e.dataTransfer.types.includes("text/uri-list") || e.dataTransfer.types.includes("text/plain")) {
      setDropHover(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropHover(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dropDepthRef.current = 0;
    setDropHover(false);
    const url = extractDroppedPlayableUrl(e.dataTransfer);
    if (!url || !isPlayableDroppedUrl(url)) {
      alert(d.musicPlayerDropInvalid);
      return;
    }
    void enqueueQuery(url).then((ok) => {
      if (ok) {
        setQuery("");
        inputRef.current?.focus();
      }
    });
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
  const queueTotal = music?.total_in_queue ?? queue.length;
  const canShuffleQueue = queueTotal >= 2;
  const artOnCard = Boolean(np?.thumbnail);
  const artShellTone = artOnCard ? artTextTone : null;

  return (
    <div
      role="region"
      aria-label={d.musicPlayerDropHint}
      className={cn(
        "relative mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 transition-[box-shadow,border-color] rounded-2xl",
        dropHover && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background bg-primary/5",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dropHover ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-background/80 backdrop-blur-sm"
          aria-hidden
        >
          <p className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
            {d.musicPlayerDropActive}
          </p>
        </div>
      ) : null}
      {/* ── Now Playing ────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Music className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Spelas nu
          </h2>
        </div>

        {np ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border border-border/60 shadow-sm",
              !np.thumbnail && "bg-card",
            )}
          >
            {np.thumbnail ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center saturate-[1.12] dark:saturate-100"
                  style={{ backgroundImage: `url(${np.thumbnail})` }}
                />
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-gradient-to-br",
                    /* Light: darken — `background` overlay washes art to near-white */
                    "from-black/50 via-black/42 to-black/55",
                    "dark:from-background/82 dark:via-background/68 dark:to-background/78",
                  )}
                />
              </>
            ) : null}
            <div
              className={cn(
                "relative z-10 p-5",
                artShellTone === "light-text" &&
                  "text-white [&_button]:text-white [&_button:hover]:bg-white/12",
                artShellTone === "dark-text" &&
                  "text-neutral-950 [&_button]:text-neutral-900 [&_button:hover]:bg-black/10",
              )}
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="shrink-0">
                  {np.thumbnail ? (
                    <img
                      src={np.thumbnail}
                      alt=""
                      className="size-24 rounded-xl object-cover shadow-md ring-1 ring-black/15 dark:ring-white/10"
                    />
                  ) : (
                    <div className="flex size-24 items-center justify-center rounded-xl bg-muted text-3xl">
                      🎵
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <p
                    className={cn(
                      "truncate text-base font-semibold leading-tight",
                      !artOnCard && "text-foreground",
                    )}
                  >
                    {np.title}
                  </p>
                  {np.artist && (
                    <p
                      className={cn(
                        "truncate text-sm",
                        !artOnCard && "text-muted-foreground",
                        artShellTone === "light-text" && "text-white/80",
                        artShellTone === "dark-text" && "text-neutral-800",
                      )}
                    >
                      {np.artist}
                    </p>
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
                  timeTextClassName={
                    artShellTone === "light-text"
                      ? "text-white/75"
                      : artShellTone === "dark-text"
                        ? "text-neutral-600"
                        : undefined
                  }
                />
              </div>

              {/* Controls */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 rounded-full"
                  disabled={busy}
                  onClick={() => void cmd("previous")}
                  title={d.musicPreviousTitle}
                >
                  <SkipBack className="size-5" />
                </Button>
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
                  className={cn(
                    "size-11 rounded-full text-destructive hover:text-destructive",
                    artShellTone === "light-text" && "!text-red-400 hover:!text-red-300",
                  )}
                  disabled={busy}
                  onClick={() => void cmd("stop")}
                  title="Stoppa och rensa kö"
                >
                  <Square className="size-5" />
                </Button>
              </div>
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
        <p className="mb-2 text-xs text-muted-foreground">{d.musicPlayerDropHint}</p>
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Kö
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {queueTotal}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 rounded-xl"
              disabled={busy || !canShuffleQueue}
              onClick={() => void cmd("shuffle")}
              title={d.musicShuffleQueue}
            >
              <Shuffle className="size-4" aria-hidden />
              {d.musicShuffleQueue}
            </Button>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground">
              <span className="text-2xl">🎵</span>
              <p>Kön är tom</p>
            </div>
          ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleQueueDragEnd}
          >
            <SortableContext
              items={queue.map((it) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5">
                {queue.map((item, idx) => (
                  <SortableQueueRow
                    key={item.id}
                    item={item}
                    index={idx}
                    voiceStates={voiceStates}
                    removingIds={removingIds}
                    busy={busy}
                    onRemove={removeFromQueue}
                    dragHandleAria={d.musicQueueDragHandleAria}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          )}
        </section>
    </div>
  );
}
