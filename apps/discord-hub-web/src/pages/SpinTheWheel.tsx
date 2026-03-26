import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge } from "@clanker/ui/components/badge";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@clanker/ui/components/context-menu";
import { Input } from "@clanker/ui/components/input";
import { Separator } from "@clanker/ui/components/separator";
import { Switch } from "@clanker/ui/components/switch";
import { Textarea } from "@clanker/ui/components/textarea";
import { useHubAudio } from "@/components/HubAudioProvider";
import SpinWheel from "@/components/SpinWheel";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { apiUrl } from "@/config";
import { toBcp47 } from "@/i18n/hub-copy";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { buildWheelCollabDraft, useWheelCollab } from "@/hooks/use-wheel-collab";
import { normalizeWheelCollabRoom, type WheelCollabAction } from "@/lib/hub-collab";
import { buildTeams, makeRng, makeSeed, normalizeParticipants, pickIndex, type TeamMode } from "@/lib/spin-the-wheel";

type ApiWheelGroup = {
  id: string;
  name: string;
  participants: string[];
  createdAt: string;
  updatedAt: string;
};

const DRAFT_KEY = "hub.spinTheWheel.draft.v1";

type ApiWheelSession = {
  id: string;
  groupId: string | null;
  seed: string | null;
  teamCount: number;
  teamMode: TeamMode;
  participants: string[];
  winner: string | null;
  teams: string[][];
  createdAt: string;
};

function inputClassName(disabled?: boolean) {
  return [
    "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    disabled ? "cursor-not-allowed opacity-50" : "",
  ].join(" ");
}

async function readApiError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`.trim();
}

function computeRotationForWinner(
  currentRotation: number,
  winnerIndex: number,
  participantCount: number,
  extraSpins = 7,
) {
  if (participantCount <= 0 || winnerIndex < 0) {
    return currentRotation;
  }

  const sliceDeg = 360 / participantCount;
  const normalizedTarget = (((-(winnerIndex + 0.5) * sliceDeg) % 360) + 360) % 360;
  const currentNorm = (((currentRotation % 360) + 360) % 360) % 360;
  let delta = normalizedTarget - currentNorm;
  if (delta < 0) delta += 360;
  return currentRotation + extraSpins * 360 + delta;
}

export default function SpinTheWheelPage() {
  const { copy, locale } = useHubLocale();
  const w = copy.spinWheel;
  const tt = w.toasts;
  const { me } = useHubLayout();
  const toasts = useHubToasts();
  const { play } = useHubAudio();

  const [rawParticipants, setRawParticipants] = useState("");
  const participants = useMemo(() => normalizeParticipants(rawParticipants), [rawParticipants]);
  const [cursedNames, setCursedNames] = useState<Set<string>>(() => new Set());

  const [teamCount, setTeamCount] = useState(2);
  const [teamMode, setTeamMode] = useState<TeamMode>("balanced");
  const [seed, setSeed] = useState("");
  const [seedUsed, setSeedUsed] = useState<string | null>(null);
  const [spinSalt, setSpinSalt] = useState(0);
  const [shuffleSalt, setShuffleSalt] = useState(0);

  const [rotationDeg, setRotationDeg] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [teams, setTeams] = useState<string[][]>([]);

  const [groups, setGroups] = useState<ApiWheelGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [sessions, setSessions] = useState<ApiWheelSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [autoSaveSessions, setAutoSaveSessions] = useState(true);
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [collabRoomInput, setCollabRoomInput] = useState(w.defaultCollabRoom);

  const collabDraft = useMemo(
    () =>
      buildWheelCollabDraft({
        rawParticipants,
        teamCount,
        teamMode,
        seed,
      }),
    [rawParticipants, seed, teamCount, teamMode],
  );

  const applyRemoteDraft = useCallback((draft: typeof collabDraft) => {
    setRawParticipants(draft.rawParticipants);
    setTeamCount(draft.teamCount);
    setTeamMode(draft.teamMode);
    setSeed(draft.seed);
  }, []);

  const applyRemoteAction = useCallback(
    (action: WheelCollabAction) => {
      setRawParticipants(action.participants.join("\n"));
      setSeedUsed(action.seedUsed);
      setTeams(action.teams);
      const winnerIndex =
        action.winner !== null ? action.participants.indexOf(action.winner) : -1;

      if (action.kind === "spin" && winnerIndex >= 0) {
        setWinnerName(null);
        setHighlightIndex(winnerIndex);
        setSpinning(true);
        setRotationDeg((prev) =>
          computeRotationForWinner(prev, winnerIndex, action.participants.length),
        );
      } else {
        setSpinning(false);
        setHighlightIndex(winnerIndex >= 0 ? winnerIndex : null);
        setWinnerName(action.winner);
      }

      if (me.status === "user" && action.triggeredById !== me.profile.id) {
        toasts.push({
          kind: "info",
          title: tt.roomUpdate,
          message: tt.roomUpdateMessage(action.triggeredByName),
        });
      }
    },
    [me, toasts, tt],
  );

  const collab = useWheelCollab({
    enabled: collabEnabled && me.status === "user",
    roomInput: collabRoomInput,
    me: me.status === "user" ? me.profile : null,
    draft: collabDraft,
    onRemoteDraft: applyRemoteDraft,
    onRemoteAction: applyRemoteAction,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          if (typeof o.rawParticipants === "string") setRawParticipants(o.rawParticipants);
          if (typeof o.teamCount === "number") setTeamCount(o.teamCount);
          if (o.teamMode === "balanced" || o.teamMode === "equal") setTeamMode(o.teamMode);
          if (typeof o.seed === "string") setSeed(o.seed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/wheel/groups"), { credentials: "include" });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
        toasts.push({ kind: "error", title: tt.loadGroupsFail, message: msg });
        return;
      }
      const data = (await res.json()) as { groups: ApiWheelGroup[] };
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      setApiError(tt.backendUnreachableMessage);
      toasts.push({ kind: "error", title: tt.backendUnreachable, message: tt.backendUnreachableMessage });
    } finally {
      setGroupsLoading(false);
    }
  }, [toasts, tt.backendUnreachable, tt.backendUnreachableMessage, tt.loadGroupsFail]);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/wheel/sessions/recent?limit=12"), {
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
        toasts.push({ kind: "error", title: tt.loadSessionsFail, message: msg });
        return;
      }
      const data = (await res.json()) as { sessions: ApiWheelSession[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setApiError(tt.backendUnreachableMessage);
      toasts.push({ kind: "error", title: tt.backendUnreachable, message: tt.backendUnreachableMessage });
    } finally {
      setSessionsLoading(false);
    }
  }, [toasts, tt.backendUnreachable, tt.backendUnreachableMessage, tt.loadSessionsFail]);

  useEffect(() => {
    if (me.status !== "user") return;
    void refreshGroups();
    void refreshSessions();
  }, [me.status, refreshGroups, refreshSessions]);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ rawParticipants, teamCount, teamMode, seed }),
    );
  }, [rawParticipants, seed, teamCount, teamMode]);

  const isReady = participants.length >= 2;

  const canMakeEqualTeams =
    participants.length > 0 && teamCount >= 1 && participants.length % teamCount === 0;

  const runSpin = useCallback(
    (opts: { alsoMakeTeams: boolean }) => {
      if (!isReady || spinning) return;

      const seedForAction = seed.trim() ? seed.trim() : makeSeed();
      const nextSpinSalt = spinSalt + 1;
      const nextShuffleSalt = shuffleSalt;
      setSeedUsed(seedForAction);
      setSpinSalt(nextSpinSalt);
      play(opts.alsoMakeTeams ? "confirm" : "panel");
      const rng = makeRng([seedForAction, `spin:${nextSpinSalt}`].join(":"));
      const winnerIndex = pickIndex(participants.length, rng);
      setHighlightIndex(winnerIndex);
      const extraSpins = 6 + Math.floor(rng() * 4);
      const finalRotation = computeRotationForWinner(
        rotationDeg,
        winnerIndex,
        participants.length,
        extraSpins,
      );

      let actionTeams: string[][] = [];
      let actionSeedUsed = seedForAction;
      const winner = participants[winnerIndex] ?? null;

      setWinnerName(null);
      setSpinning(true);
      setRotationDeg(finalRotation);

      if (opts.alsoMakeTeams) {
        const { seedUsed: used, teams: nextTeams } = buildTeams({
          participants,
          teamCount,
          mode: teamMode,
          seed: seedForAction,
          salt: `teams:${nextShuffleSalt}`,
        });
        setSeedUsed(used);
        setTeams(nextTeams);
        actionTeams = nextTeams;
        actionSeedUsed = used;
        if (autoSaveSessions && nextTeams.length > 0) {
          void (async () => {
            try {
              const res = await fetch(apiUrl("/api/wheel/sessions"), {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  groupId: selectedGroupId,
                  seed: used,
                  teamCount,
                  teamMode,
                  participants,
                  winner,
                  teams: nextTeams,
                }),
              });
              if (!res.ok) {
                const msg = await readApiError(res);
                setApiError(msg);
                toasts.push({ kind: "error", title: tt.saveSessionFail, message: msg });
                return;
              }
              toasts.push({
                kind: "success",
                title: tt.sessionSaved,
                message: winner ? tt.sessionSavedWinner(winner) : tt.sessionSavedTeams,
              });
              void refreshSessions();
            } catch {
              setApiError(tt.backendUnreachableMessage);
              toasts.push({
                kind: "error",
                title: tt.saveSessionFail,
                message: tt.backendUnreachableMessage,
              });
            }
          })();
        }
      }

      if (collab.connected && me.status === "user") {
        collab.publishAction({
          id: crypto.randomUUID(),
          kind: "spin",
          participants,
          winner,
          teams: actionTeams,
          seedUsed: actionSeedUsed,
          triggeredById: me.profile.id,
          triggeredByName: me.profile.global_name ?? me.profile.username,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [
      autoSaveSessions,
      collab,
      isReady,
      me,
      participants,
      play,
      refreshSessions,
      rotationDeg,
      seed,
      selectedGroupId,
      shuffleSalt,
      spinSalt,
      spinning,
      teamCount,
      teamMode,
      toasts,
      tt,
    ],
  );

  const onWheelAnimationComplete = useCallback(() => {
    if (!spinning) return;
    setSpinning(false);
    if (highlightIndex !== null && participants[highlightIndex]) {
      setWinnerName(participants[highlightIndex]!);
    }
  }, [highlightIndex, participants, spinning]);

  const reshuffleTeams = useCallback(() => {
    if (participants.length === 0) return;
    const seedForAction = seed.trim() ? seed.trim() : makeSeed();
    setSeedUsed(seedForAction);
    const nextSalt = shuffleSalt + 1;
    setShuffleSalt(nextSalt);
    play("panel");
    const { seedUsed: used, teams: nextTeams } = buildTeams({
      participants,
      teamCount,
      mode: teamMode,
      seed: seedForAction,
      salt: `teams:${nextSalt}`,
    });
    setSeedUsed(used);
    setTeams(nextTeams);
    if (collab.connected && me.status === "user") {
      collab.publishAction({
        id: crypto.randomUUID(),
        kind: "teams",
        participants,
        winner: null,
        teams: nextTeams,
        seedUsed: used,
        triggeredById: me.profile.id,
        triggeredByName: me.profile.global_name ?? me.profile.username,
        createdAt: new Date().toISOString(),
      });
    }
    if (autoSaveSessions && nextTeams.length > 0) {
      void (async () => {
        try {
          const res = await fetch(apiUrl("/api/wheel/sessions"), {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              groupId: selectedGroupId,
              seed: used,
              teamCount,
              teamMode,
              participants,
              winner: null,
              teams: nextTeams,
            }),
          });
          if (!res.ok) {
            const msg = await readApiError(res);
            setApiError(msg);
            toasts.push({ kind: "error", title: tt.saveSessionFail, message: msg });
            return;
          }
          toasts.push({ kind: "success", title: tt.sessionSaved, message: tt.sessionSavedTeams });
          void refreshSessions();
        } catch {
          setApiError(tt.backendUnreachableMessage);
          toasts.push({
            kind: "error",
            title: tt.saveSessionFail,
            message: tt.backendUnreachableMessage,
          });
        }
      })();
    }
  }, [
    autoSaveSessions,
    collab,
    me,
    participants,
    play,
    refreshSessions,
    seed,
    selectedGroupId,
    shuffleSalt,
    teamCount,
    teamMode,
    toasts,
    tt.backendUnreachableMessage,
    tt.saveSessionFail,
    tt.sessionSaved,
    tt.sessionSavedTeams,
  ]);

  const makeTeamsNow = useCallback(() => {
    if (participants.length === 0) return;
    const seedForAction = seed.trim() ? seed.trim() : makeSeed();
    setSeedUsed(seedForAction);
    play("panel");
    const { seedUsed: used, teams: nextTeams } = buildTeams({
      participants,
      teamCount,
      mode: teamMode,
      seed: seedForAction,
      salt: `teams:${shuffleSalt}`,
    });
    setSeedUsed(used);
    setTeams(nextTeams);
    if (collab.connected && me.status === "user") {
      collab.publishAction({
        id: crypto.randomUUID(),
        kind: "teams",
        participants,
        winner: null,
        teams: nextTeams,
        seedUsed: used,
        triggeredById: me.profile.id,
        triggeredByName: me.profile.global_name ?? me.profile.username,
        createdAt: new Date().toISOString(),
      });
    }
    if (autoSaveSessions && nextTeams.length > 0) {
      void (async () => {
        try {
          const res = await fetch(apiUrl("/api/wheel/sessions"), {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              groupId: selectedGroupId,
              seed: used,
              teamCount,
              teamMode,
              participants,
              winner: null,
              teams: nextTeams,
            }),
          });
          if (!res.ok) {
            const msg = await readApiError(res);
            setApiError(msg);
            toasts.push({ kind: "error", title: tt.saveSessionFail, message: msg });
            return;
          }
          toasts.push({ kind: "success", title: tt.sessionSaved, message: tt.sessionSavedTeams });
          void refreshSessions();
        } catch {
          setApiError(tt.backendUnreachableMessage);
          toasts.push({
            kind: "error",
            title: tt.saveSessionFail,
            message: tt.backendUnreachableMessage,
          });
        }
      })();
    }
  }, [
    autoSaveSessions,
    collab,
    me,
    participants,
    play,
    refreshSessions,
    seed,
    selectedGroupId,
    shuffleSalt,
    teamCount,
    teamMode,
    toasts,
    tt.backendUnreachableMessage,
    tt.saveSessionFail,
    tt.sessionSaved,
    tt.sessionSavedTeams,
  ]);

  const removeParticipant = useCallback(
    (name: string) => {
      const next = participants.filter((p) => p !== name);
      setRawParticipants(next.join("\n"));
    },
    [participants],
  );

  const toggleCursed = useCallback(
    (name: string) => {
      setCursedNames((prev) => {
        const next = new Set(prev);
        const key = name.toLocaleLowerCase();
        if (next.has(key)) {
          next.delete(key);
          toasts.push({ kind: "info", title: w.curseLifted, message: name });
        } else {
          next.add(key);
          toasts.push({ kind: "chaos", title: w.markedCursed, message: name });
        }
        return next;
      });
    },
    [toasts, w.curseLifted, w.markedCursed],
  );

  const clearSelectedGroup = useCallback(() => {
    setSelectedGroupId(null);
    setGroupName("");
  }, []);

  const loadGroup = useCallback((group: ApiWheelGroup) => {
    setSelectedGroupId(group.id);
    setGroupName(group.name);
    setRawParticipants(group.participants.join("\n"));
    setWinnerName(null);
    setHighlightIndex(null);
    setTeams([]);
  }, []);

  const loadSession = useCallback((s: ApiWheelSession) => {
    setSelectedGroupId(s.groupId ?? null);
    setRawParticipants(s.participants.join("\n"));
    setTeamCount(s.teamCount);
    setTeamMode(s.teamMode);
    setSeed(s.seed ?? "");
    setSeedUsed(s.seed ?? null);
    setTeams(s.teams);
    setWinnerName(s.winner);
    if (s.winner) {
      const idx = s.participants.indexOf(s.winner);
      setHighlightIndex(idx >= 0 ? idx : null);
    } else {
      setHighlightIndex(null);
    }
    setSpinning(false);
  }, []);

  const createGroup = useCallback(async () => {
    const name = groupName.trim() || w.newGroupDefault;
    setApiError(null);
    try {
      const res = await fetch(apiUrl("/api/wheel/groups"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, participants }),
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
          toasts.push({ kind: "error", title: tt.saveGroupFail, message: msg });
        return;
      }
      clearSelectedGroup();
      await refreshGroups();
      toasts.push({ kind: "success", title: tt.groupSaved, message: name });
    } catch {
      setApiError(tt.backendUnreachableMessage);
      toasts.push({
        kind: "error",
        title: tt.saveGroupFail,
        message: tt.backendUnreachableMessage,
      });
    }
  }, [clearSelectedGroup, groupName, participants, refreshGroups, toasts, tt.backendUnreachableMessage, tt.groupSaved, tt.saveGroupFail, w.newGroupDefault]);

  const updateGroup = useCallback(async () => {
    if (!selectedGroupId) return;
    const name = groupName.trim() || w.newGroupDefault;
    setApiError(null);
    try {
      const res = await fetch(apiUrl(`/api/wheel/groups/${encodeURIComponent(selectedGroupId)}`), {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, participants }),
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
        toasts.push({ kind: "error", title: tt.updateGroupFail, message: msg });
        return;
      }
      await refreshGroups();
      toasts.push({ kind: "success", title: tt.groupUpdated, message: name });
    } catch {
      setApiError(tt.backendUnreachableMessage);
      toasts.push({
        kind: "error",
        title: tt.updateGroupFail,
        message: tt.backendUnreachableMessage,
      });
    }
  }, [groupName, participants, refreshGroups, selectedGroupId, toasts, tt, w.newGroupDefault]);

  const deleteGroup = useCallback(async (id: string) => {
    setApiError(null);
    try {
      const res = await fetch(apiUrl(`/api/wheel/groups/${encodeURIComponent(id)}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
        toasts.push({ kind: "error", title: tt.deleteGroupFail, message: msg });
        return;
      }
      if (selectedGroupId === id) clearSelectedGroup();
      await refreshGroups();
      toasts.push({ kind: "chaos", title: tt.groupDeleted, message: tt.groupDeletedMessage });
    } catch {
      setApiError(tt.backendUnreachableMessage);
      toasts.push({
        kind: "error",
        title: tt.deleteGroupFail,
        message: tt.backendUnreachableMessage,
      });
    }
  }, [clearSelectedGroup, refreshGroups, selectedGroupId, toasts, tt]);

  if (me.status === "loading") return <div>{w.loading}</div>;
  if (me.status === "guest") return <Navigate to="/login" replace />;
  if (me.status === "backend_error") return <div>{w.backendError}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{w.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{w.pageSubtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {w.collabTitle}
            <Badge variant={collab.connected ? "secondary" : "outline"}>
              {collab.connected ? w.collabConnected : collab.status}
            </Badge>
            {collab.synced ? <Badge variant="outline">{w.collabSynced}</Badge> : null}
          </CardTitle>
          <CardDescription>{w.collabDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{w.roomLabel}</label>
              <Input
                value={collabRoomInput}
                onChange={(event) => setCollabRoomInput(normalizeWheelCollabRoom(event.target.value))}
                placeholder={w.defaultCollabRoom}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{w.presenceCount(collab.presence.length)}</span>
              {collab.presence.map((peer) => (
                <Badge key={`${peer.userId}-${peer.clientId}`} variant="outline">
                  {peer.name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={collabEnabled} onCheckedChange={setCollabEnabled} />
              <span>{w.realtimeEnabled}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(collab.room || collabRoomInput);
                  toasts.push({
                    kind: "info",
                    title: tt.roomCopied,
                    message: collab.room || collabRoomInput,
                  });
                }}
              >
                {w.copyRoom}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{w.participantsTitle}</CardTitle>
              <CardDescription>{w.participantsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Textarea
                value={rawParticipants}
                onChange={(e) => setRawParticipants(e.target.value)}
                rows={7}
                className={inputClassName()}
                placeholder={w.participantsTextareaPlaceholder}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {participants.length === 0 ? w.noParticipants : w.participantCount(participants.length)}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRawParticipants("")}
                  disabled={participants.length === 0}
                >
                  {w.clear}
                </Button>
              </div>

              {participants.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <ContextMenu key={p}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => removeParticipant(p)}
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition",
                            "hover:bg-muted active:scale-[0.99]",
                            cursedNames.has(p.toLocaleLowerCase())
                              ? "border-warning/60 bg-warning/10"
                              : "border-border bg-card",
                          ].join(" ")}
                          title={w.participantChipTitle}
                        >
                          <span className="max-w-[16rem] truncate">{p}</span>
                          <span className="text-muted-foreground">×</span>
                        </button>
                      </ContextMenuTrigger>

                      <ContextMenuContent>
                        <ContextMenuLabel>{w.participantMenuLabel}</ContextMenuLabel>
                        <ContextMenuItem onSelect={() => removeParticipant(p)}>{w.remove}</ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            void navigator.clipboard.writeText(p);
                            toasts.push({ kind: "info", title: copy.common.copied, message: p });
                          }}
                        >
                          {w.copyName}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => toggleCursed(p)}>
                          {cursedNames.has(p.toLocaleLowerCase()) ? w.uncurse : w.markCursed}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() =>
                            toasts.push({
                              kind: "chaos",
                              title: w.accuseTitle,
                              message: w.accuseMessage(p),
                            })
                          }
                        >
                          {w.accuseMenuLabel}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{w.teamsTitle}</CardTitle>
              <CardDescription>{w.teamsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">{w.teamCount}</label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  className={inputClassName()}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">{w.distribution}</label>
                <select
                  value={teamMode}
                  onChange={(e) => setTeamMode(e.target.value as TeamMode)}
                  className={inputClassName()}
                >
                  <option value="balanced">{w.modeBalanced}</option>
                  <option value="equal">{w.modeEqual}</option>
                </select>
                {teamMode === "equal" && !canMakeEqualTeams ? (
                  <div className="text-xs text-warning">
                    {w.equalTeamsWarning(participants.length, teamCount)}
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm font-medium">{w.seedLabel}</label>
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className={inputClassName()}
                  placeholder={w.seedPlaceholder}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {seedUsed ? (
                      <>
                        {w.seedLastUsed} <code>{seedUsed}</code>
                      </>
                    ) : (
                      w.seedEmptyHint
                    )}
                  </span>
                  {seedUsed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(seedUsed);
                        toasts.push({ kind: "info", title: tt.seedCopied, message: seedUsed });
                      }}
                    >
                      {w.copySeed}
                    </Button>
                  ) : null}
                </div>
              </div>

              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <Switch checked={autoSaveSessions} onCheckedChange={setAutoSaveSessions} />
                <span>{w.autoSave}</span>
              </label>

              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button type="button" onClick={() => runSpin({ alsoMakeTeams: true })} disabled={!isReady || spinning}>
                  {w.spinAndTeams}
                </Button>
                <Button type="button" variant="outline" onClick={() => runSpin({ alsoMakeTeams: false })} disabled={!isReady || spinning}>
                  {w.spinOnly}
                </Button>
                <Button type="button" variant="outline" onClick={makeTeamsNow} disabled={participants.length === 0}>
                  {w.makeTeams}
                </Button>
                <Button type="button" variant="outline" onClick={reshuffleTeams} disabled={participants.length === 0}>
                  {w.reshuffle}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{w.groupsTitle}</CardTitle>
              <CardDescription>{w.groupsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {apiError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                  {apiError}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={w.groupNamePlaceholder}
                  className={inputClassName()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={createGroup} disabled={participants.length === 0 || groupsLoading}>
                    {w.saveNew}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={updateGroup}
                    disabled={!selectedGroupId || participants.length === 0 || groupsLoading}
                  >
                    {w.update}
                  </Button>
                  <Button type="button" variant="outline" onClick={refreshGroups} disabled={groupsLoading}>
                    {w.refreshList}
                  </Button>
                </div>
              </div>

              {selectedGroupId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    {w.selectedGroup} <code>{selectedGroupId}</code>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={clearSelectedGroup}>
                    {w.clearSelection}
                  </Button>
                </div>
              ) : null}

              {groupsLoading ? (
                <div className="text-sm text-muted-foreground">{w.loadingGroups}</div>
              ) : groups.length === 0 ? (
                <div className="text-sm text-muted-foreground">{w.noGroups}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadGroup(g)}>
                        <div className="truncate text-sm font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.participants.length} {w.participantsUpdated}{" "}
                          {new Date(g.updatedAt).toLocaleString(toBcp47(locale))}
                        </div>
                      </button>
                      <Button type="button" size="sm" variant="outline" onClick={() => deleteGroup(g.id)}>
                        {w.removeGroup}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{w.wheelTitle}</CardTitle>
              <CardDescription>{w.wheelDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {participants.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                  {w.addParticipantsHint}
                </div>
              ) : (
                <SpinWheel
                  participants={participants}
                  rotationDeg={rotationDeg}
                  spinning={spinning}
                  highlightIndex={highlightIndex}
                  onAnimationComplete={onWheelAnimationComplete}
                />
              )}

              <Separator />

              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">{w.selectedPlayer}</div>
                <div className="text-sm text-muted-foreground">
                  {winnerName ? (
                    <span>
                      <code>{winnerName}</code>
                    </span>
                  ) : highlightIndex !== null && spinning ? (
                    <span>{w.spinning}</span>
                  ) : (
                    <span>{w.noneYet}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{w.teamsResultTitle}</CardTitle>
              <CardDescription>{w.teamsResultDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {teamMode === "equal" && !canMakeEqualTeams ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                  {w.equalTeamsBanner}
                </div>
              ) : null}

              {teams.length === 0 ? (
                <div className="text-sm text-muted-foreground">{w.noTeamsYet}</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {teams.map((team, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 text-sm font-medium">{w.teamLabel(idx)}</div>
                      <div className="flex flex-col gap-1 text-sm">
                        {team.map((p) => (
                          <div key={p} className="flex items-center justify-between gap-2">
                            <span className="truncate">{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{w.sessionsTitle}</CardTitle>
                  <CardDescription>{w.sessionsDesc}</CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={refreshSessions} disabled={sessionsLoading}>
                  {w.refresh}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {sessionsLoading ? (
                <div className="text-sm text-muted-foreground">{w.loadingSessions}</div>
              ) : sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">{w.noSessions}</div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadSession(s)}>
                      <div className="truncate text-sm font-medium">
                        {s.winner ? w.sessionWinner(s.winner) : w.sessionTeamsOnly}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {w.sessionMetaParticipants(
                          s.participants.length,
                          s.teamCount,
                          new Date(s.createdAt).toLocaleString(toBcp47(locale)),
                        )}
                        {s.seed ? (
                          <>
                            {" "}
                            {w.sessionSeedPrefix} <code>{s.seed}</code>
                          </>
                        ) : null}
                      </div>
                    </button>
                    <Button type="button" size="sm" variant="outline" onClick={() => loadSession(s)}>
                      {w.load}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

