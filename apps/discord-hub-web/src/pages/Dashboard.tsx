import {
  Dices,
  Gauge,
  Orbit,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import { Badge } from "@clanker/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import { apiUrl } from "@/config";
import HubDesktopSurface, { type HubDesktopWidget } from "@/components/HubDesktopSurface";
import {
  cloneLayoutRecord,
  HUB_DESKTOP_LAYOUT_GRID,
  layoutRecordsEqual,
  snapCoord,
  type HubDesktopWidgetLayout,
} from "@/lib/hub-desktop-layout";
import { gridStepForDensity } from "@/lib/hub-prefs";
import { useHubAudio } from "@/components/HubAudioProvider";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { pickHubChaosLine, rollHubChaos } from "@/lib/hub-chaos";
import { useHubPrefs } from "@/components/HubPrefsProvider";

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";
const DASHBOARD_LAYOUT_KEY = "hub.dashboard.layout.v2";
const LAYOUT_AUTOSAVE_KEY = "hub.dashboard.layout.autosave.v1";
const WIDGET_ORDER_KEY = "hub.dashboard.widget-order.v1";
const HIDDEN_WIDGETS_KEY = "hub.dashboard.hidden-widgets.v1";

const MIN_WIDGET_W = 240;
const MIN_WIDGET_H = 140;

type DesktopEditSession = {
  draft: Record<string, HubDesktopWidgetLayout>;
  baseline: Record<string, HubDesktopWidgetLayout>;
  past: Record<string, HubDesktopWidgetLayout>[];
  future: Record<string, HubDesktopWidgetLayout>[];
};

function readAutosaveEnabled(): boolean {
  try {
    return localStorage.getItem(LAYOUT_AUTOSAVE_KEY) === "true";
  } catch {
    return false;
  }
}

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
  const { prefs } = useHubPrefs();
  const [guildWidget, setGuildWidget] = useState<GuildWidgetData>({
    summary: null,
    live: null,
    summaryError: null,
    liveError: null,
  });
  const [savedLayout, setSavedLayout] = useState<Record<string, HubDesktopWidgetLayout>>(() =>
    safeReadDesktopLayout(),
  );
  const [editSession, setEditSession] = useState<DesktopEditSession | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [autosaveLayoutEnabled, setAutosaveLayoutEnabled] = useState(readAutosaveEnabled);
  const savedLayoutRef = useRef(savedLayout);
  savedLayoutRef.current = savedLayout;
  const editSessionRef = useRef<DesktopEditSession | null>(null);
  editSessionRef.current = editSession;

  const activeLayout = layoutEditMode && editSession ? editSession.draft : savedLayout;

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_AUTOSAVE_KEY, autosaveLayoutEnabled ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [autosaveLayoutEnabled]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(savedLayout));
  }, [savedLayout]);

  const layoutEditModeRef = useRef(layoutEditMode);
  layoutEditModeRef.current = layoutEditMode;

  useEffect(() => {
    if (layoutEditMode) {
      const base = cloneLayoutRecord(savedLayoutRef.current);
      setEditSession({ draft: base, baseline: base, past: [], future: [] });
      setSelectedWidgetIds([]);
    } else {
      setEditSession(null);
      setSelectedWidgetIds([]);
    }
  }, [layoutEditMode]);

  const mutateDraft = useCallback(
    (updater: (prev: Record<string, HubDesktopWidgetLayout>) => Record<string, HubDesktopWidgetLayout>) => {
      setEditSession((session) => {
        if (!session) {
          return session;
        }
        const snapshot = cloneLayoutRecord(session.draft);
        const nextDraft = updater(cloneLayoutRecord(session.draft));
        const nextSession: DesktopEditSession = {
          ...session,
          draft: nextDraft,
          past: [...session.past, snapshot],
          future: [],
        };
        if (autosaveLayoutEnabled) {
          queueMicrotask(() => {
            if (layoutEditModeRef.current) {
              setSavedLayout(cloneLayoutRecord(nextDraft));
            }
          });
        }
        return nextSession;
      });
    },
    [autosaveLayoutEnabled],
  );

  const mutateSavedOrDraft = useCallback(
    (updater: (prev: Record<string, HubDesktopWidgetLayout>) => Record<string, HubDesktopWidgetLayout>) => {
      if (layoutEditMode && editSession) {
        mutateDraft(updater);
      } else {
        setSavedLayout((prev) => updater(cloneLayoutRecord(prev)));
      }
    },
    [editSession, layoutEditMode, mutateDraft],
  );

  const isLayoutDirty =
    Boolean(editSession) && !layoutRecordsEqual(editSession!.draft, editSession!.baseline);
  const canUndoLayout = (editSession?.past.length ?? 0) > 0;
  const canRedoLayout = (editSession?.future.length ?? 0) > 0;

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
      [...widgets].sort((left, right) => (activeLayout[left.id]?.z ?? 0) - (activeLayout[right.id]?.z ?? 0)),
    [activeLayout, widgets],
  );
  const hiddenWidgetIds = useMemo(
    () => orderedWidgets.filter((widget) => activeLayout[widget.id]?.hidden).map((widget) => widget.id),
    [activeLayout, orderedWidgets],
  );

  const revealWidget = useCallback(
    (id: string) => {
      mutateSavedOrDraft((prev) => ({
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
    },
    [d.toastWidgetOnline, mutateSavedOrDraft, orderedWidgets, play, toasts],
  );

  const hideWidget = useCallback(
    (id: string) => {
      mutateSavedOrDraft((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          hidden: true,
        },
      }));
      setSelectedWidgetIds((sel) => sel.filter((w) => w !== id));
      toasts.push({
        kind: "info",
        title: d.toastWidgetHidden,
        message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
      });
    },
    [d.toastWidgetHidden, mutateSavedOrDraft, orderedWidgets, toasts],
  );

  const moveWidgetImpl = useCallback(
    (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">, bumpZ: boolean) => {
      const gridStep = gridStepForDensity(prefs.desktop.gridDensity);
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const snap = (v: number) => snapCoord(v, gridSnapEnabled, gridStep, prefs.desktop.snapStrength);
        const base = {
          ...prev,
          [id]: {
            ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
            x: snap(position.x),
            y: snap(position.y),
            z: bumpZ ? nextDesktopZ(prev) : (prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!).z,
          },
        };
        return base;
      };
      if (layoutEditMode && editSession) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [editSession, gridSnapEnabled, layoutEditMode, mutateDraft, prefs.desktop.gridDensity, prefs.desktop.snapStrength],
  );

  const moveWidget = useCallback(
    (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => {
      moveWidgetImpl(id, position, true);
    },
    [moveWidgetImpl],
  );

  const moveWidgetsByDelta = useCallback(
    (ids: readonly string[], dx: number, dy: number) => {
      if (ids.length === 0) {
        return;
      }
      const gridStep = gridStepForDensity(prefs.desktop.gridDensity);
      const snap = (v: number) => snapCoord(v, gridSnapEnabled, gridStep, prefs.desktop.snapStrength);
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        let next = cloneLayoutRecord(prev);
        const topZ = nextDesktopZ(next);
        let zAssign = topZ;
        for (const wid of ids) {
          const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
          if (!cur || cur.hidden) {
            continue;
          }
          next[wid] = {
            ...cur,
            x: snap(cur.x + dx),
            y: snap(cur.y + dy),
            z: zAssign++,
          };
        }
        return next;
      };
      if (layoutEditMode && editSession) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [editSession, gridSnapEnabled, layoutEditMode, mutateDraft, prefs.desktop.gridDensity, prefs.desktop.snapStrength],
  );

  const resizeWidget = useCallback(
    (id: string, size: { w: number; h: number }) => {
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id]!),
          w: Math.max(MIN_WIDGET_W, Math.round(size.w)),
          h: Math.max(MIN_WIDGET_H, Math.round(size.h)),
          z: nextDesktopZ(prev),
        },
      });
      if (layoutEditMode && editSession) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [editSession, layoutEditMode, mutateDraft],
  );

  const focusWidget = useCallback(
    (id: string) => {
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const current = prev[id] ?? DEFAULT_WIDGET_LAYOUTS[id];
        if (!current) {
          return prev;
        }
        const top = nextDesktopZ(prev);
        if (current.z === top - 1) {
          return prev;
        }
        return {
          ...prev,
          [id]: {
            ...current,
            z: top,
          },
        };
      };
      if (layoutEditMode && editSession) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [editSession, layoutEditMode, mutateDraft],
  );

  const bringSelectedWidgetsToFront = useCallback(() => {
    if (selectedWidgetIds.length === 0) {
      return;
    }
    const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
      let next = cloneLayoutRecord(prev);
      let z = nextDesktopZ(next);
      for (const wid of selectedWidgetIds) {
        const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
        if (!cur || cur.hidden) {
          continue;
        }
        next[wid] = { ...cur, z: z++ };
      }
      return next;
    };
    if (layoutEditMode && editSession) {
      mutateDraft(apply);
    } else {
      setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
    }
  }, [editSession, layoutEditMode, mutateDraft, selectedWidgetIds]);

  const nudgeSelectedWidgets = useCallback(
    (dx: number, dy: number) => {
      if (selectedWidgetIds.length === 0) {
        return;
      }
      const step = gridSnapEnabled ? HUB_DESKTOP_LAYOUT_GRID : 1;
      const ndx = dx * step;
      const ndy = dy * step;
      const apply = (prev: Record<string, HubDesktopWidgetLayout>) => {
        const snap = (v: number) => snapCoord(v, gridSnapEnabled, HUB_DESKTOP_LAYOUT_GRID);
        let next = cloneLayoutRecord(prev);
        for (const wid of selectedWidgetIds) {
          const cur = next[wid] ?? DEFAULT_WIDGET_LAYOUTS[wid];
          if (!cur || cur.hidden) {
            continue;
          }
          next[wid] = {
            ...cur,
            x: snap(cur.x + ndx),
            y: snap(cur.y + ndy),
          };
        }
        return next;
      };
      if (layoutEditMode && editSession) {
        mutateDraft(apply);
      } else {
        setSavedLayout((prev) => apply(cloneLayoutRecord(prev)));
      }
    },
    [editSession, gridSnapEnabled, layoutEditMode, mutateDraft, selectedWidgetIds],
  );

  const saveLayoutCommitted = useCallback(() => {
    const s = editSessionRef.current;
    if (!s) {
      toasts.push({
        kind: "success",
        title: copy.editMode.layoutSavedTitle,
        message: copy.editMode.layoutSavedMessage,
      });
      return;
    }
    const committed = cloneLayoutRecord(s.draft);
    setSavedLayout(committed);
    setEditSession({
      draft: committed,
      baseline: committed,
      past: [],
      future: [],
    });
    play("confirm");
    toasts.push({
      kind: "success",
      title: copy.editMode.layoutSavedTitle,
      message: copy.editMode.layoutSavedMessage,
    });
  }, [copy.editMode.layoutSavedMessage, copy.editMode.layoutSavedTitle, play, toasts]);

  const discardLayoutDraft = useCallback(() => {
    setEditSession((s) => {
      if (!s) {
        return s;
      }
      const reverted = cloneLayoutRecord(s.baseline);
      if (autosaveLayoutEnabled) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(reverted)));
      }
      return {
        ...s,
        draft: reverted,
        past: [],
        future: [],
      };
    });
    toasts.push({
      kind: "info",
      title: copy.editMode.layoutDiscardedTitle,
      message: copy.editMode.layoutDiscardedMessage,
    });
  }, [autosaveLayoutEnabled, copy.editMode.layoutDiscardedMessage, copy.editMode.layoutDiscardedTitle, toasts]);

  const undoLayout = useCallback(() => {
    setEditSession((s) => {
      if (!s || s.past.length === 0) {
        return s;
      }
      const prevDraft = cloneLayoutRecord(s.past[s.past.length - 1]!);
      const newPast = s.past.slice(0, -1);
      const newFuture = [cloneLayoutRecord(s.draft), ...s.future];
      if (autosaveLayoutEnabled) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(prevDraft)));
      }
      return { ...s, draft: prevDraft, past: newPast, future: newFuture };
    });
  }, [autosaveLayoutEnabled]);

  const redoLayout = useCallback(() => {
    setEditSession((s) => {
      if (!s || s.future.length === 0) {
        return s;
      }
      const [nextDraft, ...restFuture] = s.future;
      const newPast = [...s.past, cloneLayoutRecord(s.draft)];
      const draft = cloneLayoutRecord(nextDraft!);
      if (autosaveLayoutEnabled) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(draft)));
      }
      return { ...s, draft, past: newPast, future: restFuture };
    });
  }, [autosaveLayoutEnabled]);

  const toggleAutosaveLayout = useCallback(() => {
    setAutosaveLayoutEnabled((prev) => {
      const next = !prev;
      if (next && editSessionRef.current) {
        queueMicrotask(() => setSavedLayout(cloneLayoutRecord(editSessionRef.current!.draft)));
      }
      return next;
    });
  }, []);

  const setWidgetSelection = useCallback((ids: readonly string[]) => {
    setSelectedWidgetIds([...ids]);
  }, []);

  const toggleWidgetInSelection = useCallback((id: string, additive: boolean) => {
    setSelectedWidgetIds((sel) => {
      if (additive) {
        if (sel.includes(id)) {
          return sel.filter((w) => w !== id);
        }
        return [...sel, id];
      }
      return [id];
    });
  }, []);

  const clearWidgetSelection = useCallback(() => {
    setSelectedWidgetIds([]);
  }, []);

  const resetWidgetPosition = useCallback(
    (id: string) => {
      mutateSavedOrDraft((prev) => {
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
    [copy.desktopSurface.widgetPositionResetToast, copy.shellMenu.resetWidgetPosition, mutateSavedOrDraft, play, toasts],
  );

  const resetDesktopLayout = useCallback(() => {
    const defaults = Object.fromEntries(
      Object.entries(DEFAULT_WIDGET_LAYOUTS).map(([wid, layout]) => [wid, { ...layout }]),
    ) as Record<string, HubDesktopWidgetLayout>;
    mutateSavedOrDraft(() => defaults);
    play("panel");
    toasts.push({
      kind: "info",
      title: d.toastDesktopReset,
      message: d.toastDesktopResetMessage,
    });
  }, [d.toastDesktopReset, d.toastDesktopResetMessage, mutateSavedOrDraft, play, toasts]);

  const openAddModuleFlow = useCallback(() => {
    const hasSleepingModules = hiddenWidgetIds.length > 0;
    window.setTimeout(() => {
      const spawn = document.getElementById("hub-spawn-modules");
      spawn?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (hasSleepingModules) {
        (spawn?.querySelector("button") as HTMLButtonElement | null)?.focus();
      }
    }, 0);
    play("panel");
    toasts.push({
      kind: "info",
      title: copy.editMode.addModuleToastTitle,
      message: copy.editMode.addModuleToastBody,
    });
  }, [
    copy.editMode.addModuleToastBody,
    copy.editMode.addModuleToastTitle,
    hiddenWidgetIds.length,
    play,
    toasts,
  ]);

  const revealAllHiddenWidgets = useCallback(() => {
    if (hiddenWidgetIds.length === 0) {
      return;
    }
    const ids = [...hiddenWidgetIds];
    mutateSavedOrDraft((prev) => {
      let z = nextDesktopZ(prev);
      const next = { ...prev };
      for (const id of ids) {
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
  }, [
    copy.editMode.restoreAllMessage,
    copy.editMode.restoreAllTitle,
    hiddenWidgetIds,
    mutateSavedOrDraft,
    play,
    toasts,
  ]);

  const acknowledgeLayoutSaved = useCallback(() => {
    saveLayoutCommitted();
  }, [saveLayoutCommitted]);

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
    const memeFreq = prefs.copyStyle.memeFrequency;
    const chaosAudio = memeFreq === "off" ? false : rollHubChaos(memeFreq === "low" ? "rare" : "rare");
    play(chaosAudio ? "chaos" : "confirm");
    toasts.push({
      kind: "chaos",
      title: d.toastDesktopPulse,
      message: memeFreq === "off" ? undefined : pickHubChaosLine(chaosLines, chaosLines[0]!),
    });
    if (memeFreq !== "off" && rollHubChaos("sometimes")) {
      const sleeping = hiddenWidgetIds[0];
      if (sleeping) {
        revealWidget(sleeping);
      }
    }
  }, [chaosLines, d.toastDesktopPulse, hiddenWidgetIds, play, prefs.copyStyle.memeFrequency, revealWidget, toasts]);

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
      saveLayoutCommitted,
      discardLayoutDraft,
      undoLayout,
      redoLayout,
      canUndoLayout,
      canRedoLayout,
      isLayoutDirty,
      autosaveLayoutEnabled,
      toggleAutosaveLayout,
      selectedWidgetIds,
      setWidgetSelection,
      toggleWidgetInSelection,
      clearWidgetSelection,
      nudgeSelectedWidgets,
      bringSelectedWidgetsToFront,
      moveWidget,
      moveWidgetsByDelta,
      resizeWidget,
      acknowledgeLayoutSaved,
    });

    return () => setDesktopShellState(null);
  }, [
    audioEnabled,
    autosaveLayoutEnabled,
    bringSelectedWidgetsToFront,
    canRedoLayout,
    canUndoLayout,
    clearWidgetSelection,
    desktopShellWidgets,
    discardLayoutDraft,
    focusWidget,
    hiddenWidgetIds,
    hideWidget,
    isLayoutDirty,
    moveWidget,
    moveWidgetsByDelta,
    nudgeSelectedWidgets,
    openAddModuleFlow,
    redoLayout,
    resetDesktopLayout,
    resetWidgetPosition,
    resizeWidget,
    revealAllHiddenWidgets,
    revealWidget,
    saveLayoutCommitted,
    acknowledgeLayoutSaved,
    selectedWidgetIds,
    setDesktopShellState,
    setWidgetSelection,
    toggleAutosaveLayout,
    toggleDesktopAudio,
    toggleWidgetInSelection,
    triggerChaosPulse,
    undoLayout,
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
      layouts={activeLayout}
      hiddenWidgetIds={hiddenWidgetIds}
      widgetVisualPrefsById={prefs.widgetVisualById}
      stylePackId={prefs.desktop.stylePackId}
      animationIntensity={prefs.motion.animationIntensity}
      onMoveWidget={moveWidget}
      onMoveWidgetsByDelta={moveWidgetsByDelta}
      onResizeWidget={resizeWidget}
      onFocusWidget={focusWidget}
      onOpenWidget={revealWidget}
      onHideWidget={hideWidget}
      onOpenCommandPalette={openCommandPalette}
      onCyclePalette={cyclePalette}
      audioEnabled={audioEnabled}
      onChaosAction={triggerChaosPulse}
      layoutEditMode={layoutEditMode}
      gridSnapEnabled={gridSnapEnabled}
      selectedWidgetIds={selectedWidgetIds}
      onSelectWidget={toggleWidgetInSelection}
      onClearSelection={clearWidgetSelection}
    />
  );
}
