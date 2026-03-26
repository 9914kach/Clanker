import {
  Dices,
  Gauge,
  Orbit,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { pickHubChaosLine, rollHubChaos } from "@/lib/hub-chaos";

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
  const { copy } = useHubLocale();
  const d = copy.dashboard;
  const chaosLines = d.chaosLines;
  const {
    me,
    openCommandPalette,
    refreshMe,
    setDesktopShellState,
    layoutEditMode,
    gridSnapEnabled,
  } = useHubLayout();
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
          summaryError: copy.dashboard.networkSummary,
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
          liveError: copy.dashboard.networkLive,
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
  }, [copy, me.status]);

  const profile = me.status === "user" ? me.profile : null;
  const displayName = profile ? profile.global_name ?? profile.username : null;
  const publicProfilePath = profile ? `/u/${encodeURIComponent(profile.id)}` : "/login";

  const widgets = useMemo<HubDesktopWidget[]>(() => {
    if (!profile || !displayName) {
      return [];
    }

    const welcomeWidget: HubDesktopWidget = {
      id: "welcome",
      label: d.widgetWelcome.label,
      description: d.widgetWelcome.description,
      tone: "social",
      icon: UserRound,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">@{profile.username}</Badge>
            <Badge variant="outline">{colorPalette}</Badge>
            <Badge variant={audioEnabled ? "outline" : "destructive"}>
              {audioEnabled ? d.welcomeAudioOnline : d.welcomeAudioMuted}
            </Badge>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-foreground">
              {d.welcomeBack(displayName)}
            </p>
            <p>{d.welcomeBlurb}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={publicProfilePath}>{d.openProfile}</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openCommandPalette}>
              {d.commandBar}
            </Button>
          </div>
        </div>
      ),
    };

    const serverPulseWidget: HubDesktopWidget = {
      id: "server-pulse",
      label: d.widgetServerPulse.label,
      description: d.widgetServerPulse.description,
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
                {d.membersOnline(
                  String(guildWidget.summary.guild.approximate_member_count ?? "—"),
                  String(guildWidget.summary.guild.approximate_presence_count ?? "—"),
                )}
              </p>
              <p>{d.channels(guildWidget.summary.channel_count)}</p>
            </div>
          ) : (
            <p>{d.serverLoadingSummary}</p>
          )}
          {guildWidget.live ? (
            <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/70 p-3">
              <p>
                {d.gateway}{" "}
                <span className={guildWidget.live.gateway_connected ? "text-foreground" : "text-destructive"}>
                  {guildWidget.live.gateway_connected ? d.gatewayConnected : d.gatewayDisconnected}
                </span>
              </p>
              <p>{d.voiceNow(guildWidget.live.voice_users.length)}</p>
              {guildWidget.live.gateway_degraded_reason ? (
                <p className="text-xs text-warning">{guildWidget.live.gateway_degraded_reason}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">{d.guildIdHint}</div>
      ),
    };

    const wheelWidget: HubDesktopWidget = {
      id: "wheel-launchpad",
      label: d.widgetWheel.label,
      description: d.widgetWheel.description,
      tone: "chaos",
      icon: Dices,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>{d.wheelBlurb}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/tools/spin-the-wheel">{d.openWheel}</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(`hub-${new Date().toISOString().slice(0, 10)}`);
                toasts.push({
                  kind: "info",
                  title: copy.actions.toasts.seedCopied,
                  message: copy.actions.toasts.seedCopiedMessage,
                });
              }}
            >
              {d.copySeedStarter}
            </Button>
          </div>
        </div>
      ),
    };

    const presenceWidget: HubDesktopWidget = {
      id: "presence-radar",
      label: d.widgetPresence.label,
      description: d.widgetPresence.description,
      tone: "social",
      icon: Orbit,
      content: (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p className="text-foreground">{d.presenceLine1}</p>
          <p>
            {d.presenceLine2}
            <Link to={publicProfilePath} className="text-foreground underline-offset-4 hover:underline">
              {d.presenceLine2Link}
            </Link>
            .
          </p>
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.liveLineLabel}</p>
            <p className="mt-2 text-sm text-foreground">
              {pickHubChaosLine(chaosLines, chaosLines[0]!, new Date().getHours())}
            </p>
          </div>
        </div>
      ),
    };

    const ritualWidget: HubDesktopWidget = {
      id: "ritual-console",
      label: d.widgetRitual.label,
      description: d.widgetRitual.description,
      tone: "chaos",
      icon: Sparkles,
      content: (
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>{d.ritualBlurb}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                toggleAudio();
                toasts.push({
                  kind: "info",
                  title: audioEnabled ? copy.actions.toasts.audioMuted : copy.actions.toasts.audioArmed,
                  message: audioEnabled
                    ? copy.actions.toasts.audioMutedMessage
                    : copy.actions.toasts.audioArmedMessage,
                });
              }}
            >
              {audioEnabled ? d.muteAudio : d.enableAudio}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                play("chaos");
                toasts.push({
                  kind: "chaos",
                  title: d.ritualToastTitle,
                  message: d.ritualToastMessage,
                });
              }}
            >
              {d.fireCeremony}
            </Button>
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-warning-foreground">
            {d.ritualPolicy}
          </div>
        </div>
      ),
    };

    return [welcomeWidget, serverPulseWidget, wheelWidget, presenceWidget, ritualWidget];
  }, [
    audioEnabled,
    chaosLines,
    colorPalette,
    copy,
    d,
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

  const revealWidget = useCallback((id: string) => {
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
      title: d.toastWidgetOnline,
      message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
    });
  }, [d.toastWidgetOnline, orderedWidgets, play, toasts]);

  const hideWidget = useCallback((id: string) => {
    setDesktopLayout((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
        hidden: true,
      },
    }));
    toasts.push({
      kind: "info",
      title: d.toastWidgetHidden,
      message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
    });
  }, [d.toastWidgetHidden, orderedWidgets, toasts]);

  const moveWidget = useCallback(
    (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => {
      const grid = 16;
      const snap = (v: number) => (gridSnapEnabled ? Math.round(v / grid) * grid : v);
      setDesktopLayout((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          x: snap(position.x),
          y: snap(position.y),
          z: nextDesktopZ(prev),
        },
      }));
    },
    [gridSnapEnabled],
  );

  const focusWidget = useCallback((id: string) => {
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
  }, []);

  const resetWidgetPosition = useCallback(
    (id: string) => {
      setDesktopLayout((prev) => {
        const defaults = DEFAULT_WIDGET_LAYOUTS[id];
        if (!defaults) {
          return prev;
        }
        const current = prev[id] ?? defaults;
        return {
          ...prev,
          [id]: {
            ...defaults,
            hidden: current.hidden,
          },
        };
      });
      play("panel");
      toasts.push({
        kind: "info",
        title: copy.shellMenu.resetWidgetPosition,
        message: copy.desktopSurface.widgetPositionResetToast,
      });
    },
    [copy.desktopSurface.widgetPositionResetToast, copy.shellMenu.resetWidgetPosition, play, toasts],
  );

  const resetDesktopLayout = useCallback(() => {
    setDesktopLayout(
      Object.fromEntries(
        Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([id, layout]) => [id, { ...layout }]),
      ) as Record<string, HubDesktopWidgetLayout>,
    );
    play("panel");
    toasts.push({
      kind: "info",
      title: d.toastDesktopReset,
      message: d.toastDesktopResetMessage,
    });
  }, [d.toastDesktopReset, d.toastDesktopResetMessage, play, toasts]);

  const openAddModuleFlow = useCallback(() => {
    window.setTimeout(() => {
      document.getElementById("hub-spawn-modules")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    play("panel");
    toasts.push({
      kind: "info",
      title: copy.editMode.addModuleToastTitle,
      message: copy.editMode.addModuleToastBody,
    });
  }, [copy.editMode.addModuleToastBody, copy.editMode.addModuleToastTitle, play, toasts]);

  const revealAllHiddenWidgets = useCallback(() => {
    if (hiddenWidgetIds.length === 0) {
      return;
    }
    setDesktopLayout((prev) => {
      let z = nextDesktopZ(prev);
      const next = { ...prev };
      for (const id of hiddenWidgetIds) {
        const cur = next[id] ?? DEFAULT_WIDGET_LAYOUTS[id];
        if (!cur) {
          continue;
        }
        next[id] = { ...cur, hidden: false, z: z++ };
      }
      return next;
    });
    play("panel");
    toasts.push({
      kind: "success",
      title: copy.editMode.restoreAllTitle,
      message: copy.editMode.restoreAllMessage,
    });
  }, [hiddenWidgetIds, play, toasts, copy.editMode.restoreAllMessage, copy.editMode.restoreAllTitle]);

  const acknowledgeLayoutSaved = useCallback(() => {
    toasts.push({
      kind: "success",
      title: copy.editMode.layoutSavedTitle,
      message: copy.editMode.layoutSavedMessage,
    });
  }, [copy.editMode.layoutSavedMessage, copy.editMode.layoutSavedTitle, toasts]);

  const cyclePalette = useCallback(() => {
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
      title: d.toastPaletteSwitched,
      message: next,
    });
  }, [colorPalette, d.toastPaletteSwitched, play, setColorPalette, toasts]);

  const triggerChaosPulse = useCallback(() => {
    play(rollHubChaos("rare") ? "chaos" : "confirm");
    toasts.push({
      kind: "chaos",
      title: d.toastDesktopPulse,
      message: pickHubChaosLine(chaosLines, chaosLines[0]!),
    });
    if (rollHubChaos("sometimes")) {
      const sleeping = hiddenWidgetIds[0];
      if (sleeping) {
        revealWidget(sleeping);
      }
    }
  }, [chaosLines, d.toastDesktopPulse, hiddenWidgetIds, play, revealWidget, toasts]);

  const desktopShellWidgets = useMemo(
    () => widgets.map((widget) => ({ id: widget.id, label: widget.label, tone: widget.tone })),
    [widgets],
  );

  const toggleDesktopAudio = useCallback(() => {
    toggleAudio();
    if (!audioEnabled) {
      play("dock");
    }
  }, [audioEnabled, play, toggleAudio]);

  useEffect(() => {
    setDesktopShellState({
      widgets: desktopShellWidgets,
      hiddenWidgetIds,
      audioEnabled,
      revealWidget,
      hideWidget,
      resetLayout: resetDesktopLayout,
      triggerChaos: triggerChaosPulse,
      toggleAudio: toggleDesktopAudio,
      focusWidget,
      resetWidgetPosition,
      openAddModuleFlow,
      revealAllHiddenWidgets,
      acknowledgeLayoutSaved,
    });

    return () => setDesktopShellState(null);
  }, [
    audioEnabled,
    desktopShellWidgets,
    focusWidget,
    hiddenWidgetIds,
    hideWidget,
    acknowledgeLayoutSaved,
    openAddModuleFlow,
    resetDesktopLayout,
    resetWidgetPosition,
    revealAllHiddenWidgets,
    revealWidget,
    setDesktopShellState,
    toggleDesktopAudio,
    triggerChaosPulse,
  ]);

  if (me.status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 text-muted-foreground">{copy.common.loadingProfile}</div>
    );
  }

  if (me.status === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (me.status === "backend_error") {
    const bc = copy.backendCard;
    return (
      <div className="mx-auto max-w-lg px-5 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{bc.title}</CardTitle>
            <CardDescription>
              <code className="text-foreground">discord-hub-api</code> — {bc.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{bc.body}</p>
            <p>{bc.hintEnv}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" onClick={() => void refreshMe()}>
                {bc.retry}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
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
      onChaosAction={triggerChaosPulse}
      layoutEditMode={layoutEditMode}
      gridSnapEnabled={gridSnapEnabled}
    />
  );
}
