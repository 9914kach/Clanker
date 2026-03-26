import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { HubProfile } from "@/hooks/use-hub-layout";
import {
  normalizeWheelCollabRoom,
  wheelCollabServerUrl,
  type WheelCollabAction,
  type WheelCollabDraft,
  type WheelCollabPresence,
} from "@/lib/hub-collab";
import type { TeamMode } from "@/lib/spin-the-wheel";

type CollabStatus = "idle" | "connecting" | "connected" | "disconnected";

function isDraft(value: unknown): value is WheelCollabDraft {
  if (!value || typeof value !== "object") {
    return false;
  }
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.rawParticipants === "string" &&
    typeof draft.teamCount === "number" &&
    (draft.teamMode === "balanced" || draft.teamMode === "equal") &&
    typeof draft.seed === "string"
  );
}

function isTeams(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((team) => Array.isArray(team) && team.every((name) => typeof name === "string"));
}

function isAction(value: unknown): value is WheelCollabAction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const action = value as Record<string, unknown>;
  return (
    typeof action.id === "string" &&
    (action.kind === "spin" || action.kind === "teams") &&
    Array.isArray(action.participants) &&
    action.participants.every((name) => typeof name === "string") &&
    (action.winner === null || typeof action.winner === "string") &&
    isTeams(action.teams) &&
    (action.seedUsed === null || typeof action.seedUsed === "string") &&
    typeof action.triggeredById === "string" &&
    typeof action.triggeredByName === "string" &&
    typeof action.createdAt === "string"
  );
}

export function useWheelCollab(params: {
  enabled: boolean;
  roomInput: string;
  me: HubProfile | null;
  draft: WheelCollabDraft;
  onRemoteDraft: (draft: WheelCollabDraft) => void;
  onRemoteAction: (action: WheelCollabAction) => void;
}) {
  const {
    enabled,
    roomInput,
    me,
    draft,
    onRemoteDraft,
    onRemoteAction,
  } = params;
  const [status, setStatus] = useState<CollabStatus>("idle");
  const [synced, setSynced] = useState(false);
  const [presence, setPresence] = useState<WheelCollabPresence[]>([]);
  const applyingRemoteRef = useRef(false);
  const lastActionIdRef = useRef<string | null>(null);
  const stateMapRef = useRef<Y.Map<unknown> | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const draftRef = useRef(draft);
  const room = normalizeWheelCollabRoom(roomInput);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!enabled || !me || room.length === 0) {
      setStatus("idle");
      setSynced(false);
      setPresence([]);
      providerRef.current?.destroy();
      providerRef.current = null;
      stateMapRef.current = null;
      return;
    }

    const doc = new Y.Doc();
    const state = doc.getMap<unknown>("wheel");
    const provider = new WebsocketProvider(wheelCollabServerUrl(), room, doc);
    stateMapRef.current = state;
    providerRef.current = provider;
    setStatus("connecting");

    const syncPresence = () => {
      const peers: WheelCollabPresence[] = [];
      for (const [clientId, value] of provider.awareness.getStates()) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const user = (value as Record<string, unknown>).user;
        if (!user || typeof user !== "object") {
          continue;
        }
        const record = user as Record<string, unknown>;
        if (typeof record.userId !== "string" || typeof record.name !== "string") {
          continue;
        }
        peers.push({
          clientId,
          userId: record.userId,
          name: record.name,
        });
      }
      peers.sort((left, right) => left.name.localeCompare(right.name));
      setPresence(peers);
    };

    const applyDocState = () => {
      const remoteDraft = state.get("draft");
      if (isDraft(remoteDraft)) {
        applyingRemoteRef.current = true;
        onRemoteDraft(remoteDraft);
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }

      const remoteAction = state.get("lastAction");
      if (isAction(remoteAction) && remoteAction.id !== lastActionIdRef.current) {
        lastActionIdRef.current = remoteAction.id;
        onRemoteAction(remoteAction);
      }
    };

    provider.on("status", (event) => {
      setStatus(event.status);
    });
    provider.on("sync", (value) => {
      setSynced(value);
    });

    provider.awareness.on("change", syncPresence);
    provider.awareness.setLocalStateField("user", {
      userId: me.id,
      name: me.global_name ?? me.username,
    });

    state.observe(applyDocState);
    if (!state.has("draft")) {
      state.set("draft", draftRef.current);
    } else {
      applyDocState();
    }
    syncPresence();

    return () => {
      state.unobserve(applyDocState);
      provider.awareness.off("change", syncPresence);
      provider.destroy();
      doc.destroy();
      setPresence([]);
      setSynced(false);
      setStatus("disconnected");
    };
  }, [enabled, me, onRemoteAction, onRemoteDraft, room]);

  useEffect(() => {
    if (!stateMapRef.current || applyingRemoteRef.current) {
      return;
    }
    stateMapRef.current.set("draft", draft);
  }, [draft]);

  const publishAction = (action: WheelCollabAction) => {
    if (!stateMapRef.current) {
      return;
    }
    lastActionIdRef.current = action.id;
    stateMapRef.current.set("lastAction", action);
  };

  const updateDraft = (draft: WheelCollabDraft) => {
    if (!stateMapRef.current || applyingRemoteRef.current) {
      return;
    }
    stateMapRef.current.set("draft", draft);
  };

  return {
    room,
    status,
    synced,
    presence,
    connected: status === "connected",
    publishAction,
    updateDraft,
  };
}

export function buildWheelCollabDraft(input: {
  rawParticipants: string;
  teamCount: number;
  teamMode: TeamMode;
  seed: string;
}): WheelCollabDraft {
  return {
    rawParticipants: input.rawParticipants,
    teamCount: input.teamCount,
    teamMode: input.teamMode,
    seed: input.seed,
  };
}
