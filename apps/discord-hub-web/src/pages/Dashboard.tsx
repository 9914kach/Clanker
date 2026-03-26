import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AudioLines,
  Dices,
  Gauge,
  Orbit,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import { Badge } from "@clanker/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import { apiUrl } from "@/config";
import HubDesktopSurface, {
  type HubDesktopWidget,
  type HubDesktopWidgetLayout,
} from "@/components/HubDesktopSurface";
import { useHubAudio } from "@/components/HubAudioProvider";
import { useHubToasts } from "@/components/HubToastProvider";
import { useTheme } from "@/components/theme-provider";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { pickHubChaosLine, rollHubChaos } from "@/lib/hub-chaos";
import { hubEnterMotion } from "@/lib/hub-motion";

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";
const DASHBOARD_LAYOUT_KEY = "hub.dashboard.layout.v2";
const WIDGET_ORDER_KEY = "hub.dashboard.widget-order.v1";
const HIDDEN_WIDGETS_KEY = "hub.dashboard.hidden-widgets.v1";

const DEFAULT_WIDGET_ORDER = [
  "welcome",
  "server-pulse",
  "wheel-launchpad",
  "presence-radar",
  "ritual-console",
] as const;

const DEFAULT_HIDDEN_WIDGETS = ["ritual-console"] as const;

const DEFAULT_WIDGET_LAYOUTS: Record<string, HubDesktopWidgetLayout> = {
  welcome: { x: 24, y: 70, w: 360, h: 220, z: 1, hidden: false },
  "server-pulse": { x: 412, y: 70, w: 360, h: 250, z: 2, hidden: false },
  "wheel-launchpad": { x: 800, y: 70, w: 336, h: 220, z: 3, hidden: false },
  "presence-radar": { x: 92, y: 324, w: 360, h: 210, z: 4, hidden: false },
  "ritual-console": { x: 484, y: 350, w: 392, h: 200, z: 5, hidden: true },
};

const CHAOS_LINES = [
  "Neutralen OS blinked once and decided that was enough drama for now.",
  "A tiny invisible sysadmin keeps rearranging the vibes behind your back.",
  "The dashboard insists this all counts as infrastructure.",
  "Someone definitely whispered 'one quick game' into the wiring again.",
] as const;

type GuildSummaryResponse = {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count: number | null;
    approximate_presence_count: number | null;
  };
  channel_count: number;
};

type GuildLiveResponse = {
  guild_id: string;
  gateway_connected: boolean;
  gateway_degraded: boolean;
  gateway_degraded_reason: string | null;
  last_event_at: string | null;
  voice_users: { user_id: string; channel_id: string | null }[];
};

type GuildWidgetData = {
  summary: GuildSummaryResponse | null;
  live: GuildLiveResponse | null;
  summaryError: string | null;
  liveError: string | null;
};

function safeReadList(key: string, fallback: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [...fallback];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...fallback];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [...fallback];
  }
}

function nextDesktopZ(layouts: Readonly<Record<string, HubDesktopWidgetLayout>>): number {
  return Math.max(0, ...Object.values(layouts).map((layout) => layout.z)) + 1;
}

function safeReadDesktopLayout(): Record<string, HubDesktopWidgetLayout> {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const entries = Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([id, defaults]) => {
          const candidate = (parsed as Record<string, unknown>)[id];
          if (!candidate || typeof candidate !== "object") {
            return [id, defaults] as const;
          }

          const value = candidate as Partial<HubDesktopWidgetLayout>;
          return [
            id,
            {
              x: Number.isFinite(value.x) ? Number(value.x) : defaults.x,
              y: Number.isFinite(value.y) ? Number(value.y) : defaults.y,
              w: Number.isFinite(value.w) ? Number(value.w) : defaults.w,
              h: Number.isFinite(value.h) ? Number(value.h) : defaults.h,
              z: Number.isFinite(value.z) ? Number(value.z) : defaults.z,
              hidden: typeof value.hidden === "boolean" ? value.hidden : defaults.hidden,
            },
          ] as const;
        });
        return Object.fromEntries(entries);
      }
    }
  } catch {
    /* ignore */
  }

  const migratedLayout = Object.fromEntries(
    Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([id, layout]) => [id, { ...layout }]),
  ) as Record<string, HubDesktopWidgetLayout>;
  const legacyOrder = safeReadList(WIDGET_ORDER_KEY, DEFAULT_WIDGET_ORDER);
  const legacyHidden = new Set(safeReadList(HIDDEN_WIDGETS_KEY, DEFAULT_HIDDEN_WIDGETS));

  legacyOrder.forEach((id, index) => {
    if (!migratedLayout[id]) {
      return;
    }
    migratedLayout[id] = {
      ...migratedLayout[id],
      z: index + 1,
      hidden: legacyHidden.has(id),
    };
  });

  return migratedLayout;
}

export default function DashboardPage() {
  const reducedMotion = useReducedMotion() ?? false;
  const { me, openCommandPalette } = useHubLayout();
  const toasts = useHubToasts();
  const { play, enabled: audioEnabled, toggleEnabled: toggleAudio } = useHubAudio();
  const { colorPalette, setColorPalette } = useTheme();
  const [guildWidget, setGuildWidget] = useState<GuildWidgetData>({
    summary: null,
    live: null,
    summaryError: null,
    liveError: null,
  });
  const [desktopLayout, setDesktopLayout] = useState<Record<string, HubDesktopWidgetLayout>>(() =>
    safeReadDesktopLayout(),
  );

  useEffect(() => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(desktopLayout));
  }, [desktopLayout]);

  useEffect(() => {
    if (me.status !== "user" || !HUB_GUILD_ID) {
      return;
    }
    const ac = new AbortController();

    const readError = async (res: Response): Promise<string> => {
      try {
        const j = (await res.json()) as { error?: string; code?: string };
        if (typeof j.error === "string") {
          return j.code ? `${j.error} (${j.code})` : j.error;
        }
      } catch {
        /* ignore */
      }
      return res.statusText || `HTTP ${res.status}`;
    };

    const fetchSummary = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(HUB_GUILD_ID)}/summary`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const summaryError = await readError(res);
          setGuildWidget((prev) => ({
            ...prev,
            summary: null,
            summaryError,
          }));
          return;
        }
        const summary = (await res.json()) as GuildSummaryResponse;
        setGuildWidget((prev) => ({
          ...prev,
          summary,
          summaryError: null,
        }));
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((prev) => ({
          ...prev,
          summary: null,
          summaryError: "Nätverksfel vid hämtning av summary",
        }));
      }
    };

    const fetchLive = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/live/guild/${encodeURIComponent(HUB_GUILD_ID)}`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const liveError = await readError(res);
          setGuildWidget((prev) => ({
            ...prev,
            live: null,
            liveError,
          }));
          return;
        }
        const live = (await res.json()) as GuildLiveResponse;
        setGuildWidget((prev) => ({ ...prev, live, liveError: null }));
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((prev) => ({
          ...prev,
          live: null,
          liveError: "Nätverksfel vid hämtning av live-data",
        }));
      }
    };

    void Promise.all([fetchSummary(), fetchLive()]);
    const summaryTimer = window.setInterval(() => void fetchSummary(), 15_000);
    const liveTimer = window.setInterval(() => void fetchLive(), 4_000);
    return () => {
      ac.abort();
      window.clearInterval(summaryTimer);
      window.clearInterval(liveTimer);
    };
  }, [me.status]);

  const profile = me.status === "user" ? me.profile : null;
  const displayName = profile ? profile.global_name ?? profile.username : null;
  const publicProfilePath = profile ? `/u/${encodeURIComponent(profile.id)}` : "/login";

  const widgets = useMemo<HubDesktopWidget[]>(() => {
    if (!profile || !displayName) {
      return [];
    }

    const welcomeWidget: HubDesktopWidget = {
      id: "welcome",
      label: "Identity core",
      description: "Your profile, current palette, and launch posture.",
      tone: "social",
      icon: UserRound,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">@{profile.username}</Badge>
            <Badge variant="outline">{colorPalette}</Badge>
            <Badge variant={audioEnabled ? "outline" : "destructive"}>
              audio {audioEnabled ? "online" : "muted"}
            </Badge>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-foreground">
              Welcome back, <span className="font-medium">{displayName}</span>.
            </p>
            <p>
              This shell is now a little more like a desktop and a little less like a respectable app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={publicProfilePath}>Open profile</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openCommandPalette}>
              Command bar
            </Button>
          </div>
        </div>
      ),
    };

    const serverPulseWidget: HubDesktopWidget = {
      id: "server-pulse",
      label: "Server pulse",
      description: "Guild summary, voice presence and gateway health.",
      tone: "useful",
      icon: Gauge,
      content: HUB_GUILD_ID ? (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          {guildWidget.summaryError ? <p className="text-destructive">{guildWidget.summaryError}</p> : null}
          {guildWidget.liveError ? <p className="text-destructive">{guildWidget.liveError}</p> : null}
          {guildWidget.summary ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">{guildWidget.summary.guild.name}</p>
              <p>
                Medlemmar ca {guildWidget.summary.guild.approximate_member_count ?? "—"} · online ca{" "}
                {guildWidget.summary.guild.approximate_presence_count ?? "—"}
              </p>
              <p>Kanaler {guildWidget.summary.channel_count}</p>
            </div>
          ) : (
            <p>Laddar guild summary…</p>
          )}
          {guildWidget.live ? (
            <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/70 p-3">
              <p>
                Gateway{" "}
                <span className={guildWidget.live.gateway_connected ? "text-foreground" : "text-destructive"}>
                  {guildWidget.live.gateway_connected ? "ansluten" : "frånkopplad"}
                </span>
              </p>
              <p>I voice just nu: {guildWidget.live.voice_users.length}</p>
              {guildWidget.live.gateway_degraded_reason ? (
                <p className="text-xs text-warning">{guildWidget.live.gateway_degraded_reason}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Sätt <code className="text-foreground">VITE_DISCORD_HUB_GUILD_ID</code> för att visa guild-puls här.
        </div>
      ),
    };

    const wheelWidget: HubDesktopWidget = {
      id: "wheel-launchpad",
      label: "Wheel launchpad",
      description: "Fast path to random teams, shared chaos and repeatable seeds.",
      tone: "chaos",
      icon: Dices,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            Wheel-modulen är fortfarande den bästa platsen för att låta slumpen bära juridiskt ansvar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/tools/spin-the-wheel">Open wheel</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(`hub-${new Date().toISOString().slice(0, 10)}`);
                toasts.push({
                  kind: "info",
                  title: "Seed copied",
                  message: "Freshly harvested for future disputes.",
                });
              }}
            >
              Copy seed starter
            </Button>
          </div>
        </div>
      ),
    };

    const presenceWidget: HubDesktopWidget = {
      id: "presence-radar",
      label: "Presence radar",
      description: "A small social layer so the shell feels inhabited.",
      tone: "social",
      icon: Orbit,
      content: (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p className="text-foreground">Discord login is active and your profile shell is wired in.</p>
          <p>
            League, themes and identity settings all route through{" "}
            <Link to={publicProfilePath} className="text-foreground underline-offset-4 hover:underline">
              your profile
            </Link>
            .
          </p>
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live line</p>
            <p className="mt-2 text-sm text-foreground">
              {pickHubChaosLine(CHAOS_LINES, CHAOS_LINES[0]!, new Date().getHours())}
            </p>
          </div>
        </div>
      ),
    };

    const ritualWidget: HubDesktopWidget = {
      id: "ritual-console",
      label: "Ritual console",
      description: "Low-stakes toggles, palette vibes and little system rituals.",
      tone: "chaos",
      icon: Sparkles,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>For the premium desktop feeling: change palette, ping the command bar, and let the system make a scene.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                toggleAudio();
                toasts.push({
                  kind: "info",
                  title: audioEnabled ? "Audio muted" : "Audio armed",
                  message: audioEnabled ? "Silence mode engaged." : "Tiny noises restored.",
                });
              }}
            >
              {audioEnabled ? "Mute audio" : "Enable audio"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                play("chaos");
                toasts.push({
                  kind: "chaos",
                  title: "Ceremony accepted",
                  message: "The dashboard pretends this was necessary.",
                });
              }}
            >
              Fire ceremony
            </Button>
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-warning-foreground">
            Rare event policy: subtle charm always on, weirdness sometimes, nonsense sparingly.
          </div>
        </div>
      ),
    };

    return [welcomeWidget, serverPulseWidget, wheelWidget, presenceWidget, ritualWidget];
  }, [
    audioEnabled,
    colorPalette,
    displayName,
    guildWidget.live,
    guildWidget.liveError,
    guildWidget.summary,
    guildWidget.summaryError,
    openCommandPalette,
    play,
    profile,
    publicProfilePath,
    toasts,
    toggleAudio,
  ]);

  const orderedWidgets = useMemo(
    () =>
      [...widgets].sort((left, right) => (desktopLayout[left.id]?.z ?? 0) - (desktopLayout[right.id]?.z ?? 0)),
    [desktopLayout, widgets],
  );
  const hiddenWidgetIds = useMemo(
    () => orderedWidgets.filter((widget) => desktopLayout[widget.id]?.hidden).map((widget) => widget.id),
    [desktopLayout, orderedWidgets],
  );

  const revealWidget = (id: string) => {
    setDesktopLayout((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
        hidden: false,
        z: nextDesktopZ(prev),
      },
    }));
    play("panel");
    toasts.push({
      kind: "success",
      title: "Widget online",
      message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
    });
  };

  const hideWidget = (id: string) => {
    setDesktopLayout((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
        hidden: true,
      },
    }));
    toasts.push({
      kind: "info",
      title: "Widget hidden",
      message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
    });
  };

  const moveWidget = (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => {
    setDesktopLayout((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
        ...position,
        z: nextDesktopZ(prev),
      },
    }));
  };

  const focusWidget = (id: string) => {
    setDesktopLayout((prev) => {
      const current = prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id];
      if (!current || current.z === nextDesktopZ(prev) - 1) {
        return prev;
      }
      return {
        ...prev,
        [id]: {
          ...current,
          z: nextDesktopZ(prev),
        },
      };
    });
  };

  const resetDesktopLayout = () => {
    setDesktopLayout(
      Object.fromEntries(
        Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([id, layout]) => [id, { ...layout }]),
      ) as Record<string, HubDesktopWidgetLayout>,
    );
    play("panel");
    toasts.push({
      kind: "info",
      title: "Desktop reset",
      message: "Default layout restored.",
    });
  };

  const cyclePalette = () => {
    const next =
      colorPalette === "violett-neutral"
        ? "green"
        : colorPalette === "green"
          ? "terminal-dark-russian"
          : "violett-neutral";
    setColorPalette(next);
    play("panel");
    toasts.push({
      kind: "success",
      title: "Palette switched",
      message: next,
    });
  };

  const triggerChaosPulse = () => {
    play(rollHubChaos("rare") ? "chaos" : "confirm");
    toasts.push({
      kind: "chaos",
      title: "Desktop pulse",
      message: pickHubChaosLine(CHAOS_LINES, CHAOS_LINES[0]!),
    });
    if (rollHubChaos("sometimes")) {
      const sleeping = hiddenWidgetIds[0];
      if (sleeping) {
        revealWidget(sleeping);
      }
    }
  };

  if (me.status === "loading") {
    return <div className="mx-auto max-w-4xl px-5 py-10 text-muted-foreground">Laddar profil…</div>;
  }

  if (me.status === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (me.status === "backend_error") {
    return (
      <div className="mx-auto max-w-lg px-5 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Backend nårs inte</CardTitle>
            <CardDescription>
              <code className="text-foreground">discord-hub-api</code> körs inte eller har avslutats.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>Kontrollera att API:t körs.</p>
            <p>
              Lägg till värden från <code className="text-foreground">apps/discord-hub-api/.env.example</code>{" "}
              i repots <code className="text-foreground">.env</code> och starta om{" "}
              <code className="text-foreground">npm run dev:discord-stack</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...hubEnterMotion(reducedMotion, 8)} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">community OS</Badge>
          <Badge variant="outline">palette {colorPalette}</Badge>
          <Badge variant={audioEnabled ? "outline" : "destructive"}>
            audio {audioEnabled ? "online" : "muted"}
          </Badge>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Discord hub desktop</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Stable shell underneath, expressive chaos on top. Right-click the surface, drag widgets around,
            and use the command bar when you want the site to feel like software instead of a page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4" />
          <span>Dock, context menus, command palette, draggable widgets and audio now share the same system layer.</span>
        </div>
      </motion.header>

      <HubDesktopSurface
        widgets={orderedWidgets}
        layouts={desktopLayout}
        hiddenWidgetIds={hiddenWidgetIds}
        onMoveWidget={moveWidget}
        onFocusWidget={focusWidget}
        onOpenWidget={revealWidget}
        onHideWidget={hideWidget}
        onOpenCommandPalette={openCommandPalette}
        onCyclePalette={cyclePalette}
        audioEnabled={audioEnabled}
        onToggleAudio={() => {
          toggleAudio();
          if (!audioEnabled) {
            play("dock");
          }
        }}
        onChaosAction={triggerChaosPulse}
        onResetLayout={resetDesktopLayout}
      />

      <motion.section {...hubEnterMotion(reducedMotion, 10)} className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Dices className="size-4" />
              Next module target
            </CardTitle>
            <CardDescription>Wheel remains the strongest proof-of-fun.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>Realtime collaboration now starts in the wheel first, because it is visual, demoable and perfectly blameable.</p>
            <Button asChild size="sm">
              <Link to="/tools/spin-the-wheel">Go to wheel</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AudioLines className="size-4" />
              Sound policy
            </CardTitle>
            <CardDescription>Always little. Sometimes dramatic. Rarely cursed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>Clicks and panel sounds are now centralized instead of hard-coded per component.</p>
            <p>Mute lives as system state, not as a forgotten TODO.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              Identity direction
            </CardTitle>
            <CardDescription>Character before sterility, but with actual structure underneath.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>This is now closer to a living shell than a placeholder dashboard, which makes the rest of the roadmap much easier to extend coherently.</p>
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}
