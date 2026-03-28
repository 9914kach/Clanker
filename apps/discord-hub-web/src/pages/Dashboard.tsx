import {
  Clock4,
  Dices,
  Flame,
  Gauge,
  MicVocal,
  NotebookPen,
  Orbit,
  Quote,
  Radio,
  Search,
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
import HubCustomModuleBuilder from "@/components/HubCustomModuleBuilder";
import HubLoreQuoteWidget from "@/components/HubLoreQuoteWidget";
import HubMoodClockWidget from "@/components/HubMoodClockWidget";
import { useHubAudio } from "@/components/HubAudioProvider";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { useHubSurfaceEngine } from "@/hooks/use-hub-surface-engine";
import { toBcp47, type HubLocale } from "@/i18n/hub-copy";
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

function pushHistory(values: readonly number[], next: number, max: number): number[] {
  if (max <= 0) return [];
  const trimmed = values.length >= max ? values.slice(values.length - (max - 1)) : [...values];
  return [...trimmed, next];
}

function HubPulseBars({
  values,
  barClassName = "bg-primary/55",
}: {
  values: readonly number[];
  barClassName?: string;
}) {
  if (values.length === 0) {
    return null;
  }
  const max = Math.max(1, ...values);

  return (
    <div className="flex h-7 items-end gap-0.5" aria-hidden>
      {values.map((value, index) => {
        const pct = Math.max(0.14, Math.max(0, value) / max);
        return (
          <div
            key={index}
            className={`w-1 rounded-sm ${barClassName}`}
            style={{ height: `${Math.round(pct * 100)}%` }}
          />
        );
      })}
    </div>
  );
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
  const [pulseHistory, setPulseHistory] = useState<{ voice: number[]; online: number[] }>(() => ({
    voice: [],
    online: [],
  }));
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
    if (me.status !== "user") {
      setPulseHistory({ voice: [], online: [] });
    }
  }, [me.status]);

  useEffect(() => {
    if (!guildWidget.live) return;
    setPulseHistory((prev) => ({
      ...prev,
      voice: pushHistory(prev.voice, guildWidget.live!.voice_users.length, 18),
    }));
  }, [guildWidget.live]);

  useEffect(() => {
    if (!guildWidget.summary) return;
    const online = guildWidget.summary.guild.approximate_presence_count;
    if (typeof online !== "number") return;
    setPulseHistory((prev) => ({
      ...prev,
      online: pushHistory(prev.online, online, 12),
    }));
  }, [guildWidget.summary]);

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
              {pulseHistory.online.length >= 2 ? (
                <div
                  className="rounded-lg border border-border/60 bg-background/70 p-2"
                  title={`Online pulse (recent): ${pulseHistory.online.at(-1) ?? 0}`}
                >
                  <HubPulseBars values={pulseHistory.online} barClassName="bg-accent/55" />
                </div>
              ) : null}
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
              {pulseHistory.voice.length >= 2 ? (
                <div
                  className="rounded-lg border border-border/60 bg-background/70 p-2"
                  title={`Voice pulse (recent): ${pulseHistory.voice.at(-1) ?? 0}`}
                >
                  <HubPulseBars values={pulseHistory.voice} />
                </div>
              ) : null}
              <HubGatewayHeartbeat live={guildWidget.live} />
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

    const wiretapWidget: HubDesktopWidget = {
      id: "discord-wiretap",
      label: d.widgetWiretap.label,
      description: d.widgetWiretap.description,
      tone: "useful",
      icon: Search,
      content: HUB_GUILD_ID ? (
        <HubDiscordWiretapWidget
          summary={guildWidget.summary}
          live={guildWidget.live}
          pulseHistory={pulseHistory}
        />
      ) : (
        <div className="text-sm text-muted-foreground">{d.guildIdHint}</div>
      ),
    };

    const moodClockWidget: HubDesktopWidget = {
      id: "mood-clock",
      label: d.widgetMoodClock.label,
      description: d.widgetMoodClock.description,
      tone: "social",
      icon: Clock4,
      content: <HubMoodClockWidget />,
    };

    const loreQuoteWidget: HubDesktopWidget = {
      id: "lore-quote",
      label: d.widgetLoreQuote.label,
      description: d.widgetLoreQuote.description,
      tone: "social",
      icon: Quote,
      content: <HubLoreQuoteWidget />,
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

    const chaosMeterWidget: HubDesktopWidget = {
      id: "chaos-meter",
      label: d.widgetChaosMeter.label,
      description: d.widgetChaosMeter.description,
      tone: "chaos",
      icon: Flame,
      content: <HubChaosMeterWidget />,
    };

    const voiceOrbitWidget: HubDesktopWidget = {
      id: "voice-orbit",
      label: d.widgetVoiceOrbit.label,
      description: d.widgetVoiceOrbit.description,
      tone: "social",
      icon: MicVocal,
      content: <HubVoiceOrbitWidget guild={guildWidget.summary?.guild ?? null} live={guildWidget.live} />,
    };

    const radioWidget: HubDesktopWidget = {
      id: "neutralen-radio",
      label: d.widgetRadio.label,
      description: d.widgetRadio.description,
      tone: "social",
      icon: Radio,
      content: <HubNeutralenRadioWidget />,
    };

    const customModuleWidget: HubDesktopWidget = {
      id: "custom-modules",
      label: d.widgetCustomModules.label,
      description: d.widgetCustomModules.description,
      tone: "useful",
      icon: NotebookPen,
      content: <HubCustomModuleBuilder storageKey={`hub.custom.modules.${profile.id}.v1`} />,
    };

    return [
      welcomeWidget,
      serverPulseWidget,
      wiretapWidget,
      moodClockWidget,
      loreQuoteWidget,
      wheelWidget,
      voiceOrbitWidget,
      radioWidget,
      presenceWidget,
      ritualWidget,
      chaosMeterWidget,
      customModuleWidget,
    ];
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
    pulseHistory,
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

type HubWiretapEvent = {
  id: number;
  ts: number;
  kind: "info" | "warn" | "danger" | "chaos";
  text: string;
};

function wiretapHash01(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function wiretapDotPos(userId: string): { left: string; top: string } {
  const x = 12 + wiretapHash01(userId) * 76;
  const y = 14 + wiretapHash01(`${userId}:y`) * 72;
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` };
}

function HubDiscordWiretapWidget({
  summary,
  live,
  pulseHistory,
}: {
  summary: GuildSummaryResponse | null;
  live: GuildLiveResponse | null;
  pulseHistory: { voice: readonly number[]; online: readonly number[] };
}) {
  const { copy, locale } = useHubLocale();
  const d = copy.dashboard;
  const chaosLines = d.chaosLines;
  const { play } = useHubAudio();
  const toasts = useHubToasts();

  const timeFormatter = useMemo(() => {
    const bcp47 = toBcp47(locale);
    return new Intl.DateTimeFormat(bcp47, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [locale]);

  const voiceNow = live ? live.voice_users.length : null;
  const onlineNow = summary?.guild.approximate_presence_count ?? null;
  const gatewayConnected = live?.gateway_connected ?? null;
  const gatewayDegraded = live?.gateway_degraded ?? null;

  const nextIdRef = useRef(1);
  const prevRef = useRef<{
    voiceNow: number | null;
    onlineNow: number | null;
    gatewayConnected: boolean | null;
    gatewayDegraded: boolean | null;
  }>({
    voiceNow: null,
    onlineNow: null,
    gatewayConnected: null,
    gatewayDegraded: null,
  });

  const [events, setEvents] = useState<HubWiretapEvent[]>(() => [
    {
      id: 0,
      ts: Date.now(),
      kind: "info",
      text: d.wiretapBootLine,
    },
  ]);

  const pushEvent = useCallback((event: Omit<HubWiretapEvent, "id" | "ts"> & { ts?: number }) => {
    const id = nextIdRef.current++;
    const ts = event.ts ?? Date.now();
    setEvents((prev) => [...prev.slice(-8), { id, ts, kind: event.kind, text: event.text }]);
  }, []);

  useEffect(() => {
    const prev = prevRef.current;

    if (gatewayConnected !== null && prev.gatewayConnected !== gatewayConnected) {
      pushEvent({
        kind: gatewayConnected ? "info" : "danger",
        text: `${d.gateway}: ${gatewayConnected ? d.gatewayConnected : d.gatewayDisconnected}`,
      });
    }

    if (gatewayDegraded !== null && prev.gatewayDegraded !== gatewayDegraded) {
      pushEvent({
        kind: gatewayDegraded ? "warn" : "info",
        text: gatewayDegraded ? d.wiretapGatewayDegraded : d.wiretapGatewayStable,
      });
    }

    if (voiceNow !== null && prev.voiceNow !== voiceNow) {
      pushEvent({ kind: "info", text: d.voiceNow(voiceNow) });
    }

    if (typeof onlineNow === "number" && prev.onlineNow !== onlineNow) {
      pushEvent({ kind: "info", text: d.wiretapOnlineNow(onlineNow) });
    }

    prevRef.current = {
      voiceNow,
      onlineNow: typeof onlineNow === "number" ? onlineNow : null,
      gatewayConnected,
      gatewayDegraded,
    };
  }, [
    d,
    gatewayConnected,
    gatewayDegraded,
    onlineNow,
    pushEvent,
    voiceNow,
  ]);

  const dots = useMemo(() => {
    const list = live?.voice_users ?? [];
    return list.slice(0, 12).map((user) => ({
      key: user.user_id,
      pos: wiretapDotPos(user.user_id),
    }));
  }, [live?.voice_users]);

  const gatewayVariant = !live
    ? "secondary"
    : live.gateway_connected
      ? live.gateway_degraded
        ? "destructive"
        : "outline"
      : "destructive";

  const gatewayLabel = !live
    ? d.wiretapGatewayUnknown
    : live.gateway_connected
      ? live.gateway_degraded
        ? d.wiretapGatewayDegradedShort
        : d.gatewayConnected
      : d.gatewayDisconnected;

  const leakRumor = useCallback(() => {
    play("chaos");
    pushEvent({
      kind: "chaos",
      text: `>>> ${pickHubChaosLine(chaosLines, chaosLines[0]!, Date.now())}`,
    });
    if (rollHubChaos("rare")) {
      toasts.push({
        kind: "chaos",
        title: d.wiretapLeakToastTitle,
        message: d.wiretapLeakToastMessage,
      });
    }
  }, [
    chaosLines,
    d.wiretapLeakToastMessage,
    d.wiretapLeakToastTitle,
    play,
    pushEvent,
    toasts,
  ]);

  const clearLog = useCallback(() => {
    play("panel");
    setEvents([
      {
        id: 0,
        ts: Date.now(),
        kind: "info",
        text: d.wiretapBootLine,
      },
    ]);
  }, [d.wiretapBootLine, play]);

  const historyVoice = pulseHistory.voice.at(-1) ?? 0;
  const historyOnline = pulseHistory.online.at(-1) ?? 0;

  const dotColor = gatewayConnected
    ? gatewayDegraded
      ? "bg-destructive/80"
      : "hub-gateway-heartbeat-dot bg-primary/80"
    : "bg-muted-foreground/40";

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>{d.wiretapBlurb}</p>

      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/60 p-3">
        <div className="relative h-28 overflow-hidden rounded-lg border border-border/60 bg-background/70">
          <div className="absolute inset-0 hub-wiretap-radar" aria-hidden />
          <div className="absolute inset-0 hub-wiretap-radar-sweep" aria-hidden />

          {dots.map((dot, index) => (
            <span
              key={`${dot.key}:${index}`}
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60 shadow-[0_0_0_2px_color-mix(in_oklab,var(--background)_70%,transparent),0_0_16px_color-mix(in_oklab,var(--primary)_20%,transparent)]"
              style={dot.pos}
              aria-hidden
            />
          ))}

          <div className="absolute inset-0 flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.gateway}</p>
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${dotColor}`} aria-hidden />
                <Badge variant={gatewayVariant}>{gatewayLabel}</Badge>
                {live?.gateway_degraded_reason ? (
                  <span className="truncate text-xs text-warning">{live.gateway_degraded_reason}</span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
              <div className="rounded-md border border-border/60 bg-background/70 px-2 py-1 text-foreground/90">
                {d.wiretapVoiceLabel}: <span className="font-semibold">{voiceNow ?? "—"}</span>
              </div>
              <div className="rounded-md border border-border/60 bg-background/70 px-2 py-1 text-foreground/90">
                {d.wiretapOnlineLabel}:{" "}
                <span className="font-semibold">{typeof onlineNow === "number" ? onlineNow : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {pulseHistory.voice.length >= 2 || pulseHistory.online.length >= 2 ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-background/70 p-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.wiretapVoicePulse}</p>
                <HubPulseBars values={pulseHistory.voice} />
                <p className="mt-1 text-[0.7rem] text-muted-foreground">{historyVoice}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.wiretapOnlinePulse}</p>
                <HubPulseBars values={pulseHistory.online} barClassName="bg-accent/55" />
                <p className="mt-1 text-[0.7rem] text-muted-foreground">{historyOnline}</p>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-background/70 p-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.wiretapLogLabel}</p>
            <div className="mt-2 space-y-1 font-mono text-[0.72rem] leading-relaxed">
              {events
                .slice()
                .reverse()
                .map((event) => {
                  const stamp = timeFormatter.format(new Date(event.ts));
                  const tone =
                    event.kind === "danger"
                      ? "text-destructive"
                      : event.kind === "warn"
                        ? "text-warning"
                        : event.kind === "chaos"
                          ? "text-primary"
                          : "text-foreground/90";
                  return (
                    <div key={event.id} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-muted-foreground/70">{stamp}</span>
                      <span className={tone}>{event.text}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={leakRumor}>
              {d.wiretapLeak}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearLog}>
              {d.wiretapClear}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type HubRadioTrack = {
  title: string;
  artist: string;
  mood: string;
};

const NEUTRALEN_RADIO_TRACKS: readonly HubRadioTrack[] = [
  { title: "Bara en snabb match", artist: "Kabelkören", mood: "copium" },
  { title: "Gateway Degraded (But Make It Cute)", artist: "Neutralen OS", mood: "pulse" },
  { title: "Seedloop 07", artist: "Wheel Whisper", mood: "chaos" },
  { title: "Dock Staring Contest", artist: "Taskbar Gremlin", mood: "glow" },
  { title: "Ritual Console Lullaby", artist: "Ambient Sysadmin", mood: "soft" },
  { title: "Presence Radar (Lo-Fi)", artist: "Orbit Kids", mood: "warm" },
];

function pickRadioTrack(seed: number): HubRadioTrack {
  const index = Math.abs(seed) % NEUTRALEN_RADIO_TRACKS.length;
  return NEUTRALEN_RADIO_TRACKS[index] ?? NEUTRALEN_RADIO_TRACKS[0]!;
}

function HubNeutralenRadioWidget() {
  const { copy } = useHubLocale();
  const d = copy.dashboard;
  const { play } = useHubAudio();
  const toasts = useHubToasts();
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const track = useMemo(() => {
    const daySeed = Number(new Date().toISOString().slice(8, 10));
    return pickRadioTrack(daySeed + shuffleSeed);
  }, [shuffleSeed]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = useMemo(() => {
    const durationMs = 212_000;
    const elapsedMs = Math.max(0, nowMs - startedAtMs);
    return (elapsedMs % durationMs) / durationMs;
  }, [nowMs, startedAtMs]);

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>{d.radioBlurb}</p>

      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/60 p-3">
        <div className="pointer-events-none absolute inset-0 hub-radio-static" aria-hidden />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.radioNowPlayingLabel}</p>
              <p className="mt-2 truncate text-base font-medium text-foreground">{track.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {track.artist} · {track.mood}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {d.radioBadge}
            </Badge>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="hub-radio-progress h-full rounded-full bg-primary/70 motion-reduce:transition-none"
              style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            play("confirm");
            const daySeed = Number(new Date().toISOString().slice(8, 10));
            const nextSeed = shuffleSeed + 1;
            const nextTrack = pickRadioTrack(daySeed + nextSeed);
            setShuffleSeed(nextSeed);
            setStartedAtMs(Date.now());
            toasts.push({
              kind: "info",
              title: d.radioToastTitle,
              message: d.radioToastMessage(nextTrack.title),
            });
          }}
        >
          {d.radioShuffle}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            play("panel");
            toasts.push({
              kind: "chaos",
              title: d.radioRequestToastTitle,
              message: d.radioRequestToastMessage,
            });
          }}
        >
          {d.radioRequest}
        </Button>
      </div>
    </div>
  );
}

function HubVoiceOrbitWidget({
  guild,
  live,
}: {
  guild: GuildSummaryResponse["guild"] | null;
  live: GuildLiveResponse | null;
}) {
  const { copy } = useHubLocale();
  const d = copy.dashboard;
  const { play } = useHubAudio();
  const toasts = useHubToasts();

  const voiceCount = live?.voice_users.length ?? 0;
  const uniqueChannels = useMemo(() => {
    if (!live?.voice_users) return 0;
    const channels = new Set<string>();
    for (const entry of live.voice_users) {
      if (entry.channel_id) channels.add(entry.channel_id);
    }
    return channels.size;
  }, [live?.voice_users]);

  const orbitCount = Math.max(3, Math.min(10, voiceCount || 3));
  const dots = useMemo(() => Array.from({ length: orbitCount }, (_, i) => i), [orbitCount]);

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>{d.voiceOrbitBlurb}</p>

      <div className="rounded-xl border border-border/60 bg-background/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{guild?.name ?? d.voiceOrbitUnknownGuild}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live ? d.voiceOrbitSoulsLine(voiceCount, uniqueChannels) : d.voiceOrbitNoSignal}
            </p>
          </div>
          <Badge variant={live?.gateway_connected ? "outline" : "destructive"} className="shrink-0">
            {live?.gateway_connected ? d.voiceOrbitGatewayOk : d.voiceOrbitGatewayNope}
          </Badge>
        </div>

        <div className="mt-3 flex items-center justify-center">
          <div className="hub-voice-orbit relative size-36 rounded-full border border-border/60 bg-background/50">
            <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/55 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent)]" />
            {dots.map((index) => (
              <div
                key={index}
                className="hub-voice-orbit-dot absolute left-1/2 top-1/2 size-2 rounded-full bg-foreground/70"
                style={{
                  ["--hub-orbit-radius" as never]: `${22 + index * 3}px`,
                  ["--hub-orbit-duration" as never]: `${6.5 + index * 0.85}s`,
                  ["--hub-orbit-delay" as never]: `${index * -0.6}s`,
                  opacity: 0.55 + (index % 3) * 0.12,
                }}
              />
            ))}
          </div>
        </div>

        {live?.gateway_degraded_reason ? (
          <p className="mt-3 text-xs text-warning">{live.gateway_degraded_reason}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            play("panel");
            toasts.push({
              kind: "success",
              title: d.voiceOrbitToastTitle,
              message: d.voiceOrbitToastMessage,
            });
          }}
        >
          {d.voiceOrbitAction}
        </Button>
      </div>
    </div>
  );
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function formatRelativeAge(locale: HubLocale, ageMs: number): string {
  const safeAge = Math.max(0, Math.round(ageMs));
  const seconds = Math.round(safeAge / 1000);
  const minutes = Math.round(safeAge / 60_000);
  const hours = Math.round(safeAge / 3_600_000);

  const rtf = new Intl.RelativeTimeFormat(toBcp47(locale), {
    numeric: "auto",
    style: "short",
  });

  if (safeAge < 60_000) {
    return rtf.format(-seconds, "second");
  }
  if (safeAge < 3_600_000) {
    return rtf.format(-minutes, "minute");
  }
  return rtf.format(-hours, "hour");
}

function HubGatewayHeartbeat({ live }: { live: GuildLiveResponse }) {
  const { locale, copy } = useHubLocale();
  const d = copy.dashboard;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  const eventMs = live.last_event_at ? Date.parse(live.last_event_at) : Number.NaN;
  if (!Number.isFinite(eventMs)) {
    return <p className="text-xs text-muted-foreground">{d.gatewayLastEventUnknown}</p>;
  }

  const ageMs = Math.max(0, nowMs - eventMs);
  const stale = ageMs > 20_000;
  const dotColor = !live.gateway_connected
    ? "bg-destructive/80"
    : stale
      ? "bg-warning/75"
      : "bg-primary/75";

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border/55 bg-background/60 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className={`hub-gateway-heartbeat-dot size-2 rounded-full ${dotColor}`} aria-hidden />
        <p className="text-xs text-muted-foreground">
          {d.gatewayLastEventLabel}{" "}
          <span className="text-foreground">{formatRelativeAge(locale, ageMs)}</span>
        </p>
      </div>
      {stale && live.gateway_connected ? (
        <Badge variant="outline" className="text-[0.65rem] uppercase tracking-[0.18em]">
          {d.gatewayStaleBadge}
        </Badge>
      ) : null}
    </div>
  );
}

function computeChaosSignal(now: Date): { value: number; tier: "calm" | "spicy" | "feral" | "meltdown" } {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const day = dayOfYear(now);
  const daily = (Math.sin((minutes / 1440) * Math.PI * 2) + 1) / 2;
  const wobble = (Math.sin(day * 12.9898 + minutes * 0.017) + 1) / 2;
  const value = Math.max(0, Math.min(100, Math.round((daily * 0.65 + wobble * 0.35) * 100)));

  const tier =
    value >= 86 ? "meltdown" : value >= 62 ? "feral" : value >= 36 ? "spicy" : "calm";

  return { value, tier };
}

function HubChaosMeterWidget() {
  const { copy } = useHubLocale();
  const d = copy.dashboard;
  const { play } = useHubAudio();
  const toasts = useHubToasts();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const { value, tier } = useMemo(() => computeChaosSignal(new Date(nowMs)), [nowMs]);
  const tierLabel =
    tier === "meltdown"
      ? d.chaosMeterTierMeltdown
      : tier === "feral"
        ? d.chaosMeterTierFeral
        : tier === "spicy"
          ? d.chaosMeterTierSpicy
          : d.chaosMeterTierCalm;

  const barToneClass =
    tier === "meltdown"
      ? "bg-destructive/75"
      : tier === "feral"
        ? "bg-accent/80"
        : tier === "spicy"
          ? "bg-warning/75"
          : "bg-primary/70";

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>{d.chaosMeterBlurb}</p>

      <div className="rounded-xl border border-border/60 bg-background/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{d.chaosMeterLevelLabel}</p>
          <Badge variant="outline">{tierLabel}</Badge>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${barToneClass}`}
            style={{ width: `${value}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{d.chaosMeterSignal(value)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            play("chaos");
            toasts.push({
              kind: "chaos",
              title: d.chaosMeterToastTitle,
              message: pickHubChaosLine(d.chaosLines, d.chaosLines[0]!, new Date().getHours()),
            });
          }}
        >
          {d.chaosMeterAction}
        </Button>
      </div>
    </div>
  );
}
