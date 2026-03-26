import { useMemo, useRef } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@clanker/ui/components/context-menu";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import { Badge } from "@clanker/ui/components/badge";
import { Separator } from "@clanker/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@clanker/ui/components/tooltip";
import { cn } from "@clanker/ui/lib/utils";
import {
  GripVertical,
  Minus,
  MonitorCog,
  MousePointer2,
  Palette,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { HUB_EASE_OUT, hubEnterMotion, hubPopMotion } from "@/lib/hub-motion";

export type HubDesktopWidget = {
  id: string;
  label: string;
  description: string;
  tone: "useful" | "social" | "chaos";
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
};

export type HubDesktopWidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  hidden: boolean;
};

function toneVariant(tone: HubDesktopWidget["tone"]): "outline" | "secondary" | "destructive" {
  if (tone === "chaos") {
    return "destructive";
  }
  if (tone === "social") {
    return "secondary";
  }
  return "outline";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function DraggableWidgetCard({
  widget,
  layout,
  surfaceRef,
  surfaceHeight,
  onMove,
  onFocus,
  onHide,
}: {
  widget: HubDesktopWidget;
  layout: HubDesktopWidgetLayout;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  surfaceHeight: number;
  onMove: (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => void;
  onFocus: (id: string) => void;
  onHide: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const dragControls = useDragControls();
  const Icon = widget.icon;
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    onFocus(widget.id);
    dragControls.start(event);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (!surfaceRect) {
      return;
    }

    const margin = 16;
    const width = Math.min(layout.w, surfaceRect.width - margin * 2);
    const nextX = clamp(layout.x + info.offset.x, margin, Math.max(margin, surfaceRect.width - width - margin));
    const nextY = clamp(layout.y + info.offset.y, margin, Math.max(margin, surfaceHeight - layout.h - margin));

    onMove(widget.id, {
      x: Math.round(nextX),
      y: Math.round(nextY),
    });
  };

  return (
    <motion.article
      layout={!reducedMotion}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.06}
      dragConstraints={surfaceRef}
      onDragStart={() => onFocus(widget.id)}
      onDragEnd={handleDragEnd}
      onPointerDown={() => onFocus(widget.id)}
      {...hubPopMotion(reducedMotion)}
      style={{
        left: layout.x,
        top: layout.y,
        width: `min(${layout.w}px, calc(100% - 1.5rem))`,
        minHeight: layout.h,
        zIndex: layout.z,
      }}
      whileDrag={
        reducedMotion
          ? undefined
          : {
              scale: 1.015,
              boxShadow: "0 20px 50px color-mix(in oklab, var(--foreground) 12%, transparent)",
            }
      }
      transition={{ duration: 0.2, ease: HUB_EASE_OUT }}
      className="absolute"
    >
      <Card className="h-full rounded-[1.4rem] border-border/70 bg-card/85 shadow-sm backdrop-blur">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">{widget.label}</CardTitle>
                <CardDescription className="mt-1 truncate">
                  {widget.description}
                </CardDescription>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={toneVariant(widget.tone)}>{widget.tone}</Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Drag ${widget.label}`}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={startDrag}
                >
                  <GripVertical data-icon="inline-start" />
                  Drag
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grab and place anywhere on the desktop</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onHide(widget.id)}
                  aria-label={`Hide ${widget.label}`}
                >
                  <Minus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hide widget</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="pt-5">{widget.content}</CardContent>
      </Card>
    </motion.article>
  );
}

export default function HubDesktopSurface({
  widgets,
  layouts,
  hiddenWidgetIds,
  onMoveWidget,
  onFocusWidget,
  onOpenWidget,
  onHideWidget,
  onOpenCommandPalette,
  onCyclePalette,
  audioEnabled,
  onToggleAudio,
  onChaosAction,
  onResetLayout,
}: {
  widgets: readonly HubDesktopWidget[];
  layouts: Readonly<Record<string, HubDesktopWidgetLayout>>;
  hiddenWidgetIds: readonly string[];
  onMoveWidget: (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => void;
  onFocusWidget: (id: string) => void;
  onOpenWidget: (id: string) => void;
  onHideWidget: (id: string) => void;
  onOpenCommandPalette: () => void;
  onCyclePalette: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onChaosAction: () => void;
  onResetLayout: () => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const visibleWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => !hiddenWidgetIds.includes(widget.id))
        .sort((left, right) => (layouts[left.id]?.z ?? 0) - (layouts[right.id]?.z ?? 0)),
    [hiddenWidgetIds, layouts, widgets],
  );
  const hiddenWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => hiddenWidgetIds.includes(widget.id))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [hiddenWidgetIds, widgets],
  );
  const surfaceHeight = Math.max(
    580,
    ...visibleWidgets.map((widget) => {
      const layout = layouts[widget.id];
      return layout ? layout.y + layout.h + 48 : 580;
    }),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.section
          {...hubEnterMotion(reducedMotion, 12)}
          className="rounded-[2rem] border border-border/70 bg-background/60 p-4 shadow-xl backdrop-blur md:p-5"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-2">
                <Badge variant="secondary" className="w-fit">
                  Neutralen OS surface
                </Badge>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Desktop surface</h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Move modules anywhere, keep your exact layout between visits, and treat the whole page
                    more like a desktop than a dashboard.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onOpenCommandPalette}>
                  <Search data-icon="inline-start" />
                  Open command bar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onCyclePalette}>
                  <Palette data-icon="inline-start" />
                  Cycle palette
                </Button>
                <Button type="button" size="sm" onClick={onChaosAction}>
                  <Sparkles data-icon="inline-start" />
                  Chaos pulse
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{visibleWidgets.length} widgets active</span>
              <Separator orientation="vertical" className="h-4" />
              <span>{hiddenWidgets.length} widgets sleeping</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Audio {audioEnabled ? "online" : "muted"}</span>
              <Separator orientation="vertical" className="hidden h-4 md:block" />
              <span className="inline-flex items-center gap-1">
                <MousePointer2 className="size-3.5" />
                drag handle in each title bar
              </span>
            </div>

            {hiddenWidgets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/45 p-3">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Spawn module</span>
                {hiddenWidgets.map((widget) => (
                  <Button key={widget.id} type="button" variant="outline" size="sm" onClick={() => onOpenWidget(widget.id)}>
                    <Plus data-icon="inline-start" />
                    {widget.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="block lg:hidden">
              <div className="grid gap-4">
                {visibleWidgets.map((widget) => {
                  const Icon = widget.icon;

                  return (
                    <Card key={widget.id} className="rounded-[1.4rem] border-border/70 bg-card/85 backdrop-blur">
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <CardTitle className="truncate text-base">{widget.label}</CardTitle>
                              <CardDescription className="mt-1 truncate">{widget.description}</CardDescription>
                            </div>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onHideWidget(widget.id)}>
                          <Minus />
                        </Button>
                      </CardHeader>
                      <CardContent>{widget.content}</CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div
              ref={surfaceRef}
              className={cn(
                "relative hidden overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-background/95 via-background/70 to-muted/35 lg:block",
                "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_32%)] before:content-['']",
                "after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_35%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_28%,transparent)_1px,transparent_1px)] after:bg-[size:120px_120px] after:opacity-40 after:content-['']",
              )}
              style={{ minHeight: surfaceHeight }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <MonitorCog className="size-3.5" />
                  Personal shell
                </span>
                <span>Right-click for desktop actions</span>
              </div>

              <AnimatePresence initial={false}>
                {visibleWidgets.map((widget) => {
                  const layout = layouts[widget.id];
                  if (!layout) {
                    return null;
                  }

                  return (
                    <DraggableWidgetCard
                      key={widget.id}
                      widget={widget}
                      layout={layout}
                      surfaceRef={surfaceRef}
                      surfaceHeight={surfaceHeight}
                      onMove={onMoveWidget}
                      onFocus={onFocusWidget}
                      onHide={onHideWidget}
                    />
                  );
                })}
              </AnimatePresence>

              {visibleWidgets.length === 0 ? (
                <motion.div
                  {...hubPopMotion(reducedMotion)}
                  className="absolute inset-0 flex items-center justify-center p-6"
                >
                  <div className="flex max-w-md flex-col items-center gap-4 rounded-[1.75rem] border border-dashed border-border/70 bg-background/75 px-6 py-8 text-center shadow-sm backdrop-blur">
                    <Badge variant="outline">Desktop sleeping</Badge>
                    <div className="flex flex-col gap-2">
                      <h3 className="text-lg font-semibold tracking-tight">Everything is hidden right now</h3>
                      <p className="text-sm text-muted-foreground">
                        Spawn a module, right-click the surface, and build your own shell from scratch.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {hiddenWidgets.slice(0, 3).map((widget) => (
                        <Button key={widget.id} type="button" variant="outline" size="sm" onClick={() => onOpenWidget(widget.id)}>
                          <Plus data-icon="inline-start" />
                          {widget.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </div>
          </div>
        </motion.section>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Desktop</ContextMenuLabel>
        <ContextMenuItem onSelect={onOpenCommandPalette}>Open command bar</ContextMenuItem>
        <ContextMenuItem onSelect={onCyclePalette}>Cycle palette</ContextMenuItem>
        <ContextMenuCheckboxItem checked={audioEnabled} onCheckedChange={onToggleAudio}>
          Audio feedback
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Spawn widget</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {hiddenWidgets.length > 0 ? (
              hiddenWidgets.map((widget) => (
                <ContextMenuItem key={widget.id} onSelect={() => onOpenWidget(widget.id)}>
                  {widget.label}
                </ContextMenuItem>
              ))
            ) : (
              <ContextMenuItem disabled>All widgets are already active</ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onResetLayout}>Reset layout</ContextMenuItem>
        <ContextMenuItem onSelect={onChaosAction}>Chaos pulse</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
