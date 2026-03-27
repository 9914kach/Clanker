import {
  Dices,
  Gauge,
  NotebookPen,
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
import HubDesktopSurface, { type HubDesktopWidget } from "@/components/HubDesktopSurface";
import HubCustomModuleBuilder from "@/components/HubCustomModuleBuilder";
import { useHubAudio } from "@/components/HubAudioProvider";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { useHubSurfaceEngine } from "@/hooks/use-hub-surface-engine";
import { pickHubChaosLine, rollHubChaos } from "@/lib/hub-chaos";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import { gridStepForDensity } from "@/lib/hub-prefs";

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";

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
    gridVisible,
  } = useHubLayout();
  const toasts = useHubToasts();
  const { play, enabled: audioEnabled, toggleEnabled: toggleAudio } = useHubAudio();
  const { colorPalette } = useTheme();
  const { prefs } = useHubPrefs();
  const [guildWidget, setGuildWidget] = useState<GuildWidgetData>({
    summary: null,
    live: null,
    summaryError: null,
    liveError: null,
  });
  const seedPreview = useMemo(() => `hub-${new Date().toISOString().slice(0, 10)}`, []);

  const surface = useHubSurfaceEngine({
    layoutEditMode,
    gridSnapEnabled,
    gridStep: gridStepForDensity(prefs.desktop.gridDensity),
    prefs,
  });

  const {
    activeLayout,
    selectedWidgetIds,
    autosaveLayoutEnabled,
    isLayoutDirty,
    canUndoLayout,
    canRedoLayout,
    moveWidget,
    moveWidgetsByDelta,
    resizeWidget,
    focusWidget,
    saveLayoutCommitted,
    discardLayoutDraft,
    undoLayout,
    redoLayout,
    toggleAutosaveLayout,
    acknowledgeLayoutSaved,
    setWidgetSelection,
    toggleWidgetInSelection,
    clearWidgetSelection,
    nudgeSelectedWidgets,
    bringSelectedWidgetsToFront,
    revealAllHiddenWidgets: surfaceRevealAll,
    resetWidgetPosition: surfaceResetWidgetPosition,
    resetDesktopLayout: surfaceResetDesktopLayout,
  } = surface;

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
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-foreground">{d.welcomeBack(displayName)}</p>
            <p className="mt-1 text-muted-foreground">{d.welcomeBlurb}</p>
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
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{guildWidget.summary.guild.name}</p>
                <Badge variant="outline">{d.channels(guildWidget.summary.channel_count)}</Badge>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-2 text-xs text-muted-foreground">
                {d.membersOnline(
                  String(guildWidget.summary.guild.approximate_member_count ?? "—"),
                  String(guildWidget.summary.guild.approximate_presence_count ?? "—"),
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-3">
              <p>{d.serverLoadingSummary}</p>
            </div>
          )}
          {guildWidget.live ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.gateway}</p>
                <Badge variant={guildWidget.live.gateway_connected ? "outline" : "destructive"}>
                  {guildWidget.live.gateway_connected ? d.gatewayConnected : d.gatewayDisconnected}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{d.voiceNow(guildWidget.live.voice_users.length)}</p>
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
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Seed</p>
            <p className="mt-2 font-mono text-sm text-foreground">{seedPreview}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/tools/spin-the-wheel">{d.openWheel}</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(seedPreview);
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
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-foreground">{d.presenceLine1}</p>
            <p className="mt-2">
              {d.presenceLine2}
              <Link to={publicProfilePath} className="text-foreground underline-offset-4 hover:underline">
                {d.presenceLine2Link}
              </Link>
              .
            </p>
          </div>
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

    const customModuleWidget: HubDesktopWidget = {
      id: "custom-modules",
      label: "Custom modules",
      description: "Add modules and edit their size + content.",
      tone: "useful",
      icon: NotebookPen,
      content: <HubCustomModuleBuilder storageKey={`hub.custom.modules.${profile.id}.v1`} />,
    };

    return [welcomeWidget, serverPulseWidget, wheelWidget, presenceWidget, ritualWidget, customModuleWidget];
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
    seedPreview,
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
      surface.revealWidget(id);
      play("panel");
      toasts.push({
        kind: "success",
        title: d.toastWidgetOnline,
        message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
      });
    },
    [d.toastWidgetOnline, orderedWidgets, play, surface, toasts],
  );

  const hideWidget = useCallback(
    (id: string) => {
      surface.hideWidget(id);
      toasts.push({
        kind: "info",
        title: d.toastWidgetHidden,
        message: orderedWidgets.find((widget) => widget.id === id)?.label ?? id,
      });
    },
    [d.toastWidgetHidden, orderedWidgets, surface, toasts],
  );

  const resetWidgetPosition = useCallback(
    (id: string) => {
      surfaceResetWidgetPosition(id);
      play("panel");
      toasts.push({
        kind: "info",
        title: copy.shellMenu.resetWidgetPosition,
        message: copy.desktopSurface.widgetPositionResetToast,
      });
    },
    [copy.desktopSurface.widgetPositionResetToast, copy.shellMenu.resetWidgetPosition, surfaceResetWidgetPosition, play, toasts],
  );

  const resetDesktopLayout = useCallback(() => {
    surfaceResetDesktopLayout();
    play("panel");
    toasts.push({
      kind: "info",
      title: d.toastDesktopReset,
      message: d.toastDesktopResetMessage,
    });
  }, [d.toastDesktopReset, d.toastDesktopResetMessage, surfaceResetDesktopLayout, play, toasts]);

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
    surfaceRevealAll(hiddenWidgetIds);
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
    surfaceRevealAll,
    play,
    toasts,
  ]);

  const wrappedSaveLayoutCommitted = useCallback(() => {
    saveLayoutCommitted();
    play("confirm");
    toasts.push({
      kind: "success",
      title: copy.editMode.layoutSavedTitle,
      message: copy.editMode.layoutSavedMessage,
    });
  }, [copy.editMode.layoutSavedMessage, copy.editMode.layoutSavedTitle, play, saveLayoutCommitted, toasts]);

  const wrappedDiscardLayoutDraft = useCallback(() => {
    discardLayoutDraft();
    toasts.push({
      kind: "info",
      title: copy.editMode.layoutDiscardedTitle,
      message: copy.editMode.layoutDiscardedMessage,
    });
  }, [copy.editMode.layoutDiscardedMessage, copy.editMode.layoutDiscardedTitle, discardLayoutDraft, toasts]);

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
      saveLayoutCommitted: wrappedSaveLayoutCommitted,
      discardLayoutDraft: wrappedDiscardLayoutDraft,
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
    wrappedDiscardLayoutDraft,
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
    wrappedSaveLayoutCommitted,
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
      onResizeWidget={resizeWidget}
      onFocusWidget={focusWidget}
      onOpenWidget={revealWidget}
      onHideWidget={hideWidget}
      layoutEditMode={layoutEditMode}
      gridStep={gridStepForDensity(prefs.desktop.gridDensity)}
      gridSnapEnabled={gridSnapEnabled}
      gridCompaction={prefs.desktop.gridCompaction}
      showGrid={gridVisible}
      selectedWidgetIds={selectedWidgetIds}
      onSelectWidget={toggleWidgetInSelection}
    />
  );
}
