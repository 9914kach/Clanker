import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@clanker/ui/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@clanker/ui/components/context-menu";
import { useHubAudio } from "@/components/HubAudioProvider";
import type { HubTool } from "@/config/hub-tools";

const STORAGE_KEY = "hub.dock.pins.v1";

function loadPins(defaultPins: string[]): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPins;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultPins;
    const pins = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return pins.length > 0 ? pins : defaultPins;
  } catch {
    return defaultPins;
  }
}

export default function HubDock({
  tools,
  meTool,
}: {
  tools: readonly HubTool[];
  meTool: {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
  } | null;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { play } = useHubAudio();

  const defaultPins = useMemo(() => tools.map((t) => t.id), [tools]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPins(defaultPins));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  const pinnedTools = useMemo(() => {
    const byId = new Map(tools.map((t) => [t.id, t] as const));
    const ordered = pinnedIds.map((id) => byId.get(id)).filter((t): t is HubTool => Boolean(t));
    const seen = new Set(ordered.map((t) => t.id));
    for (const t of tools) {
      if (seen.has(t.id)) continue;
      ordered.push(t);
    }
    return ordered;
  }, [pinnedIds, tools]);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const togglePin = useCallback(
    (id: string) => {
      setPinnedIds((prev) => {
        if (prev.includes(id)) {
          const next = prev.filter((x) => x !== id);
          return next.length > 0 ? next : prev;
        }
        return [id, ...prev];
      });
    },
    [setPinnedIds],
  );

  const isActive = useCallback(
    (path: string) => (path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(path)),
    [pathname],
  );

  const go = useCallback(
    (path: string) => {
      play("dock");
      navigate(path);
    },
    [navigate, play],
  );

  const shellClassName =
    "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4";

  return (
    <div className={shellClassName}>
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/70 bg-background/70 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55",
          "ring-1 ring-foreground/5",
        )}
      >
        {pinnedTools.map((tool) => {
          const Icon = tool.icon;
          const active = isActive(tool.path);
          return (
            <ContextMenu key={tool.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => go(tool.path)}
                  className={cn(
                    "group relative flex size-11 items-center justify-center rounded-xl transition",
                    "hover:bg-muted/70 hover:shadow-sm active:scale-[0.98]",
                    active ? "bg-muted/80" : "bg-transparent",
                  )}
                  title={tool.description}
                >
                  <Icon
                    className={cn(
                      "size-5 transition",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full",
                      active
                        ? "bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                        : "bg-transparent",
                    )}
                  />
                </button>
              </ContextMenuTrigger>

              <ContextMenuContent>
                <ContextMenuLabel>{tool.label}</ContextMenuLabel>
                <ContextMenuItem onSelect={() => go(tool.path)}>Open</ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    void navigator.clipboard.writeText(tool.path);
                  }}
                >
                  Copy path
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => {
                    play("panel");
                    togglePin(tool.id);
                  }}
                >
                  {isPinned(tool.id) ? "Unpin" : "Pin"}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {meTool ? (
          <div className="ml-1 flex items-center gap-1 border-l border-border/60 pl-1">
            {(() => {
              const Icon = meTool.icon;
              const active = isActive(meTool.path);
              return (
                <button
                  type="button"
                  onClick={() => go(meTool.path)}
                  className={cn(
                    "group relative flex size-11 items-center justify-center rounded-xl transition",
                    "hover:bg-muted/70 hover:shadow-sm active:scale-[0.98]",
                    active ? "bg-muted/80" : "bg-transparent",
                  )}
                  title={meTool.description}
                >
                  <Icon
                    className={cn(
                      "size-5 transition",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                </button>
              );
            })()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
