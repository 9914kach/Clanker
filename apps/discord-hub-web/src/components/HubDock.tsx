import type { ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  LayoutTemplate,
  Magnet,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@clanker/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@clanker/ui/components/tooltip";
import { cn } from "@clanker/ui/lib/utils";
import { useHubAudio } from "@/components/HubAudioProvider";
import HubShellObject from "@/components/HubShellObject";
import type { HubTool } from "@/config/hub-tools";
import type { HubDesktopShellState } from "@/hooks/use-hub-layout";
import type { HubCopy } from "@/i18n/hub-copy";
import { hubContextData } from "@/lib/hub-shell-context";

export default function HubDock({
  tools,
  pinnedIds,
  meTool,
  layoutEditMode,
  dockShellLabel,
  isDashboardRoute,
  desktopShell,
  gridSnapEnabled,
  onToggleGridSnap,
  onExitLayoutEdit,
  onSaveLayout,
  copy,
  onDesktopOnlyAction,
}: {
  tools: readonly HubTool[];
  pinnedIds: readonly string[];
  meTool: {
    label: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    path: string;
  } | null;
  layoutEditMode: boolean;
  dockShellLabel: string;
  isDashboardRoute: boolean;
  desktopShell: HubDesktopShellState | null;
  gridSnapEnabled: boolean;
  onToggleGridSnap: () => void;
  onExitLayoutEdit: () => void;
  onSaveLayout: () => void;
  copy: HubCopy;
  onDesktopOnlyAction?: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { play } = useHubAudio();
  const em = copy.editMode;
  const isActive = (path: string) => (path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(path));
  const go = (path: string) => {
    play("dock");
    navigate(path);
  };

  const shellClassName =
    "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4";

  const hiddenCount = desktopShell?.hiddenWidgetIds.length ?? 0;

  const desktopGate = (fn: () => void) => {
    if (!isDashboardRoute) {
      play("panel");
      onDesktopOnlyAction?.();
      return;
    }
    if (!desktopShell) {
      play("panel");
      return;
    }
    fn();
  };

  if (layoutEditMode) {
    return (
      <div
        className={shellClassName}
        role="toolbar"
        aria-label={em.toolbarAria}
        {...hubContextData({ type: "shell.nav", area: "dock" })}
      >
        <HubShellObject
          as="div"
          objectId="shell.dock.editToolbar"
          objectKind="dockBar"
          label={dockShellLabel}
          layoutEditMode={layoutEditMode}
          className={cn(
            "pointer-events-auto flex max-w-[min(100%,42rem)] flex-wrap items-center justify-center gap-1 rounded-2xl border border-primary/35 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70",
            "ring-2 ring-primary/25",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-xl"
                onClick={() => {
                  desktopGate(() => desktopShell!.openAddModuleFlow());
                }}
                {...hubContextData({
                  type: "shell.object",
                  kind: "dockBar",
                  objectId: "shell.dock.edit.add",
                  label: em.addModule,
                })}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">{em.addModule}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.addModuleDetail}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl">
                    <LayoutTemplate className="size-4" />
                    <span className="hidden sm:inline">{em.layoutOptions}</span>
                    <MoreHorizontal className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{em.layoutOptions}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="center" className="min-w-[14rem]">
              <DropdownMenuItem
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => desktopShell!.resetLayout());
                }}
              >
                {em.layoutReset}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isDashboardRoute || !desktopShell || hiddenCount === 0}
                onClick={() => {
                  desktopGate(() => desktopShell!.revealAllHiddenWidgets());
                }}
              >
                {em.layoutRestoreAll}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={gridSnapEnabled ? "secondary" : "outline"}
                size="icon-sm"
                className="rounded-xl"
                onClick={() => {
                  onToggleGridSnap();
                }}
                aria-pressed={gridSnapEnabled}
              >
                <Magnet className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{gridSnapEnabled ? em.gridSnapDisable : em.gridSnapEnable}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => desktopShell!.resetLayout());
                }}
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.layoutReset}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => onSaveLayout());
                }}
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.saveLayoutDetail}</TooltipContent>
          </Tooltip>

          <div className="mx-1 hidden h-8 w-px bg-border/70 sm:block" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onExitLayoutEdit}>
                <X className="size-4" />
                <span className="hidden sm:inline">{em.cancel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.cancelDetail}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="default" size="sm" className="rounded-xl" onClick={onExitLayoutEdit}>
                <Check className="size-4" />
                <span className="hidden sm:inline">{em.done}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.doneDetail}</TooltipContent>
          </Tooltip>
        </HubShellObject>
      </div>
    );
  }

  return (
    <div className={shellClassName} {...hubContextData({ type: "shell.nav", area: "dock" })}>
      <HubShellObject
        as="div"
        objectId="shell.dock.pill"
        objectKind="dockBar"
        label={dockShellLabel}
        layoutEditMode={layoutEditMode}
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
      </HubShellObject>
    </div>
  );
}
