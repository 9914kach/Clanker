import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { motion, useReducedMotion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { ChevronDown, ChevronRight, History, MicVocal, Radio, Settings2, SlidersHorizontal, Users } from "lucide-react";
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
import { Switch } from "@clanker/ui/components/switch";
import { Textarea } from "@clanker/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@clanker/ui/components/dialog";
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

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";

const VOICE_MEMBER_PREVIEW = 5;

type VoiceStateMember = {
  user_id: string;
  channel_id: string;
  channel_name: string | null;
  username: string;
  global_name: string | null;
  /** Server nickname when set — matches Discord’s voice list. */
  nick?: string | null;
};

type VoiceStateChannel = {
  channel_id: string;
  channel_name: string | null;
  members: VoiceStateMember[];
};

type VoiceStatesResponse = {
  guild_id: string;
  channels: VoiceStateChannel[];
  total_users: number;
};

function voiceMemberDisplayName(m: VoiceStateMember): string {
  const nick = m.nick?.trim();
  if (nick) return nick;
  const g = m.global_name?.trim();
  if (g) return g;
  const u = m.username?.trim();
  if (u) return u;
  return m.user_id;
}

/** Match participant chip label to a live voice row (nick / global / username, case-insensitive). */
function resolveVoiceStateMember(members: VoiceStateMember[], participantName: string): VoiceStateMember | undefined {
  const needle = participantName.trim();
  if (!needle) return undefined;

  const byExactDisplay = members.find((m) => voiceMemberDisplayName(m) === needle);
  if (byExactDisplay) return byExactDisplay;

  const nl = needle.toLocaleLowerCase();
  const byCiDisplay = members.find((m) => voiceMemberDisplayName(m).toLocaleLowerCase() === nl);
  if (byCiDisplay) return byCiDisplay;

  for (const m of members) {
    const candidates = [m.nick, m.global_name, m.username].filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    );
    for (const c of candidates) {
      if (c.trim() === needle) return m;
    }
  }
  for (const m of members) {
    const candidates = [m.nick, m.global_name, m.username].filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    );
    for (const c of candidates) {
      if (c.trim().toLocaleLowerCase() === nl) return m;
    }
  }
  return undefined;
}

function voiceChannelLabel(ch: VoiceStateChannel, unnamed: string): string {
  const n = ch.channel_name?.trim();
  return n || unnamed;
}

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
  /* Pointer sits at 3 o'clock (90° CW from top); slice centers are (i+0.5)*sliceDeg from top */
  const normalizedTarget = (((90 - (winnerIndex + 0.5) * sliceDeg) % 360) + 360) % 360;
  const currentNorm = (((currentRotation % 360) + 360) % 360) % 360;
  let delta = normalizedTarget - currentNorm;
  if (delta < 0) delta += 360;
  return currentRotation + extraSpins * 360 + delta;
}

const MIN_SLICES_FOR_TEASE = 4;
const TEASE_CHANCE = 0.12;
const WOBBLE_CHANCE = 0.18;
const VICTORY_CHANCE = 0.13;

function pickTeaseDisplayIndex(winnerIndex: number, count: number, rng: () => number): number {
  const maxSpan = Math.max(1, count - 1);
  const span = 1 + Math.floor(rng() * maxSpan);
  return (winnerIndex + span) % count;
}

function SectionToggle(props: {
  open: boolean;
  title: string;
  summary?: string;
  onToggle: () => void;
  icon?: ComponentType<{ className?: string }>;
}) {
  const { open, title, summary, onToggle, icon: Icon } = props;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-left transition hover:border-border hover:bg-card"
      aria-expanded={open}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/60">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {summary ? <div className="truncate text-xs text-muted-foreground">{summary}</div> : null}
        </div>
      </div>
      <Chevron className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
export default function SpinTheWheelPage() {
  const { copy, locale } = useHubLocale();
  const w = copy.spinWheel;
  const tt = w.toasts;
  const { me } = useHubLayout();
  const toasts = useHubToasts();
  const { play } = useHubAudio();
  const reducedMotion = useReducedMotion() ?? false;

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
  const [isTeamSetupOpen, setIsTeamSetupOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSavedGroupsOpen, setIsSavedGroupsOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isRealtimeOpen, setIsRealtimeOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [celebrationWinner, setCelebrationWinner] = useState<string | null>(null);

  const [voiceStates, setVoiceStates] = useState<VoiceStatesResponse | null>(null);
  const [voiceFetchPending, setVoiceFetchPending] = useState(false);
  const [voiceFetchError, setVoiceFetchError] = useState<string | null>(null);
  const voiceFirstFetchDoneRef = useRef(false);
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(false);

  /** Set when a spin starts; read on wheel animation end (avoids stale participants / highlightIndex). */
  const spinResultRef = useRef<{ index: number; names: readonly string[] } | null>(null);

  /** Two-leg “fake stop then roll back” (local spins only). */
  const spinTeaseLegRef = useRef<"idle" | "tease_main" | "wobble_main" | "victory_main" | "resolve">("idle");
  const spinTeasePayloadRef = useRef<{ rFinal: number; rFake?: number; backDeg?: number } | null>(null);
  const [spinResolveKeyframes, setSpinResolveKeyframes] = useState<number[] | null>(null);
  const [spinResolveKeyframeTimes, setSpinResolveKeyframeTimes] = useState<number[] | null>(null);
  const [spinResolveKeyframeDuration, setSpinResolveKeyframeDuration] = useState<number | null>(null);

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
        spinResultRef.current = { index: winnerIndex, names: [...action.participants] };
        setHighlightIndex(winnerIndex);
        setSpinning(true);
        setRotationDeg((prev) =>
          computeRotationForWinner(prev, winnerIndex, action.participants.length),
        );
      } else {
        setSpinning(false);
        setHighlightIndex(winnerIndex >= 0 ? winnerIndex : null);
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
    if (me.status !== "user" || !HUB_GUILD_ID) return;

    let cancelled = false;

    async function fetchVoiceStates() {
      if (!voiceFirstFetchDoneRef.current) setVoiceFetchPending(true);
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(HUB_GUILD_ID)}/voice-states`),
          { credentials: "include" },
        );
        if (!res.ok) {
          const msg = await readApiError(res);
          if (!cancelled) {
            setVoiceFetchError(msg);
            if (!voiceFirstFetchDoneRef.current) setVoiceStates(null);
          }
          return;
        }
        const data = (await res.json()) as VoiceStatesResponse;
        if (!cancelled) {
          setVoiceStates(data);
          setVoiceFetchError(null);
        }
      } catch {
        if (!cancelled) {
          setVoiceFetchError(w.voiceChannelsError);
          if (!voiceFirstFetchDoneRef.current) setVoiceStates(null);
        }
      } finally {
        if (!cancelled && !voiceFirstFetchDoneRef.current) {
          voiceFirstFetchDoneRef.current = true;
          setVoiceFetchPending(false);
        }
      }
    }

    void fetchVoiceStates();
    const timer = window.setInterval(() => void fetchVoiceStates(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [me.status, w.voiceChannelsError]);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ rawParticipants, teamCount, teamMode, seed }),
    );
  }, [rawParticipants, seed, teamCount, teamMode]);

  useEffect(() => {
    if (teams.length > 0) setIsTeamSetupOpen(true);
  }, [teams.length]);

  const isReady = participants.length >= 1;

  const canMakeEqualTeams =
    participants.length > 0 && teamCount >= 1 && participants.length % teamCount === 0;

  const runSpin = useCallback(
    (opts: { alsoMakeTeams: boolean }) => {
      if (!isReady || spinning) return;

      setSpinResolveKeyframes(null);
      setSpinResolveKeyframeTimes(null);
      setSpinResolveKeyframeDuration(null);
      spinTeaseLegRef.current = "idle";
      spinTeasePayloadRef.current = null;

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
      const rFinal = computeRotationForWinner(
        rotationDeg,
        winnerIndex,
        participants.length,
        extraSpins,
      );

      const n = participants.length;
      const tryTease = n >= MIN_SLICES_FOR_TEASE && rng() < TEASE_CHANCE;
      const tryWobble = !tryTease && rng() < WOBBLE_CHANCE;
      const tryVictory = !tryTease && !tryWobble && rng() < VICTORY_CHANCE;
      let firstLegRotation = rFinal;
      if (tryTease) {
        const teaseIdx = pickTeaseDisplayIndex(winnerIndex, n, rng);
        if (teaseIdx !== winnerIndex) {
          const rFake = computeRotationForWinner(rotationDeg, teaseIdx, n, extraSpins);
          const sliceDeg = 360 / n;
          const backSteps = 1 + Math.floor(rng() * 3);
          spinTeaseLegRef.current = "tease_main";
          spinTeasePayloadRef.current = { rFinal, rFake, backDeg: backSteps * sliceDeg };
          firstLegRotation = rFake;
        }
      } else if (tryWobble) {
        spinTeaseLegRef.current = "wobble_main";
        spinTeasePayloadRef.current = { rFinal };
      } else if (tryVictory) {
        spinTeaseLegRef.current = "victory_main";
        spinTeasePayloadRef.current = { rFinal };
      }

      let actionTeams: string[][] = [];
      let actionSeedUsed = seedForAction;
      const winner = participants[winnerIndex] ?? null;

      spinResultRef.current = { index: winnerIndex, names: [...participants] };
      setSpinning(true);
      setRotationDeg(firstLegRotation);

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

  const celebrate = useCallback(() => {
    setSpinResolveKeyframes(null);
    setSpinResolveKeyframeTimes(null);
    setSpinResolveKeyframeDuration(null);
    const snap = spinResultRef.current;
    if (!snap) return;
    const picked = snap.names[snap.index];
    spinResultRef.current = null;
    setSpinning(false);
    if (typeof picked === "string" && picked.trim().length > 0) {
      setCelebrationWinner(picked);
    }
  }, []);

  const onWheelAnimationComplete = useCallback(() => {
    const state = spinTeaseLegRef.current;
    const p = spinTeasePayloadRef.current;

    if (state === "tease_main" && p?.rFake !== undefined && p.backDeg !== undefined) {
      spinTeasePayloadRef.current = null;
      spinTeaseLegRef.current = "resolve";
      play("chaos");
      setSpinResolveKeyframes([p.rFake, p.rFake - p.backDeg, p.rFinal]);
      setSpinResolveKeyframeTimes([0, 0.44, 1]);
      setSpinResolveKeyframeDuration(1.12);
      setRotationDeg(p.rFinal);
      return;
    }

    if (state === "wobble_main" && p) {
      spinTeasePayloadRef.current = null;
      spinTeaseLegRef.current = "resolve";
      play("chaos");
      const w = 28;
      setSpinResolveKeyframes([p.rFinal + w, p.rFinal - w * 0.65, p.rFinal + w * 0.28, p.rFinal - w * 0.10, p.rFinal]);
      setSpinResolveKeyframeTimes([0, 0.22, 0.50, 0.76, 1.0]);
      setSpinResolveKeyframeDuration(1.9);
      return;
    }

    if (state === "victory_main" && p) {
      spinTeasePayloadRef.current = null;
      spinTeaseLegRef.current = "resolve";
      play("confirm");
      setSpinResolveKeyframes([p.rFinal, p.rFinal + 360]);
      setSpinResolveKeyframeTimes([0, 1]);
      setSpinResolveKeyframeDuration(1.5);
      setRotationDeg(p.rFinal + 360);
      return;
    }

    if (state === "resolve") {
      spinTeaseLegRef.current = "idle";
      celebrate();
      return;
    }

    celebrate();
  }, [play, celebrate]);

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

  /** Returns 0 for left team, 1 for right team, null if teams not set or participant not found. */
  const teamIndexFor = useCallback(
    (name: string): number | null => {
      if (teams.length < 2) return null;
      for (let i = 0; i < teams.length; i++) {
        if (teams[i]!.includes(name)) return i;
      }
      return null;
    },
    [teams],
  );

  const moveUserVoice = useCallback(
    async (name: string, direction: "down" | "up") => {
      if (!HUB_GUILD_ID || !voiceStates) return;
      const allMembers = voiceStates.channels.flatMap((ch) => ch.members);
      const member = resolveVoiceStateMember(allMembers, name);
      if (!member) {
        toasts.push({ kind: "error", title: tt.voiceMoveFail, message: tt.voiceMoveNoMember(name) });
        return;
      }
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(HUB_GUILD_ID)}/voice-move`),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, direction }),
          },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          toasts.push({
            kind: "error",
            title: tt.voiceMoveFail,
            message: data.error ?? tt.voiceMoveUnknown,
          });
        }
      } catch {
        toasts.push({ kind: "error", title: tt.voiceMoveFail, message: tt.voiceMoveUnknown });
      }
    },
    [voiceStates, toasts, tt.voiceMoveFail, tt.voiceMoveNoMember, tt.voiceMoveUnknown],
  );

  const dismissCelebration = useCallback(() => setCelebrationWinner(null), []);

  const celebrationRemoveWinner = useCallback(() => {
    if (!celebrationWinner) return;
    const name = celebrationWinner;
    removeParticipant(name);
    setHighlightIndex(null);
    setCelebrationWinner(null);
  }, [celebrationWinner, removeParticipant]);

  useEffect(() => {
    if (!celebrationWinner) return;
    if (reducedMotion) {
      play("confirm");
      return;
    }
    play("chaos");
    const palette = ["#facc15", "#dc2626", "#2563eb", "#16a34a", "#a855f7"];
    const t0 = window.setTimeout(() => {
      void confetti({ particleCount: 115, spread: 84, origin: { y: 0.52 }, ticks: 320, colors: palette });
    }, 40);
    const t1 = window.setTimeout(() => {
      void confetti({
        particleCount: 48,
        angle: 55,
        spread: 52,
        origin: { x: 0.06, y: 0.64 },
        startVelocity: 40,
        colors: palette,
      });
      void confetti({
        particleCount: 48,
        angle: 125,
        spread: 52,
        origin: { x: 0.94, y: 0.64 },
        startVelocity: 40,
        colors: palette,
      });
    }, 280);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [celebrationWinner, play, reducedMotion]);

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

  const activeVoiceChannels = useMemo(() => {
    if (!voiceStates?.channels.length) return [];
    const withPeople = voiceStates.channels.filter((c) => c.members.length > 0);
    return [...withPeople].sort((a, b) => {
      const an = a.channel_name?.trim() || a.channel_id;
      const bn = b.channel_name?.trim() || b.channel_id;
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });
  }, [voiceStates]);

  const applyVoiceChannel = useCallback(
    (ch: VoiceStateChannel, opts?: { silent?: boolean }) => {
      const names = ch.members.map(voiceMemberDisplayName);
      const label = voiceChannelLabel(ch, w.voiceChannelUnnamed);
      setRawParticipants(names.join("\n"));
      clearSelectedGroup();
      setHighlightIndex(null);
      setTeams([]);
      if (!opts?.silent) {
        toasts.push({
          kind: "success",
          title: tt.voiceFillTitle,
          message: tt.voiceFillMessage(label, names.length),
        });
      }
    },
    [clearSelectedGroup, toasts, tt.voiceFillMessage, tt.voiceFillTitle, w.voiceChannelUnnamed],
  );

  useEffect(() => {
    if (me.status !== "user") return;
    if (!HUB_GUILD_ID) return;
    if (normalizeParticipants(rawParticipants).length > 0) return;
    if (activeVoiceChannels.length === 0) return;

    const uid = me.profile.id;
    const inChannel = activeVoiceChannels.find((ch) => ch.members.some((m) => m.user_id === uid));
    const chosen = inChannel ?? activeVoiceChannels[0]!;
    applyVoiceChannel(chosen, { silent: true });
  }, [me, rawParticipants, activeVoiceChannels, applyVoiceChannel]);

  const loadGroup = useCallback((group: ApiWheelGroup) => {
    setSelectedGroupId(group.id);
    setGroupName(group.name);
    setRawParticipants(group.participants.join("\n"));
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
    if (s.winner) {
      const idx = s.participants.indexOf(s.winner);
      setHighlightIndex(idx >= 0 ? idx : null);
    } else {
      setHighlightIndex(null);
    }
    setSpinning(false);
    setIsTeamSetupOpen(s.teams.length > 0);
    setIsAdvancedOpen(Boolean(s.seed));
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

  const pasteParticipants = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setRawParticipants((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
    } catch {
      toasts.push({ kind: "error", title: tt.backendUnreachable, message: "Clipboard read failed." });
    }
  }, [toasts, tt.backendUnreachable]);

  const advancedSummary = seed.trim() ? `${w.seedLabel}: ${seed.trim()}` : w.seedEmptyHint;
  const realtimeSummary = collabEnabled
    ? `${w.presenceCount(collab.presence.length)}`
    : w.collabDesc;

  if (me.status === "loading") return <div className="pt-4 md:pt-6">{w.loading}</div>;
  if (me.status === "guest") return <Navigate to="/login" replace />;
  if (me.status === "backend_error") return <div className="pt-4 md:pt-6">{w.backendError}</div>;

  return (
    <div className="flex min-h-0 flex-col gap-4 pt-2 md:gap-5 md:pt-3">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
        <Card className="order-2 gap-3 border-border/70 bg-card/70 xl:order-1 xl:max-w-[22rem] xl:justify-self-stretch">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{w.participantsTitle}</CardTitle>
                <CardDescription>{w.participantsDesc}</CardDescription>
              </div>
              <Badge variant="outline">{participants.length === 0 ? w.noParticipants : w.participantCount(participants.length)}</Badge>
            </div>
            {selectedGroupId ? (
              <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                {w.selectedGroup} <code>{selectedGroupId}</code>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={rawParticipants}
              onChange={(e) => setRawParticipants(e.target.value)}
              rows={5}
              className={[inputClassName(), "min-h-[9rem] bg-background/40 text-sm xl:min-h-[8rem]"].join(" ")}
              placeholder={w.participantsTextareaPlaceholder}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={pasteParticipants}>
                Paste
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRawParticipants("")}
                disabled={participants.length === 0}
              >
                {w.clear}
              </Button>
              {selectedGroupId ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearSelectedGroup}>
                  {w.clearSelection}
                </Button>
              ) : null}
            </div>

            {HUB_GUILD_ID ? (
              <div className="rounded-xl border border-border/60 bg-background/25 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/50">
                    <MicVocal className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{w.voiceChannelsTitle}</div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                    <Switch
                      checked={autoMoveEnabled}
                      onCheckedChange={setAutoMoveEnabled}
                      aria-label="Auto-flytta högerlag"
                    />
                    <span className={autoMoveEnabled ? "text-foreground" : ""}>Auto-flytta</span>
                  </label>
                </div>
                {voiceFetchPending ? (
                  <p className="text-xs text-muted-foreground">{w.voiceChannelsLoading}</p>
                ) : voiceFetchError && !voiceStates ? (
                  <p className="text-xs text-destructive">{voiceFetchError}</p>
                ) : activeVoiceChannels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{w.voiceChannelsEmpty}</p>
                ) : (
                  <>
                    {voiceFetchError ? (
                      <p className="mb-2 text-xs text-warning">{voiceFetchError}</p>
                    ) : null}
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                      {activeVoiceChannels.map((ch) => {
                        const label = voiceChannelLabel(ch, w.voiceChannelUnnamed);
                        const previewNames = ch.members
                          .slice(0, VOICE_MEMBER_PREVIEW)
                          .map(voiceMemberDisplayName);
                        const rest = ch.members.length - previewNames.length;
                        const previewLine =
                          rest > 0
                            ? `${previewNames.join(", ")} ${w.voiceChannelMore(rest)}`
                            : previewNames.join(", ");
                        return (
                          <li key={ch.channel_id}>
                            <button
                              type="button"
                              onClick={() => applyVoiceChannel(ch)}
                              className={[
                                "w-full rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-left transition",
                                "hover:border-border hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                              ].join(" ")}
                              aria-label={`${w.voiceChannelsTitle}: ${label}, ${ch.members.length}`}
                            >
                              <div className="truncate font-medium text-foreground">{label}</div>
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {previewLine}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{w.voiceChannelsGuildHint}</p>
            )}

            {participants.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => {
                  const teamIdx = teamIndexFor(p);
                  const isLeft = teamIdx === 0;
                  const isRight = teamIdx === 1;
                  return (
                  <ContextMenu key={p}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          removeParticipant(p);
                          // No teams set = no left/right distinction; move everyone (useful for testing).
                          // Teams set = only move right-team members.
                          if (autoMoveEnabled && (teamIdx === null || isRight)) void moveUserVoice(p, "down");
                        }}
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition",
                          "hover:bg-muted active:scale-[0.99]",
                          cursedNames.has(p.toLocaleLowerCase())
                            ? "border-warning/60 bg-warning/10"
                            : "border-border/70 bg-background/50",
                        ].join(" ")}
                        title={w.participantChipTitle}
                      >
                        {teamIdx !== null && (
                          <span
                            className={["size-2 shrink-0 rounded-full", isLeft ? "bg-blue-500" : "bg-red-500"].join(" ")}
                            title={isLeft ? "Vänster" : "Höger"}
                          />
                        )}
                        <span className="max-w-[11rem] truncate">{p}</span>
                        <span className="text-muted-foreground">x</span>
                      </button>
                    </ContextMenuTrigger>

                    <ContextMenuContent>
                      <ContextMenuLabel>
                        {w.participantMenuLabel}
                        {teamIdx !== null && (
                          <span className={["ml-2 text-xs font-normal", isLeft ? "text-blue-500" : "text-red-500"].join(" ")}>
                            {isLeft ? "Vänster" : "Höger"}
                          </span>
                        )}
                      </ContextMenuLabel>
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
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
                {w.addParticipantsHint}
              </div>
            )}
          </CardContent>
        </Card>

        <section className="order-1 min-w-0 self-start xl:order-2">
          <div className="flex w-full min-w-0 flex-col gap-3 rounded-[2rem] p-1 sm:gap-4 sm:p-2">
            <div className="flex justify-center rounded-[1.75rem] px-1 pt-1 pb-0 sm:px-2 sm:pt-2 xl:px-3 xl:pt-3">
              <div className="aspect-square w-full max-w-[min(100%,52rem,calc(100dvh-10.5rem))] shrink-0 sm:max-w-[min(100%,54rem,calc(100dvh-11rem))] xl:max-w-[min(100%,56rem,calc(100dvh-11.5rem))]">
                <SpinWheel
                  participants={participants}
                  emptySliceLabel={w.wheelEmptySliceLabel}
                  rotationDeg={rotationDeg}
                  spinning={spinning}
                  highlightIndex={highlightIndex}
                  resolveKeyframes={spinResolveKeyframes}
                  resolveKeyframeTimes={spinResolveKeyframeTimes}
                  resolveKeyframeDuration={spinResolveKeyframeDuration}
                  onAnimationComplete={onWheelAnimationComplete}
                  onSpinRequest={() => runSpin({ alsoMakeTeams: false })}
                  spinDisabled={!isReady || spinning}
                  spinAriaLabel={w.wheelSpinAria}
                  className="size-full max-w-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsRulesOpen(true)} className="rounded-full px-4">
                <SlidersHorizontal className="size-4" />
                Inställningar
              </Button>
            </div>
          </div>
        </section>
      </div>

      {(teams.length > 0 || (teamMode === "equal" && !canMakeEqualTeams)) ? (
        <Card className="gap-4 border-border/70 bg-card/70">
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{w.teamsResultTitle}</CardTitle>
                <CardDescription>{w.teamsResultDesc}</CardDescription>
              </div>
              {teams.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={reshuffleTeams} disabled={participants.length === 0}>
                  {w.reshuffle}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {teamMode === "equal" && !canMakeEqualTeams ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                {w.equalTeamsBanner}
              </div>
            ) : null}
            {teams.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {teams.map((team, idx) => (
                  <div key={idx} className="rounded-xl border border-border/70 bg-background/40 p-3">
                    <div className="mb-2 text-sm font-medium">{w.teamLabel(idx)}</div>
                    <div className="flex flex-col gap-1 text-sm">
                      {team.map((p) => (
                        <div key={p} className="truncate rounded-md bg-background/40 px-2 py-1">
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={isRulesOpen} onOpenChange={setIsRulesOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inställningar</DialogTitle>
            <DialogDescription>Konfigurera lag, avancerade alternativ, sparade grupper och mer.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
        <div>
          <SectionToggle
            open={isTeamSetupOpen}
            onToggle={() => setIsTeamSetupOpen((prev) => !prev)}
            title={w.teamsTitle}
            summary={w.teamsDesc}
            icon={Users}
          />
          {isTeamSetupOpen ? (
            <Card className="mt-3 gap-4 border-border/70 bg-card/70">
              <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
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
                </div>

                {teamMode === "equal" && !canMakeEqualTeams ? (
                  <div className="md:col-span-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                    {w.equalTeamsWarning(participants.length, teamCount)}
                  </div>
                ) : null}

                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <Button type="button" onClick={makeTeamsNow} disabled={participants.length === 0}>
                    {w.makeTeams}
                  </Button>
                  {teams.length > 0 ? (
                    <Button type="button" variant="outline" onClick={reshuffleTeams} disabled={participants.length === 0}>
                      {w.reshuffle}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div>
          <SectionToggle
            open={isAdvancedOpen}
            onToggle={() => setIsAdvancedOpen((prev) => !prev)}
            title="Advanced"
            summary={advancedSummary}
            icon={Settings2}
          />
          {isAdvancedOpen ? (
            <Card className="mt-3 gap-4 border-border/70 bg-card/70">
              <CardContent className="flex flex-col gap-4 pt-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">{w.seedLabel}</label>
                  <Input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className={inputClassName()}
                    placeholder={w.seedPlaceholder}
                  />
                </div>
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
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={autoSaveSessions} onCheckedChange={setAutoSaveSessions} />
                  <span>{w.autoSave}</span>
                </label>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div>
          <SectionToggle
            open={isSavedGroupsOpen}
            onToggle={() => setIsSavedGroupsOpen((prev) => !prev)}
            title={w.groupsTitle}
            summary={w.groupsDesc}
            icon={Users}
          />
          {isSavedGroupsOpen ? (
            <Card className="mt-3 gap-4 border-border/70 bg-card/70">
              <CardContent className="flex flex-col gap-3 pt-6">
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

                {groupsLoading ? (
                  <div className="text-sm text-muted-foreground">{w.loadingGroups}</div>
                ) : groups.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{w.noGroups}</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {groups.map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadGroup(g)}>
                          <div className="truncate text-sm font-medium">{g.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.participants.length} {w.participantsUpdated}{" "}
                            {new Date(g.updatedAt).toLocaleString(toBcp47(locale))}
                          </div>
                        </button>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => loadGroup(g)}>
                            {w.load}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => deleteGroup(g.id)}>
                            {w.removeGroup}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div>
          <SectionToggle
            open={isSessionsOpen}
            onToggle={() => setIsSessionsOpen((prev) => !prev)}
            title={w.sessionsTitle}
            summary={w.sessionsDesc}
            icon={History}
          />
          {isSessionsOpen ? (
            <Card className="mt-3 gap-4 border-border/70 bg-card/70">
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex justify-end">
                  <Button type="button" size="sm" variant="outline" onClick={refreshSessions} disabled={sessionsLoading}>
                    {w.refresh}
                  </Button>
                </div>
                {sessionsLoading ? (
                  <div className="text-sm text-muted-foreground">{w.loadingSessions}</div>
                ) : sessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{w.noSessions}</div>
                ) : (
                  sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
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
          ) : null}
        </div>

        <div>
          <SectionToggle
            open={isRealtimeOpen}
            onToggle={() => setIsRealtimeOpen((prev) => !prev)}
            title={w.collabTitle}
            summary={realtimeSummary}
            icon={Radio}
          />
          {isRealtimeOpen ? (
            <Card className="mt-3 gap-4 border-border/70 bg-card/70">
              <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-[minmax(0,1fr)_auto]">
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
                <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <Switch checked={collabEnabled} onCheckedChange={setCollabEnabled} />
                    <span>{w.realtimeEnabled}</span>
                  </label>
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
              </CardContent>
            </Card>
          ) : null}
        </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={celebrationWinner !== null}
        onOpenChange={(open) => {
          if (!open) setCelebrationWinner(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-5 border-primary/20 bg-card/95 px-5 pt-7 pb-5 text-center shadow-2xl sm:max-w-md md:max-w-lg"
        >
          <DialogHeader className="gap-0 space-y-0 text-center sm:text-center">
            <DialogTitle className="sr-only">{w.celebrateEyebrow}</DialogTitle>
            <DialogDescription className="sr-only">
              {w.celebrateDesc} {celebrationWinner ?? ""}
            </DialogDescription>
          </DialogHeader>
          {celebrationWinner ? (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/20 via-secondary/15 to-primary/20 px-4 py-7 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] sm:px-6 sm:py-9"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(-12deg, transparent, transparent 12px, color-mix(in oklab, var(--foreground) 35%, transparent) 12px, color-mix(in oklab, var(--foreground) 35%, transparent) 13px)",
                }}
                aria-hidden
              />
              <p className="relative text-[0.68rem] font-semibold uppercase tracking-[0.38em] text-muted-foreground">
                {w.celebrateEyebrow}
              </p>
              <p className="relative mt-3 break-words text-3xl font-black tracking-tight text-foreground sm:text-4xl md:text-5xl">
                {celebrationWinner}
              </p>
            </motion.div>
          ) : null}
          <DialogFooter
            showCloseButton={false}
            className="mt-1 flex-col gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-center"
          >
            <Button type="button" variant="outline" className="w-full sm:w-auto sm:min-w-[8rem]" onClick={dismissCelebration}>
              {w.celebrateClose}
            </Button>
            <Button type="button" className="w-full sm:w-auto sm:min-w-[8rem]" onClick={celebrationRemoveWinner}>
              {w.celebrateRemove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}






