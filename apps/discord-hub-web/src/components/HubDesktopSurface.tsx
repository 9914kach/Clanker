import { useMemo, useRef, useState } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@clanker/ui/components/card";
import { Badge } from "@clanker/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@clanker/ui/components/tooltip";
import { cn } from "@clanker/ui/lib/utils";
import {
  GripVertical,
  Minus,
  MonitorCog,
  Plus,
} from "lucide-react";
import { useHubLocale } from "@/components/locale-provider";
import HubShellObject from "@/components/HubShellObject";
import { HUB_EASE_OUT, hubEnterMotion, hubPopMotion } from "@/lib/hub-motion";
import { useHubMildMultiSpringFollow } from "@/lib/hub-spring-follow-pointer";
import { hubContextData } from "@/lib/hub-shell-context";
import { HUB_DESKTOP_LAYOUT_GRID, type HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";
import {
  DEFAULT_WIDGET_VISUAL_PREFS,
  effectiveWidgetTone,
  type HubDesktopStylePackId,
  type HubWidgetVisualPrefs,
} from "@/lib/hub-prefs";
import { hubMotionDurationScale } from "@/lib/hub-motion";
import { useHubDesktopMarquee } from "@/hooks/use-hub-desktop-marquee";

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

const GUIDE_THRESHOLD = 6;

function toneVariant(tone: "useful" | "social" | "chaos"): "outline" | "secondary" | "destructive" {
  if (tone === "chaos") {
    return "destructive";
  }
  if (tone === "social") {
    return "secondary";
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type Rect = { x: number; y: number; w: number; h: number };

function collectGuideLines(
  preview: Rect,
  others: readonly Rect[],
  threshold: number,
): { vertical: number[]; horizontal: number[] } {
  const vertical = new Set<number>();
  const horizontal = new Set<number>();
  const pl = preview.x;
  const pr = preview.x + preview.w;
  const pcx = preview.x + preview.w / 2;
  const pt = preview.y;
  const pb = preview.y + preview.h;
  const pcy = preview.y + preview.h / 2;

  for (const o of others) {
    const ol = o.x;
    const or = o.x + o.w;
    const ocx = o.x + o.w / 2;
    const ot = o.y;
    const ob = o.y + o.h;
    const ocy = o.y + o.h / 2;

    if (Math.abs(pl - ol) < threshold) {
      vertical.add(ol);
    }
    if (Math.abs(pl - or) < threshold) {
      vertical.add(or);
    }
    if (Math.abs(pr - ol) < threshold) {
      vertical.add(ol);
    }
    if (Math.abs(pr - or) < threshold) {
      vertical.add(or);
    }
    if (Math.abs(pcx - ocx) < threshold) {
      vertical.add(ocx);
    }

    if (Math.abs(pt - ot) < threshold) {
      horizontal.add(ot);
    }
    if (Math.abs(pt - ob) < threshold) {
      horizontal.add(ob);
    }
    if (Math.abs(pb - ot) < threshold) {
      horizontal.add(ot);
    }
    if (Math.abs(pb - ob) < threshold) {
      horizontal.add(ob);
    }
    if (Math.abs(pcy - ocy) < threshold) {
      horizontal.add(ocy);
    }
  }

  return { vertical: [...vertical], horizontal: [...horizontal] };
}

function DraggableWidgetCard({
  item,
  layout,
  visualPrefs,
  surfaceRef,
  surfaceHeight,
  layoutEditMode,
  gridSnapEnabled,
  selected,
  selectedWidgetIds,
  visibleWidgetIds,
  peerRects,
  onMoveByDelta,
  onFocus,
  onHide,
  onSelect,
  onResizeWidget,
  resizeAria,
}: {
  item: HubSurfaceCardItem;
  layout: HubDesktopWidgetLayout;
  visualPrefs: HubWidgetVisualPrefs;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  surfaceHeight: number;
  layoutEditMode: boolean;
  gridSnapEnabled: boolean;
  selected: boolean;
  selectedWidgetIds: readonly string[];
  visibleWidgetIds: readonly string[];
  peerRects: readonly Rect[];
  onMoveByDelta: (ids: readonly string[], dx: number, dy: number) => void;
  onFocus: (id: string) => void;
  onHide: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  onResizeWidget: (id: string, size: { w: number; h: number }) => void;
  resizeAria: string;
}) {
  const { copy } = useHubLocale();
  const ds = copy.desktopSurface;
  const reducedMotion = useReducedMotion() ?? false;
  const dragControls = useDragControls();
  const Icon = item.icon;
  const [widgetDragActive, setWidgetDragActive] = useState(false);
  const pointerFollow = useHubMildMultiSpringFollow({
    enabled: layoutEditMode && !reducedMotion,
    pause: widgetDragActive,
    maxOffsetPx: 3,
  });
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [guideLines, setGuideLines] = useState<{ vertical: number[]; horizontal: number[] } | null>(null);
  const layoutStartRef = useRef({ x: layout.x, y: layout.y });
  const grid = HUB_DESKTOP_LAYOUT_GRID;
  const snap = (value: number) => (gridSnapEnabled ? Math.round(value / grid) * grid : value);

  const groupDragIds = useMemo(() => {
    if (selectedWidgetIds.includes(item.id) && selectedWidgetIds.length > 1) {
      return selectedWidgetIds.filter((id) => visibleWidgetIds.includes(id));
    }
    return [item.id];
  }, [item.id, selectedWidgetIds, visibleWidgetIds]);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!layoutEditMode) {
      return;
    }
    layoutStartRef.current = { x: layout.x, y: layout.y };
    onFocus(item.id);
    setDragPreview({ x: layout.x, y: layout.y });
    dragControls.start(event);
  };

  const updateGuidesForPreview = (x: number, y: number) => {
    const preview: Rect = { x, y, w: layout.w, h: layout.h };
    setGuideLines(collectGuideLines(preview, peerRects, GUIDE_THRESHOLD));
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setWidgetDragActive(false);
    setGuideLines(null);
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (!surfaceRect) {
      setDragPreview(null);
      return;
    }

    const margin = 16;
    const width = Math.min(layout.w, surfaceRect.width - margin * 2);
    const rawX = layoutStartRef.current.x + info.offset.x;
    const rawY = layoutStartRef.current.y + info.offset.y;
    const nextX = clamp(rawX, margin, Math.max(margin, surfaceRect.width - width - margin));
    const nextY = clamp(rawY, margin, Math.max(margin, surfaceHeight - layout.h - margin));

    const snappedX = Math.round(snap(nextX));
    const snappedY = Math.round(snap(nextY));
    const dx = snappedX - layoutStartRef.current.x;
    const dy = snappedY - layoutStartRef.current.y;

    if (dx !== 0 || dy !== 0) {
      onMoveByDelta(groupDragIds, dx, dy);
    }
    setDragPreview(null);
  };

  const resizeStateRef = useRef<{
    kind: "e" | "s" | "se";
    startW: number;
    startH: number;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ w: number; h: number } | null>(null);
  const resizeCommitRef = useRef({ w: layout.w, h: layout.h });

  const onResizePointerDown = (event: ReactPointerEvent, kind: "e" | "s" | "se") => {
    if (!layoutEditMode) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    onSelect(item.id, false);
    onFocus(item.id);
    resizeStateRef.current = {
      kind,
      startW: layout.w,
      startH: layout.h,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
    resizeCommitRef.current = { w: layout.w, h: layout.h };
    setResizePreview({ w: layout.w, h: layout.h });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent) => {
    const st = resizeStateRef.current;
    if (!st || event.pointerId !== st.pointerId) {
      return;
    }
    const dx = event.clientX - st.startX;
    const dy = event.clientY - st.startY;
    let nw = st.startW;
    let nh = st.startH;
    if (st.kind === "e" || st.kind === "se") {
      nw = st.startW + dx;
    }
    if (st.kind === "s" || st.kind === "se") {
      nh = st.startH + dy;
    }
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (surfaceRect) {
      const maxW = surfaceRect.width - layout.x - 16;
      nw = Math.min(nw, maxW);
    }
    const maxH = surfaceHeight - layout.y - 16;
    nh = Math.min(nh, maxH);
    const cw = Math.max(240, nw);
    const ch = Math.max(140, nh);
    resizeCommitRef.current = { w: cw, h: ch };
    setResizePreview({ w: cw, h: ch });
  };

  const onResizePointerUp = (event: ReactPointerEvent) => {
    const st = resizeStateRef.current;
    if (!st || event.pointerId !== st.pointerId) {
      return;
    }
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const startW = st.startW;
    const startH = st.startH;
    resizeStateRef.current = null;
    const { w, h } = resizeCommitRef.current;
    if (w !== startW || h !== startH) {
      onResizeWidget(item.id, { w, h });
    }
    setResizePreview(null);
  };

  const displayW = resizePreview?.w ?? layout.w;
  const displayH = resizePreview?.h ?? layout.h;
  const effectiveTone = effectiveWidgetTone(item.tone, visualPrefs.toneOverride);
  const cardOpacity = visualPrefs.glassOpacity / 100;
  const cardBgStyle = {
    backgroundColor: `color-mix(in oklab, var(--card) ${Math.round(cardOpacity * 100)}%, transparent)`,
  };

  const handleWidgetPointerDown = (event: ReactPointerEvent) => {
    if (!layoutEditMode) {
      return;
    }
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    onSelect(item.id, additive);
  };

  const pointerFollowProps =
    layoutEditMode && !reducedMotion
      ? {
          onPointerMove: pointerFollow.onPointerMove,
          onPointerLeave: pointerFollow.onPointerLeave,
          onPointerCancel: pointerFollow.onPointerCancel,
        }
      : {};

  return (
    <motion.article
      layout={!reducedMotion}
      drag={layoutEditMode}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.06}
      dragConstraints={surfaceRef}
      onDragStart={() => {
        if (!layoutEditMode) {
          return;
        }
        layoutStartRef.current = { x: layout.x, y: layout.y };
        onFocus(item.id);
        setWidgetDragActive(true);
        pointerFollow.reset();
      }}
      onDrag={(_event, info) => {
        if (!layoutEditMode) {
          return;
        }
        const surfaceRect = surfaceRef.current?.getBoundingClientRect();
        if (!surfaceRect) {
          return;
        }
        const margin = 16;
        const width = Math.min(layout.w, surfaceRect.width - margin * 2);
        const rawX = layoutStartRef.current.x + info.offset.x;
        const rawY = layoutStartRef.current.y + info.offset.y;
        const nextX = clamp(rawX, margin, Math.max(margin, surfaceRect.width - width - margin));
        const nextY = clamp(rawY, margin, Math.max(margin, surfaceHeight - layout.h - margin));
        const sx = Math.round(snap(nextX));
        const sy = Math.round(snap(nextY));
        setDragPreview({ x: sx, y: sy });
        updateGuidesForPreview(sx, sy);
      }}
      onDragEnd={handleDragEnd}
      onPointerDown={handleWidgetPointerDown}
      {...pointerFollowProps}
      {...hubPopMotion(reducedMotion)}
      style={{
        left: layout.x,
        top: layout.y,
        width: `min(${displayW}px, calc(100% - 1.5rem))`,
        minHeight: Math.max(displayH, sizeMinH(visualPrefs.sizePreset)),
        zIndex: layout.z,
      }}
      whileDrag={
        reducedMotion || !layoutEditMode
          ? undefined
          : {
              scale: 1.015,
              boxShadow: "0 20px 50px color-mix(in oklab, var(--foreground) 12%, transparent)",
            }
      }
      transition={{ duration: 0.2, ease: HUB_EASE_OUT }}
      className="absolute"
      {...hubContextData({
        type: "widget",
        widgetId: item.id,
        widgetLabel: item.label,
        widgetTone: item.tone,
      })}
    >
      {layoutEditMode && guideLines && (guideLines.vertical.length > 0 || guideLines.horizontal.length > 0) ? (
        <div className="pointer-events-none absolute inset-0 z-[15]" aria-hidden>
          {guideLines.vertical.map((x) => (
            <div
              key={`v-${x}`}
              className="absolute top-0 bottom-0 w-px bg-primary/70"
              style={{ left: x }}
            />
          ))}
          {guideLines.horizontal.map((y) => (
            <div
              key={`h-${y}`}
              className="absolute left-0 right-0 h-px bg-primary/70"
              style={{ top: y }}
            />
          ))}
        </div>
      ) : null}
      <Card
        className={cn(
          "relative h-full rounded-[1.4rem] border-border/70 shadow-sm transition",
          blurClass(visualPrefs.blurStrength),
          toneAccentClass(effectiveTone),
          layoutEditMode && "cursor-grab active:cursor-grabbing",
          layoutEditMode && selected &&
            "border-primary/70 shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_40%,transparent),0_16px_36px_color-mix(in_oklab,var(--primary)_26%,transparent)]",
        )}
        style={cardBgStyle}
      >
        {layoutEditMode && !reducedMotion ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute right-14 top-5 z-[12] size-1 rounded-full bg-primary/18"
            style={{ x: pointerFollow.loose.x, y: pointerFollow.loose.y }}
          />
        ) : null}
        {layoutEditMode && dragPreview ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 rounded-[1.4rem] border-2 border-dashed border-primary/70 bg-primary/10"
            aria-hidden
          />
        ) : null}
        <CardHeader className="relative z-20 flex flex-row items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {layoutEditMode && !reducedMotion ? (
                <motion.div
                  className="rounded-xl border border-border/60 bg-background/70 p-2"
                  style={{ x: pointerFollow.tight.x, y: pointerFollow.tight.y }}
                >
                  <Icon className="size-4" />
                </motion.div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                  <Icon className="size-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">{item.label}</CardTitle>
                {visualPrefs.showSubtitle ? (
                  <CardDescription className="mt-1 truncate">
                    {item.description}
                  </CardDescription>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {visualPrefs.showToneBadge ? (
              <Badge variant={toneVariant(effectiveTone)}>{effectiveTone}</Badge>
            ) : null}
            {layoutEditMode ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={ds.dragAria(item.label)}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={startDrag}
                  >
                    <GripVertical data-icon="inline-start" />
                    {ds.dragButton}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ds.dragTooltip}</TooltipContent>
              </Tooltip>
            ) : null}
            {layoutEditMode && item.hideable ? (
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

        {layoutEditMode ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={resizeAria}
              className="absolute right-1 top-14 bottom-14 z-30 w-2 cursor-ew-resize rounded-full bg-primary/25 opacity-70 hover:opacity-100"
              onPointerDown={(e) => onResizePointerDown(e, "e")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={resizeAria}
              className="absolute bottom-1 left-4 right-4 z-30 h-2 cursor-ns-resize rounded-full bg-primary/25 opacity-70 hover:opacity-100"
              onPointerDown={(e) => onResizePointerDown(e, "s")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
            <div
              aria-label={resizeAria}
              className="absolute bottom-1 right-1 z-30 size-4 cursor-nwse-resize rounded-sm border-2 border-primary/60 bg-background/90"
              onPointerDown={(e) => onResizePointerDown(e, "se")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
          </>
        ) : null}
      </Card>
    </motion.article>
  );
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
  onMoveWidgetsByDelta,
  onResizeWidget,
  onFocusWidget,
  onOpenWidget,
  onHideWidget,
  layoutEditMode,
  gridSnapEnabled = false,
  selectedWidgetIds = [],
  onSelectWidget,
  onSetWidgetSelection,
  onClearSelection,
  variant = "desktop",
}: {
  widgets: readonly HubDesktopWidget[];
  containers?: readonly HubDesktopContainer[];
  layouts: Readonly<Record<string, HubDesktopWidgetLayout>>;
  hiddenWidgetIds: readonly string[];
  widgetVisualPrefsById?: Partial<Record<string, HubWidgetVisualPrefs>>;
  stylePackId?: HubDesktopStylePackId;
  animationIntensity?: number;
  onMoveWidget: (id: string, position: Pick<HubDesktopWidgetLayout, "x" | "y">) => void;
  onMoveWidgetsByDelta?: (ids: readonly string[], dx: number, dy: number) => void;
  onResizeWidget?: (id: string, size: { w: number; h: number }) => void;
  onFocusWidget: (id: string) => void;
  onOpenWidget: (id: string) => void;
  onHideWidget: (id: string) => void;
  layoutEditMode: boolean;
  gridSnapEnabled?: boolean;
  selectedWidgetIds?: readonly string[];
  onSelectWidget?: (id: string, additive: boolean) => void;
  onSetWidgetSelection?: (ids: readonly string[]) => void;
  onClearSelection?: () => void;
  variant?: "desktop" | "panel";
}) {
  const { copy } = useHubLocale();
  const ds = copy.desktopSurface;
  const ch = copy.chrome;
  const reducedMotion = useReducedMotion() ?? false;
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const handleMoveByDelta = (ids: readonly string[], dx: number, dy: number) => {
    if (onMoveWidgetsByDelta) {
      onMoveWidgetsByDelta(ids, dx, dy);
      return;
    }
    const id = ids[0];
    if (!id) {
      return;
    }
    const cur = layouts[id];
    if (!cur) {
      return;
    }
    const grid = HUB_DESKTOP_LAYOUT_GRID;
    const snap = (v: number) => (gridSnapEnabled ? Math.round(v / grid) * grid : v);
    onMoveWidget(id, { x: snap(cur.x + dx), y: snap(cur.y + dy) });
  };

  const resize =
    onResizeWidget ??
    (() => {
      /* no-op when resize not wired */
    });

  const selectWidget = onSelectWidget ?? (() => undefined);
  const clearSelection = onClearSelection ?? (() => undefined);

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

  const visibleWidgetIds = useMemo(() => visibleWidgets.map((w) => w.id), [visibleWidgets]);

  const hiddenWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => hiddenWidgetIds.includes(widget.id))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [hiddenWidgetIds, widgets],
  );

  const peerRectsById = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const w of visibleWidgets) {
      const lo = layouts[w.id];
      if (lo) {
        map.set(w.id, { x: lo.x, y: lo.y, w: lo.w, h: lo.h });
      }
    }
    return map;
  }, [layouts, visibleWidgets]);

  const surfaceHeight = Math.max(
    580,
    ...visibleWidgets.map((widget) => {
      const layout = layouts[widget.id];
      return layout ? layout.y + layout.h + 48 : 580;
    }),
  );

  const setWidgetSelectionBatch = onSetWidgetSelection ?? (() => undefined);
  const marqueeEnabled =
    layoutEditMode && Boolean(onClearSelection) && Boolean(onSetWidgetSelection);

  const { marqueeBox, surfacePointerProps } = useHubDesktopMarquee({
    enabled: marqueeEnabled,
    surfaceRef,
    visibleWidgetIds,
    layouts,
    selectedWidgetIds,
    onSetWidgetSelection: setWidgetSelectionBatch,
    onClearSelection: clearSelection,
  });

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
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_26%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_18%,transparent)_1px,transparent_1px)] bg-[size:132px_132px] opacity-45" />
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

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-5">
          {variant === "desktop" && hiddenWidgets.length > 0 ? (
            <HubShellObject
              as="div"
              id="hub-spawn-modules"
              objectId="desktop.utility.spawn"
              objectKind="utilityZone"
              label={ch.shellObjectUtilityZone}
              layoutEditMode={layoutEditMode}
              layoutEditChrome="none"
              className="flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-dashed border-border/70 bg-background/45 px-3 py-3 backdrop-blur"
            >
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{ds.spawnApp}</span>
              {hiddenWidgets.map((widget) => (
                <Button key={widget.id} type="button" variant="outline" size="sm" onClick={() => onOpenWidget(widget.id)}>
                  <Plus data-icon="inline-start" />
                  {widget.label}
                </Button>
              ))}
            </HubShellObject>
          ) : null}

          <div className="block lg:hidden">
            <div className="grid gap-4">
              {visibleWidgets.map((widget) => {
                const Icon = widget.icon;
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
                      layoutEditMode && selectedMobile &&
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
                        if (!layoutEditMode) {
                          return;
                        }
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
                        {vp.showToneBadge ? (
                          <Badge variant={toneVariant(effectiveToneMobile)}>{effectiveToneMobile}</Badge>
                        ) : null}
                        {layoutEditMode && widget.hideable ? (
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
            {...surfacePointerProps}
            className={cn(
              "relative hidden overflow-hidden rounded-[2rem] border border-border/60 bg-background/28 lg:block",
              "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_26%)] before:content-['']",
            )}
            style={{ minHeight: surfaceHeight }}
          >
            {layoutEditMode && gridSnapEnabled ? (
              <div
                className="pointer-events-none absolute inset-0 z-[5] opacity-[0.14]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, color-mix(in oklab, var(--primary) 35%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--primary) 35%, transparent) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
                aria-hidden
              />
            ) : null}
            {variant === "desktop" ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <MonitorCog className="size-3.5" />
                  {ds.personalShell}
                </span>
                <span>{ds.rightClickHint}</span>
              </div>
            ) : null}

            {marqueeBox ? (
              <div
                className="pointer-events-none absolute z-[45] rounded-md border border-dashed border-muted-foreground/50 bg-primary/5"
                style={{
                  left: marqueeBox.left,
                  top: marqueeBox.top,
                  width: marqueeBox.width,
                  height: marqueeBox.height,
                }}
                aria-hidden
              />
            ) : null}

            <AnimatePresence initial={false}>
              {visibleWidgets.map((widget) => {
                const layout = layouts[widget.id];
                if (!layout) {
                  return null;
                }

                const peerRects = visibleWidgets
                  .filter((w) => w.id !== widget.id)
                  .map((w) => peerRectsById.get(w.id))
                  .filter((r): r is Rect => Boolean(r));

                return (
                  <DraggableWidgetCard
                    key={widget.id}
                    item={widget}
                    layout={layout}
                    visualPrefs={
                      widget.kind === "widget"
                        ? { ...DEFAULT_WIDGET_VISUAL_PREFS, ...widgetVisualPrefsById[widget.id] }
                        : { ...DEFAULT_WIDGET_VISUAL_PREFS, showToneBadge: false, showSubtitle: false }
                    }
                    surfaceRef={surfaceRef}
                    surfaceHeight={surfaceHeight}
                    layoutEditMode={layoutEditMode}
                    gridSnapEnabled={gridSnapEnabled}
                    selected={selectedWidgetIds.includes(widget.id)}
                    selectedWidgetIds={selectedWidgetIds}
                    visibleWidgetIds={visibleWidgetIds}
                    peerRects={peerRects}
                    onMoveByDelta={handleMoveByDelta}
                    onFocus={onFocusWidget}
                    onHide={onHideWidget}
                    onSelect={selectWidget}
                    onResizeWidget={resize}
                    resizeAria={ds.resizeHandleAria}
                  />
                );
              })}
            </AnimatePresence>

            {visibleWidgets.length === 0 ? (
              <motion.div
                {...hubPopMotion(reducedMotion, durationScale)}
                className="absolute inset-0 flex items-center justify-center p-6"
              >
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
