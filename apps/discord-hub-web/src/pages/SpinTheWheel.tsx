import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
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
import { Separator } from "@clanker/ui/components/separator";
import SpinWheel from "@/components/SpinWheel";
import { useHubToasts } from "@/components/HubToastProvider";
import { apiUrl } from "@/config";
import { useHubLayout } from "@/hooks/use-hub-layout";
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

export default function SpinTheWheelPage() {
  const { me } = useHubLayout();
  const toasts = useHubToasts();

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
        toasts.push({ kind: "error", title: "Couldn’t load groups", message: msg });
        return;
      }
      const data = (await res.json()) as { groups: ApiWheelGroup[] };
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      setApiError("Kunde inte nå backend.");
      toasts.push({ kind: "error", title: "Backend unreachable", message: "The hub API didn’t answer." });
    } finally {
      setGroupsLoading(false);
    }
  }, [toasts]);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/wheel/sessions/recent?limit=12"), {
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setApiError(msg);
        toasts.push({ kind: "error", title: "Couldn’t load sessions", message: msg });
        return;
      }
      const data = (await res.json()) as { sessions: ApiWheelSession[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setApiError("Kunde inte nå backend.");
      toasts.push({ kind: "error", title: "Backend unreachable", message: "The hub API didn’t answer." });
    } finally {
      setSessionsLoading(false);
    }
  }, [toasts]);

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
      setSeedUsed(seedForAction);
      const nextSpinSalt = spinSalt + 1;
      setSpinSalt(nextSpinSalt);
      const rng = makeRng([seedForAction, `spin:${nextSpinSalt}`].join(":"));
      const winnerIndex = pickIndex(participants.length, rng);
      setHighlightIndex(winnerIndex);

      const sliceDeg = 360 / participants.length;
      const normalizedTarget = (((-(winnerIndex + 0.5) * sliceDeg) % 360) + 360) % 360;
      const currentNorm = (((rotationDeg % 360) + 360) % 360) % 360;
      let delta = normalizedTarget - currentNorm;
      if (delta < 0) delta += 360;
      const extraSpins = 6 + Math.floor(rng() * 4);
      const finalRotation = rotationDeg + extraSpins * 360 + delta;

      setWinnerName(null);
      setSpinning(true);
      setRotationDeg(finalRotation);

      if (opts.alsoMakeTeams) {
        const { seedUsed: used, teams: nextTeams } = buildTeams({
          participants,
          teamCount,
          mode: teamMode,
          seed: seedForAction,
          salt: `teams:${shuffleSalt}`,
        });
        setSeedUsed(used);
        setTeams(nextTeams);
        if (autoSaveSessions && nextTeams.length > 0) {
          const winner = participants[winnerIndex] ?? null;
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
                toasts.push({ kind: "error", title: "Couldn’t save session", message: msg });
                return;
              }
              toasts.push({ kind: "success", title: "Session saved", message: winner ? `Winner: ${winner}` : "Teams recorded." });
              void refreshSessions();
            } catch {
              setApiError("Kunde inte nå backend.");
              toasts.push({ kind: "error", title: "Couldn’t save session", message: "Backend unreachable." });
            }
          })();
        }
      }
    },
    [autoSaveSessions, isReady, participants, refreshSessions, rotationDeg, seed, selectedGroupId, shuffleSalt, spinSalt, spinning, teamCount, teamMode, toasts],
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
    const { seedUsed: used, teams: nextTeams } = buildTeams({
      participants,
      teamCount,
      mode: teamMode,
      seed: seedForAction,
      salt: `teams:${nextSalt}`,
    });
    setSeedUsed(used);
    setTeams(nextTeams);
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
            toasts.push({ kind: "error", title: "Couldn’t save session", message: msg });
            return;
          }
          toasts.push({ kind: "success", title: "Session saved", message: "Teams recorded." });
          void refreshSessions();
        } catch {
          setApiError("Kunde inte nå backend.");
          toasts.push({ kind: "error", title: "Couldn’t save session", message: "Backend unreachable." });
        }
      })();
    }
  }, [autoSaveSessions, participants, refreshSessions, seed, selectedGroupId, shuffleSalt, teamCount, teamMode, toasts]);

  const makeTeamsNow = useCallback(() => {
    if (participants.length === 0) return;
    const seedForAction = seed.trim() ? seed.trim() : makeSeed();
    setSeedUsed(seedForAction);
    const { seedUsed: used, teams: nextTeams } = buildTeams({
      participants,
      teamCount,
      mode: teamMode,
      seed: seedForAction,
      salt: `teams:${shuffleSalt}`,
    });
    setSeedUsed(used);
    setTeams(nextTeams);
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
            toasts.push({ kind: "error", title: "Couldn’t save session", message: msg });
            return;
          }
          toasts.push({ kind: "success", title: "Session saved", message: "Teams recorded." });
          void refreshSessions();
        } catch {
          setApiError("Kunde inte nå backend.");
          toasts.push({ kind: "error", title: "Couldn’t save session", message: "Backend unreachable." });
        }
      })();
    }
  }, [autoSaveSessions, participants, refreshSessions, seed, selectedGroupId, shuffleSalt, teamCount, teamMode, toasts]);

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
          toasts.push({ kind: "info", title: "Curse lifted", message: name });
        } else {
          next.add(key);
          toasts.push({ kind: "chaos", title: "Marked as cursed", message: name });
        }
        return next;
      });
    },
    [toasts],
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
    const name = groupName.trim() || "Ny grupp";
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
        toasts.push({ kind: "error", title: "Couldn’t save group", message: msg });
        return;
      }
      clearSelectedGroup();
      await refreshGroups();
      toasts.push({ kind: "success", title: "Group saved", message: name });
    } catch {
      setApiError("Kunde inte nå backend.");
      toasts.push({ kind: "error", title: "Couldn’t save group", message: "Backend unreachable." });
    }
  }, [clearSelectedGroup, groupName, participants, refreshGroups, toasts]);

  const updateGroup = useCallback(async () => {
    if (!selectedGroupId) return;
    const name = groupName.trim() || "Ny grupp";
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
        toasts.push({ kind: "error", title: "Couldn’t update group", message: msg });
        return;
      }
      await refreshGroups();
      toasts.push({ kind: "success", title: "Group updated", message: name });
    } catch {
      setApiError("Kunde inte nå backend.");
      toasts.push({ kind: "error", title: "Couldn’t update group", message: "Backend unreachable." });
    }
  }, [groupName, participants, refreshGroups, selectedGroupId, toasts]);

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
        toasts.push({ kind: "error", title: "Couldn’t delete group", message: msg });
        return;
      }
      if (selectedGroupId === id) clearSelectedGroup();
      await refreshGroups();
      toasts.push({ kind: "chaos", title: "Group deleted", message: "Gone. Reduced to atoms." });
    } catch {
      setApiError("Kunde inte nå backend.");
      toasts.push({ kind: "error", title: "Couldn’t delete group", message: "Backend unreachable." });
    }
  }, [clearSelectedGroup, refreshGroups, selectedGroupId, toasts]);

  if (me.status === "loading") return <div>Laddar…</div>;
  if (me.status === "guest") return <Navigate to="/login" replace />;
  if (me.status === "backend_error") return <div>Backendproblem. Försök igen senare.</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Spin the Wheel</h1>
        <p className="text-sm text-muted-foreground">
          Snurra fram en spelare och skapa lag med (valfri) seed för repeatable resultat.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Deltagare</CardTitle>
              <CardDescription>En rad per namn. Komma funkar också.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <textarea
                value={rawParticipants}
                onChange={(e) => setRawParticipants(e.target.value)}
                rows={7}
                className={inputClassName()}
                placeholder={"Alice\nBob\nCharlie"}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {participants.length === 0
                    ? "Inga deltagare än"
                    : `${participants.length} deltagare`}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRawParticipants("")}
                  disabled={participants.length === 0}
                >
                  Rensa
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
                          title="Click to remove. Right-click for more crimes."
                        >
                          <span className="max-w-[16rem] truncate">{p}</span>
                          <span className="text-muted-foreground">×</span>
                        </button>
                      </ContextMenuTrigger>

                      <ContextMenuContent>
                        <ContextMenuLabel>Participant</ContextMenuLabel>
                        <ContextMenuItem onSelect={() => removeParticipant(p)}>
                          Remove
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            void navigator.clipboard.writeText(p);
                            toasts.push({ kind: "info", title: "Copied", message: p });
                          }}
                        >
                          Copy name
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => toggleCursed(p)}>
                          {cursedNames.has(p.toLocaleLowerCase()) ? "Uncurse" : "Mark as cursed"}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() =>
                            toasts.push({
                              kind: "chaos",
                              title: "Accusation filed",
                              message: `${p} is now under investigation.`,
                            })
                          }
                        >
                          Accuse (ceremonial)
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
              <CardTitle>Lag & seed</CardTitle>
              <CardDescription>Styr hur lagen skapas (och om det ska vara deterministiskt).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Antal lag</label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  className={inputClassName()}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Fördelning</label>
                <select
                  value={teamMode}
                  onChange={(e) => setTeamMode(e.target.value as TeamMode)}
                  className={inputClassName()}
                >
                  <option value="balanced">Balanserade lag (rekommenderas)</option>
                  <option value="equal">Exakt jämna lag</option>
                </select>
                {teamMode === "equal" && !canMakeEqualTeams ? (
                  <div className="text-xs text-warning">
                    Kan inte skapa exakt jämna lag: {participants.length} deltagare är inte delbart med {teamCount}.
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm font-medium">Seed (valfritt)</label>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className={inputClassName()}
                  placeholder="t.ex. scrim-2026-03-25"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {seedUsed ? (
                      <>
                        Senast använd seed: <code>{seedUsed}</code>
                      </>
                    ) : (
                      "Lämna tomt för slumpmässigt seed."
                    )}
                  </span>
                  {seedUsed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(seedUsed);
                        toasts.push({ kind: "info", title: "Seed copied", message: seedUsed });
                      }}
                    >
                      Kopiera
                    </Button>
                  ) : null}
                </div>
              </div>

              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoSaveSessions}
                  onChange={(e) => setAutoSaveSessions(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span>Auto-spara sessioner</span>
              </label>

              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button type="button" onClick={() => runSpin({ alsoMakeTeams: true })} disabled={!isReady || spinning}>
                  Snurra & skapa lag
                </Button>
                <Button type="button" variant="outline" onClick={() => runSpin({ alsoMakeTeams: false })} disabled={!isReady || spinning}>
                  Snurra
                </Button>
                <Button type="button" variant="outline" onClick={makeTeamsNow} disabled={participants.length === 0}>
                  Skapa lag
                </Button>
                <Button type="button" variant="outline" onClick={reshuffleTeams} disabled={participants.length === 0}>
                  Blanda om lag
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sparade grupper</CardTitle>
              <CardDescription>Spara deltagarlistor som du återanvänder.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {apiError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                  {apiError}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Gruppnamn"
                  className={inputClassName()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={createGroup} disabled={participants.length === 0 || groupsLoading}>
                    Spara ny
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={updateGroup}
                    disabled={!selectedGroupId || participants.length === 0 || groupsLoading}
                  >
                    Uppdatera
                  </Button>
                  <Button type="button" variant="outline" onClick={refreshGroups} disabled={groupsLoading}>
                    Uppdatera lista
                  </Button>
                </div>
              </div>

              {selectedGroupId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    Vald grupp: <code>{selectedGroupId}</code>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={clearSelectedGroup}>
                    Avmarkera
                  </Button>
                </div>
              ) : null}

              {groupsLoading ? (
                <div className="text-sm text-muted-foreground">Laddar grupper…</div>
              ) : groups.length === 0 ? (
                <div className="text-sm text-muted-foreground">Inga sparade grupper än.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadGroup(g)}>
                        <div className="truncate text-sm font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.participants.length} deltagare · uppdaterad{" "}
                          {new Date(g.updatedAt).toLocaleString()}
                        </div>
                      </button>
                      <Button type="button" size="sm" variant="outline" onClick={() => deleteGroup(g.id)}>
                        Ta bort
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
              <CardTitle>Hjulet</CardTitle>
              <CardDescription>Snurrar slumpmässigt fram en spelare.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {participants.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                  Lägg till deltagare för att se hjulet.
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
                <div className="text-sm font-medium">Vald spelare</div>
                <div className="text-sm text-muted-foreground">
                  {winnerName ? (
                    <span>
                      <code>{winnerName}</code>
                    </span>
                  ) : highlightIndex !== null && spinning ? (
                    <span>Snurrar…</span>
                  ) : (
                    <span>Ingen än.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lag</CardTitle>
              <CardDescription>Resultatet från senaste lagbygget.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {teamMode === "equal" && !canMakeEqualTeams ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                  Exakt jämna lag kräver att deltagarantalet är delbart med antal lag.
                </div>
              ) : null}

              {teams.length === 0 ? (
                <div className="text-sm text-muted-foreground">Inga lag ännu. Klicka på “Skapa lag”.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {teams.map((team, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 text-sm font-medium">Lag {idx + 1}</div>
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
                  <CardTitle>Senaste sessioner</CardTitle>
                  <CardDescription>Team/winner-historik sparad i backend.</CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={refreshSessions} disabled={sessionsLoading}>
                  Uppdatera
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {sessionsLoading ? (
                <div className="text-sm text-muted-foreground">Laddar sessioner…</div>
              ) : sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">Inga sessioner ännu.</div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadSession(s)}>
                      <div className="truncate text-sm font-medium">
                        {s.winner ? `Winner: ${s.winner}` : "Lag skapade"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.participants.length} deltagare · {s.teamCount} lag · {new Date(s.createdAt).toLocaleString()}
                        {s.seed ? (
                          <>
                            {" "}· seed <code>{s.seed}</code>
                          </>
                        ) : null}
                      </div>
                    </button>
                    <Button type="button" size="sm" variant="outline" onClick={() => loadSession(s)}>
                      Ladda
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

