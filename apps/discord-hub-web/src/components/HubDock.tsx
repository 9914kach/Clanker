import type { ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  Cloud,
  Keyboard,
  LayoutTemplate,
  Magnet,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import { Badge } from "@clanker/ui/components/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  onCancelLayoutEdit,
  onDoneLayoutEdit,
  onSaveLayoutCommitted,
  onDiscardLayoutDraft,
  onUndoLayout,
  onRedoLayout,
  onToggleAutosaveLayout,
  copy,
  onDesktopOnlyAction,
  dockPosition = "bottom",
  dockScale = "md",
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
  onCancelLayoutEdit: () => void;
  onDoneLayoutEdit: () => void;
  onSaveLayoutCommitted: () => void;
  onDiscardLayoutDraft: () => void;
  onUndoLayout: () => void;
  onRedoLayout: () => void;
  onToggleAutosaveLayout: () => void;
  copy: HubCopy;
  onDesktopOnlyAction?: () => void;
  dockPosition?: "bottom" | "left";
  dockScale?: "sm" | "md" | "lg";
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

  const iconSize = dockScale === "sm" ? "size-4" : dockScale === "lg" ? "size-6" : "size-5";
  const buttonSize = dockScale === "sm" ? "size-9" : dockScale === "lg" ? "size-13" : "size-11";

  const shellClassName =
    dockPosition === "left"
      ? "pointer-events-none fixed inset-y-0 left-3 z-40 flex flex-col items-center justify-center py-4"
      : "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4";

  /** Layout-edit toolbar: bottom bar anchored to start (taskbar-style), not horizontally centered. */
  const shellClassNameLayoutEdit =
    dockPosition === "left"
      ? "pointer-events-none fixed inset-y-0 left-3 z-40 flex flex-col items-center justify-center py-4"
      : "pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-start ps-4 pe-4 md:ps-6";

  const hiddenCount = desktopShell?.hiddenWidgetIds.length ?? 0;
  const isDirty = desktopShell?.isLayoutDirty ?? false;
  const canUndo = desktopShell?.canUndoLayout ?? false;
  const canRedo = desktopShell?.canRedoLayout ?? false;
  const autosaveOn = desktopShell?.autosaveLayoutEnabled ?? false;

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
        className={shellClassNameLayoutEdit}
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
          layoutEditChrome="none"
          className={cn(
            "pointer-events-auto flex max-w-[min(100%,56rem)] flex-wrap items-center justify-center gap-1 rounded-2xl border border-primary/35 bg-background/90 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75",
            "ring-2 ring-primary/30",
          )}
        >
          {isDirty && !autosaveOn ? (
            <Badge variant="secondary" className="hidden shrink-0 rounded-lg sm:inline-flex">
              {em.unsavedBadge}
            </Badge>
          ) : null}

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
                disabled={!isDashboardRoute || !desktopShell || !canUndo}
                onClick={() => {
                  desktopGate(() => onUndoLayout());
                }}
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.undoLayout}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell || !canRedo}
                onClick={() => {
                  desktopGate(() => onRedoLayout());
                }}
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.redoLayout}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => onDiscardLayoutDraft());
                }}
              >
                <span className="hidden sm:inline">{em.discardLayout}</span>
                <Undo2 className="size-4 sm:hidden" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.discardLayoutDetail}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="icon-sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => onSaveLayoutCommitted());
                }}
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.saveLayoutDetail}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={autosaveOn ? "secondary" : "outline"}
                size="icon-sm"
                className="rounded-xl"
                disabled={!isDashboardRoute || !desktopShell}
                onClick={() => {
                  desktopGate(() => onToggleAutosaveLayout());
                }}
                aria-pressed={autosaveOn}
              >
                <Cloud className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autosaveOn ? em.autosaveDisable : em.autosaveEnable}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" className="rounded-xl" aria-label={em.shortcutsHelp}>
                    <Keyboard className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{em.shortcutsHelp}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="center" className="max-w-xs">
              <DropdownMenuLabel>{em.shortcutsHelpTitle}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {em.shortcutsLines.map((line) => (
                <DropdownMenuItem key={line} className="cursor-default text-xs focus:bg-transparent" onSelect={(e) => e.preventDefault()}>
                  {line}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 hidden h-8 w-px bg-border/70 sm:block" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onCancelLayoutEdit}>
                <X className="size-4" />
                <span className="hidden sm:inline">{em.cancel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.cancelDiscardExitDetail}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="default" size="sm" className="rounded-xl" onClick={onDoneLayoutEdit}>
                <Check className="size-4" />
                <span className="hidden sm:inline">{em.done}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{em.doneSaveExitDetail}</TooltipContent>
          </Tooltip>
        </HubShellObject>
      </div>
    );
  }

  const pillOrientation = dockPosition === "left" ? "flex-col" : "flex-row";
  const pillSeparatorClass = dockPosition === "left" ? "w-full h-px mt-1 border-t border-border/60 pt-1" : "ml-1 flex items-center gap-1 border-l border-border/60 pl-1";
  const indicatorClass =
    dockPosition === "left"
      ? "absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
      : "absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full";

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
          pillOrientation,
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
                "group relative flex items-center justify-center rounded-xl transition",
                "hover:bg-muted/70 hover:shadow-sm active:scale-[0.98]",
                buttonSize,
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
                  "transition",
                  iconSize,
                  active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span
                className={cn(
                  indicatorClass,
                  active
                    ? "bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                    : "bg-transparent",
                )}
              />
            </button>
          );
        })}

        {meTool ? (
          <div className={pillSeparatorClass}>
            {(() => {
              const Icon = meTool.icon;
              const active = isActive(meTool.path);
              return (
                <button
                  type="button"
                  onClick={() => go(meTool.path)}
                  className={cn(
                    "group relative flex items-center justify-center rounded-xl transition",
                    "hover:bg-muted/70 hover:shadow-sm active:scale-[0.98]",
                    buttonSize,
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
                      "transition",
                      iconSize,
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
