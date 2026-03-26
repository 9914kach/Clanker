import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@clanker/ui/lib/utils";
import { useHubAudio } from "@/components/HubAudioProvider";
import type { HubTool } from "@/config/hub-tools";
import { hubContextData } from "@/lib/hub-shell-context";

export default function HubDock({
  tools,
  pinnedIds,
  meTool,
}: {
  tools: readonly HubTool[];
  pinnedIds: readonly string[];
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
  const isActive = (path: string) => (path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(path));
  const go = (path: string) => {
    play("dock");
    navigate(path);
  };

  const shellClassName =
    "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4";

  return (
    <div className={shellClassName} {...hubContextData({ type: "shell.nav", area: "dock" })}>
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/70 bg-background/70 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55",
          "ring-1 ring-foreground/5",
        )}
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          const active = isActive(tool.path);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => go(tool.path)}
              className={cn(
                "group relative flex size-11 items-center justify-center rounded-xl transition",
                "hover:bg-muted/70 hover:shadow-sm active:scale-[0.98]",
                active ? "bg-muted/80" : "bg-transparent",
              )}
              title={tool.description}
              {...hubContextData({
                type: "tool",
                toolId: tool.id,
                label: tool.label,
                path: tool.path,
                pinned: pinnedIds.includes(tool.id),
              })}
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
                  {...hubContextData({
                    type: "profile",
                    profileId: null,
                    profilePath: meTool.path,
                    label: meTool.label,
                    isOwnProfile: true,
                  })}
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
