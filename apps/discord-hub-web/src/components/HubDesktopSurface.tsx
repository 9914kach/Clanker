import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GridStack, type GridStackWidget } from "gridstack/dist/gridstack.js";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import { Badge } from "@clanker/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@clanker/ui/components/tooltip";
import { cn } from "@clanker/ui/lib/utils";
import { GripVertical, Minus, Plus } from "lucide-react";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { hubEnterMotion, hubPopMotion } from "@/lib/hub-motion";
import { hubContextData } from "@/lib/hub-shell-context";
import { classifyTarget, getCapabilities, type HubEntityCapabilities } from "@/lib/hub-shell-classification";
import { HUB_DESKTOP_LAYOUT_GRID, type HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";
import {
  DEFAULT_WIDGET_VISUAL_PREFS,
  effectiveWidgetTone,
  type HubDesktopStylePackId,
  type HubGridCompaction,
  type HubWidgetVisualPrefs,
} from "@/lib/hub-prefs";
import { hubMotionDurationScale } from "@/lib/hub-motion";

export type HubDesktopWidget = {
  id: string;
  label: string;
  description: string;
  tone: "useful" | "social" | "chaos";
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
};

export type HubDesktopContainer = {
  id: string;
  label: string;
  description: string;
  tone: "useful" | "social" | "chaos";
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
};

export type { HubDesktopWidgetLayout };

type HubSurfaceCardItem =
  | ({ kind: "widget"; hideable: true } & HubDesktopWidget)
  | ({ kind: "container"; hideable: false } & HubDesktopContainer);

function toneVariant(tone: "useful" | "social" | "chaos"): "outline" | "secondary" | "destructive" {
  if (tone === "chaos") return "destructive";
  if (tone === "social") return "secondary";
  return "outline";
}

function blurClass(blurStrength: 0 | 1 | 2 | 3): string {
  if (blurStrength === 0) return "";
  if (blurStrength === 1) return "backdrop-blur-sm";
  if (blurStrength === 3) return "backdrop-blur-xl";
  return "backdrop-blur";
}

function sizeMinH(sizePreset: HubWidgetVisualPrefs["sizePreset"]): number {
  if (sizePreset === "compact") return 120;
  if (sizePreset === "expanded") return 280;
  return 180;
}

function toneAccentClass(tone: "useful" | "social" | "chaos"): string {
  if (tone === "chaos") return "border-destructive/40 bg-destructive/6";
  if (tone === "social") return "border-secondary/40 bg-secondary/6";
  return "";
}

function stylePackBackground(stylePackId: HubDesktopStylePackId): string {
  if (stylePackId === "midnight") {
    return "radial-gradient(circle at top left, color-mix(in oklab, #7c3aed 14%, transparent), transparent 30%), radial-gradient(circle at bottom right, color-mix(in oklab, #1e3a5f 16%, transparent), transparent 32%)";
  }
  if (stylePackId === "paper") {
    return "radial-gradient(circle at top left, color-mix(in oklab, #f5f0e8 50%, transparent), transparent 40%), radial-gradient(circle at bottom right, color-mix(in oklab, #e8d5b7 30%, transparent), transparent 32%)";
  }
  if (stylePackId === "signal") {
    return "radial-gradient(circle at top left, color-mix(in oklab, #00ff88 10%, transparent), transparent 25%), radial-gradient(circle at bottom right, color-mix(in oklab, #ff3366 8%, transparent), transparent 28%)";
  }
  return "";
}

function DesktopWidgetCard({
  item,
  visualPrefs,
  layoutEditMode,
  selected,
  onFocus,
  onHide,
  onSelect,
  itemCapabilities,
}: {
  item: HubSurfaceCardItem;
  visualPrefs: HubWidgetVisualPrefs;
  layoutEditMode: boolean;
  selected: boolean;
  onFocus: (id: string) => void;
  onHide: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  itemCapabilities: HubEntityCapabilities;
}) {
  const { copy } = useHubLocale();
  const ds = copy.desktopSurface;
  const Icon = item.icon;
  const effectiveTone = effectiveWidgetTone(item.tone, visualPrefs.toneOverride);
  const cardOpacity = visualPrefs.glassOpacity / 100;
  const cardBgStyle = {
    backgroundColor: `color-mix(in oklab, var(--card) ${Math.round(cardOpacity * 100)}%, transparent)`,
  };

  const handleWidgetPointerDown = (event: ReactPointerEvent) => {
    if (!layoutEditMode) return;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    onSelect(item.id, additive);
    onFocus(item.id);
  };

  return (
    <div
      className="h-full"
      onPointerDown={handleWidgetPointerDown}
      {...hubContextData({
        type: "widget",
        widgetId: item.id,
        widgetLabel: item.label,
        widgetTone: item.tone,
      })}
    >
      <Card
        className={cn(
          "relative h-full rounded-[1.4rem] border-border/70 shadow-sm transition",
          blurClass(visualPrefs.blurStrength),
          toneAccentClass(effectiveTone),
          layoutEditMode && itemCapabilities.movable && "cursor-grab active:cursor-grabbing",
          layoutEditMode &&
            selected &&
            "border-primary/70 shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_40%,transparent),0_16px_36px_color-mix(in_oklab,var(--primary)_26%,transparent)]",
        )}
        style={{ ...cardBgStyle, minHeight: sizeMinH(visualPrefs.sizePreset) }}
      >
        <CardHeader className="relative z-20 flex flex-row items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">{item.label}</CardTitle>
                {visualPrefs.showSubtitle ? (
                  <CardDescription className="mt-1 truncate">{item.description}</CardDescription>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {visualPrefs.showToneBadge ? <Badge variant={toneVariant(effectiveTone)}>{effectiveTone}</Badge> : null}
            {layoutEditMode && itemCapabilities.movable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={ds.dragAria(item.label)}
                    className="hub-widget-drag-handle cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical data-icon="inline-start" />
                    {ds.dragButton}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ds.dragTooltip}</TooltipContent>
              </Tooltip>
            ) : null}
            {layoutEditMode && itemCapabilities.hideable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onHide(item.id)}
                    aria-label={ds.hideAria(item.label)}
                  >
                    <Minus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ds.hideTooltip}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="relative z-20 pt-5">{item.content}</CardContent>
      </Card>
    </div>
  );
}

function policyCapabilitiesForSurfaceItem(params: {
  kind: "widget" | "container";
  id: string;
  label: string;
  tone: "useful" | "social" | "chaos";
  variant: "desktop" | "panel";
  layoutEditMode: boolean;
}): HubEntityCapabilities {
  const route = params.variant === "desktop" ? "/dashboard" : "/route";
  const mode = params.layoutEditMode ? "layout" : "normal";
  const target =
    params.kind === "widget"
      ? ({ type: "widget", widgetId: params.id, widgetLabel: params.label, widgetTone: params.tone } as const)
      : ({ type: "shell.surface", area: "desktop" } as const);
  const classification = classifyTarget(target, route);
  return getCapabilities(classification, mode, route);
}

export default function HubDesktopSurface({
  widgets,
  containers = [],
  layouts,
  hiddenWidgetIds,
  widgetVisualPrefsById = {},
  stylePackId = "default",
  animationIntensity = 100,
  onMoveWidget,
  onResizeWidget,
  onFocusWidget,
  onOpenWidget,
  onHideWidget,
  layoutEditMode,
  gridStep = HUB_DESKTOP_LAYOUT_GRID,
  gridSnapEnabled = true,
  showGrid = false,
  selectedWidgetIds = [],
  onSelectWidget,
  variant = "desktop",
  gridCompaction = "none",
}: {
  widgets: readonly HubDesktopWidget[];
  containers?: readonly HubDesktopContainer[];
  layouts: Readonly<Record<string, HubDesktopWidgetLayout>>;
  hiddenWidgetIds: readonly string[];
  widgetVisualPrefsById?: Partial<Record<string, HubWidgetVisualPrefs>>;
  stylePackId?: HubDesktopStylePackId;
  animationIntensity?: number;
  onMoveWidget: (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">, options?: { snap?: boolean }) => void;
  onResizeWidget?: (id: string, size: { w: number; h: number }, options?: { snap?: boolean }) => void;
  onFocusWidget: (id: string) => void;
  onOpenWidget: (id: string) => void;
  onHideWidget: (id: string) => void;
  layoutEditMode: boolean;
  gridStep?: number;
  gridSnapEnabled?: boolean;
  showGrid?: boolean;
  selectedWidgetIds?: readonly string[];
  onSelectWidget?: (id: string, additive: boolean) => void;
  variant?: "desktop" | "panel";
  gridCompaction?: HubGridCompaction;
}) {
  const { copy } = useHubLocale();
  const { theme } = useTheme();
  const ds = copy.desktopSurface;
  const reducedMotion = useReducedMotion() ?? false;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<GridStack | null>(null);
  const syncGuardRef = useRef(false);

  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const containerPadding = 16;
  const pxCols = Math.max(240, Math.floor(surfaceWidth - containerPadding * 2));
  const gridVisualStep = gridStep;

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const apply = () => setSurfaceWidth(el.getBoundingClientRect().width);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resize =
    onResizeWidget ??
    (() => {
      /* no-op when resize not wired */
    });
  const selectWidget = onSelectWidget ?? (() => undefined);

  const items = useMemo(() => {
    const ws: HubSurfaceCardItem[] = widgets.map((w) => ({ ...w, kind: "widget", hideable: true }));
    const cs: HubSurfaceCardItem[] = containers.map((c) => ({ ...c, kind: "container", hideable: false }));
    return [...ws, ...cs];
  }, [containers, widgets]);

  const visibleWidgets = useMemo(() => {
    return items
      .filter((item) => item.kind === "container" || !hiddenWidgetIds.includes(item.id))
      .sort((left, right) => (layouts[left.id]?.z ?? 0) - (layouts[right.id]?.z ?? 0));
  }, [hiddenWidgetIds, items, layouts]);

  const desktopWidgets = useMemo(() => {
    return visibleWidgets
      .map((widget) => {
        const layout = layouts[widget.id];
        if (!layout) return null;
        const itemCaps = policyCapabilitiesForSurfaceItem({
          kind: widget.kind,
          id: widget.id,
          label: widget.label,
          tone: widget.tone,
          variant,
          layoutEditMode,
        });
        const visualPrefs =
          widget.kind === "widget"
            ? { ...DEFAULT_WIDGET_VISUAL_PREFS, ...widgetVisualPrefsById[widget.id] }
            : { ...DEFAULT_WIDGET_VISUAL_PREFS, showToneBadge: false, showSubtitle: false };
        return { widget, layout, itemCaps, visualPrefs };
      })
      .filter(
        (
          entry,
        ): entry is {
          widget: HubSurfaceCardItem;
          layout: HubDesktopWidgetLayout;
          itemCaps: HubEntityCapabilities;
          visualPrefs: HubWidgetVisualPrefs;
        } => Boolean(entry),
      );
  }, [layoutEditMode, layouts, variant, visibleWidgets, widgetVisualPrefsById]);

  useEffect(() => {
    const root = gridRootRef.current;
    if (!root || surfaceWidth <= 0) return;
    gridRef.current?.destroy(false);
    const grid = GridStack.init(
      {
        column: pxCols,
        cellHeight: 1,
        margin: 0,
        float: gridCompaction === "none",
        draggable: { handle: ".hub-widget-drag-handle" },
      },
      root,
    );
    gridRef.current = grid;

    const onDragStop = (_e: Event, el: HTMLElement) => {
      if (syncGuardRef.current) return;
      const node = (el as HTMLElement & { gridstackNode?: GridStackWidget }).gridstackNode;
      if (!node?.id) return;
      onMoveWidget(
        String(node.id),
        { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) },
        { snap: gridSnapEnabled },
      );
    };
    const onResizeStop = (_e: Event, el: HTMLElement) => {
      if (syncGuardRef.current) return;
      const node = (el as HTMLElement & { gridstackNode?: GridStackWidget }).gridstackNode;
      if (!node?.id) return;
      const id = String(node.id);
      const w = Math.round(node.w ?? 0);
      const h = Math.round(node.h ?? 0);
      resize(id, { w, h }, { snap: gridSnapEnabled });
      onMoveWidget(id, { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) }, { snap: gridSnapEnabled });
    };

    grid.on("dragstop", onDragStop);
    grid.on("resizestop", onResizeStop);

    return () => {
      grid.off("dragstop");
      grid.off("resizestop");
      grid.destroy(false);
      if (gridRef.current === grid) {
        gridRef.current = null;
      }
    };
  }, [onMoveWidget, pxCols, resize, surfaceWidth, gridCompaction, gridSnapEnabled]);

  useEffect(() => {
    const grid = gridRef.current;
    const root = gridRootRef.current;
    if (!grid || !root) return;
    syncGuardRef.current = true;
    grid.batchUpdate();
    grid.removeAll(false);
    const idSet = new Set(desktopWidgets.map(({ widget }) => widget.id));
    for (const { widget, layout, itemCaps } of desktopWidgets) {
      const selector = `.grid-stack-item[gs-id="${CSS.escape(widget.id)}"]`;
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) continue;
      const options: GridStackWidget = {
        id: widget.id,
        x: Math.round(layout.x),
        y: Math.round(layout.y),
        w: Math.max(120, Math.round(layout.w)),
        h: Math.max(120, Math.round(layout.h)),
        noMove: !layoutEditMode || !itemCaps.movable,
        noResize: !layoutEditMode || !itemCaps.resizable,
        minW: 120,
        minH: 100,
      };
      grid.makeWidget(el, options);
      el.style.zIndex = String(Math.max(1, layout.z));
    }
    grid.batchUpdate(false);
    grid.enableMove(layoutEditMode);
    grid.enableResize(layoutEditMode);

    // Cleanup ghost nodes if React removed elements this frame.
    for (const node of [...grid.engine.nodes]) {
      const id = String(node.id ?? "");
      if (!id || idSet.has(id)) continue;
      if (node.el) {
        grid.removeWidget(node.el, false, false);
      }
    }
    syncGuardRef.current = false;
  }, [desktopWidgets, layoutEditMode]);

  const hiddenWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => hiddenWidgetIds.includes(widget.id))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [hiddenWidgetIds, widgets],
  );

  const packBg = stylePackBackground(stylePackId);
  const durationScale = hubMotionDurationScale(animationIntensity);

  return (
    <motion.section
      {...hubEnterMotion(reducedMotion, 12, durationScale)}
      className={cn(
        "relative overflow-hidden",
        variant === "desktop" ? "flex min-h-full flex-1" : "rounded-[1.75rem] border border-border/55 bg-background/30",
      )}
      {...hubContextData({ type: "shell.surface", area: "desktop" })}
    >
      {variant === "desktop" ? (
        <>
          {packBg ? (
            <div className="absolute inset-0 transition-all duration-700" style={{ backgroundImage: packBg }} />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_30%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_32%)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_26%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_18%,transparent)_1px,transparent_1px)] bg-[size:132px_132px] opacity-45 dark:hidden" />
        </>
      ) : null}

      <div className="relative flex min-h-full flex-1 flex-col">
        {layoutEditMode && variant === "desktop" ? (
          <div className="sticky top-0 z-30 border-b border-primary/35 bg-primary/15 px-4 py-2 text-center text-xs font-medium text-primary shadow-sm backdrop-blur-md md:px-5">
            <span className="mr-2 font-semibold">{ds.layoutEditBanner}</span>
            <span className="text-muted-foreground">{ds.layoutEditHint}</span>
            <div className="mt-1.5 text-[0.7rem] font-normal text-primary/90">{ds.editStickyHelp}</div>
          </div>
        ) : null}

        <div className={cn("flex flex-1 flex-col", variant === "desktop" ? "gap-0 p-0" : "gap-4 p-4 md:p-5")}>
          <div className="block lg:hidden">
            <div className="grid gap-4">
              {visibleWidgets.map((widget) => {
                const Icon = widget.icon;
                const itemCaps = policyCapabilitiesForSurfaceItem({
                  kind: widget.kind,
                  id: widget.id,
                  label: widget.label,
                  tone: widget.tone,
                  variant,
                  layoutEditMode,
                });
                const selectedMobile = selectedWidgetIds.includes(widget.id);
                const vp =
                  widget.kind === "widget"
                    ? { ...DEFAULT_WIDGET_VISUAL_PREFS, ...widgetVisualPrefsById[widget.id] }
                    : { ...DEFAULT_WIDGET_VISUAL_PREFS, showToneBadge: false, showSubtitle: false };
                const effectiveToneMobile = effectiveWidgetTone(widget.tone, vp.toneOverride);
                const mobileCardOpacity = vp.glassOpacity / 100;
                const mobileCardBg = {
                  backgroundColor: `color-mix(in oklab, var(--card) ${Math.round(mobileCardOpacity * 100)}%, transparent)`,
                };

                return (
                  <Card
                    key={widget.id}
                    className={cn(
                      "rounded-[1.4rem] border-border/70 transition",
                      blurClass(vp.blurStrength),
                      toneAccentClass(effectiveToneMobile),
                      layoutEditMode &&
                        selectedMobile &&
                        "border-primary/70 shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
                    )}
                    style={mobileCardBg}
                    {...hubContextData({
                      type: "widget",
                      widgetId: widget.id,
                      widgetLabel: widget.label,
                      widgetTone: widget.tone,
                    })}
                  >
                    <CardHeader
                      className="flex flex-row items-start justify-between gap-3"
                      onPointerDown={(e) => {
                        if (!layoutEditMode) return;
                        selectWidget(widget.id, e.shiftKey || e.metaKey || e.ctrlKey);
                        onFocusWidget(widget.id);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-base">{widget.label}</CardTitle>
                            {vp.showSubtitle ? (
                              <CardDescription className="mt-1 truncate">{widget.description}</CardDescription>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {vp.showToneBadge ? <Badge variant={toneVariant(effectiveToneMobile)}>{effectiveToneMobile}</Badge> : null}
                        {layoutEditMode && itemCaps.hideable ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              selectWidget(widget.id, false);
                              onFocusWidget(widget.id);
                              onHideWidget(widget.id);
                            }}
                          >
                            <Minus />
                          </Button>
                        ) : null}
                      </div>
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
              "relative hidden overflow-hidden lg:block",
              variant === "desktop"
                ? "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_26%)] before:content-['']"
                : "rounded-[2rem] border border-border/60 bg-background/28 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_26%)] before:content-['']",
            )}
            style={{ minHeight: 580 }}
          >
            {layoutEditMode && showGrid ? (
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 z-[5]",
                  theme === "light" ? "opacity-[0.14]" : "opacity-[0.22]",
                )}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, color-mix(in oklab, var(--primary) 38%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--primary) 38%, transparent) 1px, transparent 1px)",
                  backgroundSize: `${gridSnapEnabled ? gridVisualStep : HUB_DESKTOP_LAYOUT_GRID}px ${gridSnapEnabled ? gridVisualStep : HUB_DESKTOP_LAYOUT_GRID}px`,
                }}
                aria-hidden
              />
            ) : null}

            <div
              ref={gridRootRef}
              className="hub-desktop-grid grid-stack relative z-10"
              style={{
                minHeight: 580,
                marginInline: `${containerPadding}px`,
                width: `calc(100% - ${containerPadding * 2}px)`,
              }}
            >
              {desktopWidgets.map(({ widget, visualPrefs, itemCaps }) => (
                <div key={widget.id} className="grid-stack-item" gs-id={widget.id}>
                  <div className="grid-stack-item-content h-full">
                    <DesktopWidgetCard
                      item={widget}
                      visualPrefs={visualPrefs}
                      layoutEditMode={layoutEditMode}
                      selected={selectedWidgetIds.includes(widget.id)}
                      onFocus={onFocusWidget}
                      onHide={onHideWidget}
                      onSelect={selectWidget}
                      itemCapabilities={itemCaps}
                    />
                  </div>
                </div>
              ))}
            </div>

            {visibleWidgets.length === 0 ? (
              <motion.div {...hubPopMotion(reducedMotion, durationScale)} className="absolute inset-0 flex items-center justify-center p-6">
                <div className="flex max-w-md flex-col items-center gap-4 rounded-[1.75rem] border border-dashed border-border/70 bg-background/75 px-6 py-8 text-center shadow-sm backdrop-blur">
                  <Badge variant="outline">{ds.emptyBadge}</Badge>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{ds.emptyTitle}</h3>
                    <p className="text-sm text-muted-foreground">{ds.emptyBody}</p>
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
      </div>
    </motion.section>
  );
}
