import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { GripVertical, LayoutPanelTop, Radio, Trophy, Workflow } from "lucide-react";
import { NavLink } from "react-router-dom";
import { motion, Reorder, useReducedMotion } from "framer-motion";
import { cn } from "@clanker/ui/lib/utils";
import type { HubCopy } from "@/i18n/hub-copy";
import { HUB_EASE_OUT } from "@/lib/hub-motion";
import { hubContextData, type HubContextTarget } from "@/lib/hub-shell-context";
import type { HubNavBookmark } from "@/lib/hub-nav-bookmarks";
import { isBookmarkNavId, isExternalNavPath } from "@/lib/hub-nav-bookmarks";
import { resolveNavBookmarkIcon } from "@/lib/hub-nav-bookmark-icons";
import type { HubPrimaryNavOverride } from "@/lib/hub-primary-nav-overrides";
import type { HubPrimaryNavItemId } from "@/lib/hub-shell-layout-order";
import { useHubMildMultiSpringFollow } from "@/lib/hub-spring-follow-pointer";

type HubPlay = (kind: "dock" | "panel" | "confirm" | "chaos") => void;

function commitReorderIfChanged(
  prev: readonly string[],
  next: string[],
  onReorder: (next: string[]) => void,
  play: HubPlay,
) {
  if (next.join(",") !== prev.join(",")) {
    onReorder(next);
    play("panel");
  }
}

/** Bumps when layout edit mode is entered (toggle on or first mount already in edit). */
function useLayoutEditIntroNonce(layoutEditMode: boolean): number {
  const prevMode = useRef(layoutEditMode);
  const didMount = useRef(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (layoutEditMode) {
        setNonce((n) => n + 1);
      }
      prevMode.current = layoutEditMode;
      return;
    }
    if (layoutEditMode && !prevMode.current) {
      setNonce((n) => n + 1);
    }
    prevMode.current = layoutEditMode;
  }, [layoutEditMode]);

  return nonce;
}

/** Very subtle “breathing” outline (2–3s), not loud red. */
const NAV_BREATHE_LO = "0 0 0 1px color-mix(in oklab, var(--primary) 6%, transparent)";
const NAV_BREATHE_HI = "0 0 0 1px color-mix(in oklab, var(--primary) 13%, transparent), 0 0 14px color-mix(in oklab, var(--primary) 6%, transparent)";

/**
 * Edit-mode shell around a reorderable control: grip, one-time staggered nudge on enter,
 * slow idle breathe, hover lift, drag lift + tilt.
 * Radius matches HubLayout `navButtonClassName` (`rounded-xl`).
 */
function HubReorderEditAffordance({
  slotIndex,
  reducedMotion,
  rowContext,
  fullWidth,
  children,
}: {
  slotIndex: number;
  reducedMotion: boolean;
  /** Same shell target as the nav control; grip sits beside the link, so it must carry context too. */
  rowContext?: HubContextTarget | null;
  /** Sidebar: stretch row to full aside width. */
  fullWidth?: boolean;
  children: ReactNode;
}) {
  const rowCtxProps = rowContext ? hubContextData(rowContext) : {};
  const follow = useHubMildMultiSpringFollow({
    enabled: !reducedMotion,
    pause: false,
    maxOffsetPx: 2.25,
  });

  const radius = "rounded-xl";
  const gripClass = "size-3.5";
  const [introDone, setIntroDone] = useState(false);

  const onIntroComplete = useCallback(() => {
    setIntroDone(true);
  }, []);

  const gripWrapClass =
    "pointer-events-none flex shrink-0 items-center ps-1 text-muted-foreground opacity-[0.14] transition-opacity duration-200 group-hover:opacity-80 group-active:opacity-100";

  const rowFlexClass = cn(
    "group cursor-grab items-stretch gap-0.5 active:cursor-grabbing",
    fullWidth ? "flex w-full max-w-full" : "inline-flex max-w-full",
  );

  if (reducedMotion) {
    return (
      <div
        {...rowCtxProps}
        className={cn(
          rowFlexClass,
          radius,
          "ring-1 ring-primary/15 ring-offset-0 ring-offset-background",
        )}
      >
        <span className={gripWrapClass} aria-hidden>
          <GripVertical className={gripClass} strokeWidth={2} />
        </span>
        <span className="inline-flex min-w-0 flex-1 items-stretch [&>*]:min-w-0">{children}</span>
      </div>
    );
  }

  const breatheLo = NAV_BREATHE_LO;
  const breatheHi = NAV_BREATHE_HI;

  return (
    <motion.div
      {...rowCtxProps}
      className={cn(
        rowFlexClass,
        "will-change-transform",
        radius,
        "ring-1 ring-primary/12 ring-offset-0 ring-offset-background",
      )}
      initial={{ opacity: 0.94, x: 0, y: 0, rotate: 0, boxShadow: breatheLo }}
      animate={
        introDone
          ? {
              opacity: 1,
              x: 0,
              y: 0,
              rotate: 0,
              boxShadow: [breatheLo, breatheHi, breatheLo],
            }
          : {
              opacity: 1,
              x: [0, 3, -2, 0],
              y: 0,
              rotate: 0,
              boxShadow: breatheLo,
            }
      }
      transition={
        introDone
          ? {
              boxShadow: {
                duration: 2.75,
                repeat: Infinity,
                ease: "easeInOut",
                repeatDelay: 0.35,
              },
              opacity: { duration: 0.2 },
            }
          : {
              delay: slotIndex * 0.065,
              duration: 0.44,
              ease: HUB_EASE_OUT,
              times: [0, 0.28, 0.62, 1],
            }
      }
      whileHover={{
        y: -1,
        scale: 1.01,
        boxShadow:
          "0 0 0 1px color-mix(in oklab, var(--primary) 24%, transparent), 0 8px 20px color-mix(in oklab, var(--foreground) 8%, transparent)",
        transition: { duration: 0.14, ease: HUB_EASE_OUT },
      }}
      whileDrag={{
        scale: 1.03,
        y: 0,
        rotate: 0.7,
        cursor: "grabbing",
        zIndex: 50,
        boxShadow:
          "0 18px 44px color-mix(in oklab, var(--foreground) 12%, transparent), 0 0 0 2px color-mix(in oklab, var(--primary) 38%, transparent)",
        transition: { duration: 0.12, ease: HUB_EASE_OUT },
      }}
      onAnimationComplete={introDone ? undefined : onIntroComplete}
      onPointerMove={follow.onPointerMove}
      onPointerLeave={follow.onPointerLeave}
      onPointerCancel={follow.onPointerCancel}
    >
      <motion.span
        className={gripWrapClass}
        aria-hidden
        style={{ x: follow.loose.x, y: follow.loose.y }}
      >
        <GripVertical className={gripClass} strokeWidth={2} />
      </motion.span>
      <motion.span
        className="inline-flex min-w-0 flex-1 items-stretch [&>*]:min-w-0"
        style={{ x: follow.tight.x, y: follow.tight.y }}
      >
        {children}
      </motion.span>
    </motion.div>
  );
}

export function HubShellReorderablePrimaryNav({
  order,
  onReorder,
  layoutEditMode,
  play,
  copy,
  navButtonClassName,
  profilePath,
  navBookmarks,
  primaryNavOverrides,
  onContextMenu,
  orientation = "horizontal",
}: {
  order: readonly string[];
  onReorder: (next: string[]) => void;
  layoutEditMode: boolean;
  play: HubPlay;
  copy: HubCopy;
  navButtonClassName: (isActive: boolean) => string;
  profilePath: string | null;
  navBookmarks: Readonly<Record<string, HubNavBookmark>>;
  primaryNavOverrides: Readonly<Partial<Record<HubPrimaryNavItemId, HubPrimaryNavOverride>>>;
  /** Parent layout context menu handler — forwarded to Reorder.Items so drag doesn't swallow right-clicks. */
  onContextMenu?: (e: ReactMouseEvent<HTMLElement>) => void;
  orientation?: "horizontal" | "vertical";
}) {
  const em = copy.editMode;
  const ch = copy.chrome;
  const reducedMotion = useReducedMotion() ?? false;
  const introNonce = useLayoutEditIntroNonce(layoutEditMode);
  const isVertical = orientation === "vertical";

  const labelForId = (id: string): string => {
    if (id === "desktop") {
      return primaryNavOverrides.desktop?.label ?? ch.navDesktop;
    }
    if (id === "profile") {
      return (
        primaryNavOverrides.profile?.label ??
        (profilePath ? ch.myProfile : ch.myProfileOffline)
      );
    }
    if (id === "settings") {
      return primaryNavOverrides.settings?.label ?? ch.settings;
    }
    if (id === "wheel") {
      return primaryNavOverrides.wheel?.label ?? ch.wheel;
    }
    if (id === "radio") {
      return primaryNavOverrides.radio?.label ?? ch.navRadio;
    }
    if (id === "leagueStats") {
      return primaryNavOverrides.leagueStats?.label ?? ch.navLeagueStats;
    }
    if (isBookmarkNavId(id)) {
      return navBookmarks[id]?.label ?? id;
    }
    return id;
  };

  /** Context for layout-edit reorder row (grip is not under the anchor). */
  const layoutRowContextForId = (id: string): HubContextTarget | null => {
    if (id === "desktop") {
      const override = primaryNavOverrides.desktop;
      return {
        type: "navPrimary",
        navId: "desktop",
        label: override?.label ?? ch.toolDesktop,
        path: override?.path ?? "/dashboard",
        iconKey: override?.iconKey ?? null,
      };
    }
    if (id === "profile") {
      const override = primaryNavOverrides.profile;
      const path = override?.path ?? profilePath ?? "";
      if (!path) {
        return null;
      }
      return {
        type: "navPrimary",
        navId: "profile",
        label: override?.label ?? ch.myProfile,
        path,
        iconKey: override?.iconKey ?? null,
      };
    }
    if (id === "settings") {
      const override = primaryNavOverrides.settings;
      return {
        type: "navPrimary",
        navId: "settings",
        label: override?.label ?? ch.settings,
        path: override?.path ?? "/profile/settings",
        iconKey: override?.iconKey ?? null,
      };
    }
    if (id === "wheel") {
      const override = primaryNavOverrides.wheel;
      return {
        type: "navPrimary",
        navId: "wheel",
        label: override?.label ?? ch.wheel,
        path: override?.path ?? "/tools/spin-the-wheel",
        iconKey: override?.iconKey ?? null,
      };
    }
    if (id === "radio") {
      const override = primaryNavOverrides.radio;
      return {
        type: "navPrimary",
        navId: "radio",
        label: override?.label ?? ch.navRadio,
        path: override?.path ?? "/tools/music",
        iconKey: override?.iconKey ?? null,
      };
    }
    if (id === "leagueStats") {
      const override = primaryNavOverrides.leagueStats;
      return {
        type: "navPrimary",
        navId: "leagueStats",
        label: override?.label ?? ch.navLeagueStats,
        path: override?.path ?? "/tools/league-stats",
        iconKey: override?.iconKey ?? null,
      };
    }
    if (isBookmarkNavId(id)) {
      const bm = navBookmarks[id];
      if (!bm) {
        return null;
      }
      return {
        type: "navBookmark",
        bookmarkId: id,
        label: bm.label,
        path: bm.path,
      };
    }
    return null;
  };

  const renderItem = (id: string): ReactNode => {
    const anchorDraggable = layoutEditMode ? false : undefined;

    if (id === "desktop") {
      const override = primaryNavOverrides.desktop;
      const label = override?.label ?? ch.navDesktop;
      const path = override?.path ?? "/dashboard";
      const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : LayoutPanelTop;
      return (
        <NavLink
          to={path}
          end={path === "/dashboard"}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "navPrimary",
            navId: "desktop",
            label,
            path,
            iconKey: override?.iconKey ?? null,
          })}
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </NavLink>
      );
    }
    if (id === "profile") {
      const override = primaryNavOverrides.profile;
      const path = override?.path ?? profilePath ?? null;
      if (path) {
        const label = override?.label ?? ch.myProfile;
        const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : null;
        return (
          <NavLink
            to={path}
            draggable={anchorDraggable}
            tabIndex={layoutEditMode ? -1 : undefined}
            onClick={(e) => {
              if (layoutEditMode) e.preventDefault();
            }}
            className={({ isActive }) => navButtonClassName(isActive)}
            {...hubContextData({
              type: "navPrimary",
              navId: "profile",
              label,
              path,
              iconKey: override?.iconKey ?? null,
            })}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
            {label}
          </NavLink>
        );
      }
      return (
        <span className={cn(navButtonClassName(false), layoutEditMode && "select-none")}>
          {override?.label ?? ch.myProfileOffline}
        </span>
      );
    }
    if (id === "settings") {
      const override = primaryNavOverrides.settings;
      const label = override?.label ?? ch.settings;
      const path = override?.path ?? "/profile/settings";
      const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : null;
      return (
        <NavLink
          to={path}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "navPrimary",
            navId: "settings",
            label,
            path,
            iconKey: override?.iconKey ?? null,
          })}
        >
          {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
          {label}
        </NavLink>
      );
    }
    if (id === "wheel") {
      const override = primaryNavOverrides.wheel;
      const label = override?.label ?? ch.wheel;
      const path = override?.path ?? "/tools/spin-the-wheel";
      const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : Workflow;
      return (
        <NavLink
          to={path}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "navPrimary",
            navId: "wheel",
            label,
            path,
            iconKey: override?.iconKey ?? null,
          })}
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </NavLink>
      );
    }
    if (id === "radio") {
      const override = primaryNavOverrides.radio;
      const label = override?.label ?? ch.navRadio;
      const path = override?.path ?? "/tools/music";
      const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : Radio;
      return (
        <NavLink
          to={path}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "navPrimary",
            navId: "radio",
            label,
            path,
            iconKey: override?.iconKey ?? null,
          })}
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </NavLink>
      );
    }
    if (id === "leagueStats") {
      const override = primaryNavOverrides.leagueStats;
      const label = override?.label ?? ch.navLeagueStats;
      const path = override?.path ?? "/tools/league-stats";
      const Icon = override?.iconKey ? resolveNavBookmarkIcon(override.iconKey) : Trophy;
      return (
        <NavLink
          to={path}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "navPrimary",
            navId: "leagueStats",
            label,
            path,
            iconKey: override?.iconKey ?? null,
          })}
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </NavLink>
      );
    }
    if (isBookmarkNavId(id)) {
      const bm = navBookmarks[id];
      if (!bm) {
        return null;
      }
      const BmIcon = resolveNavBookmarkIcon(bm.iconKey);
      const ctx = hubContextData({
        type: "navBookmark",
        bookmarkId: id,
        label: bm.label,
        path: bm.path,
      });
      if (isExternalNavPath(bm.path)) {
        return (
          <a
            href={bm.path}
            className={navButtonClassName(false)}
            {...ctx}
            tabIndex={layoutEditMode ? -1 : undefined}
            onClick={(e) => {
              if (layoutEditMode) e.preventDefault();
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BmIcon className="size-3.5 shrink-0" />
            {bm.label}
          </a>
        );
      }
      const toPath = bm.path.startsWith("/") ? bm.path : `/${bm.path}`;
      return (
        <NavLink
          to={toPath}
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...ctx}
        >
          <BmIcon className="size-3.5 shrink-0" />
          {bm.label}
        </NavLink>
      );
    }
    return null;
  };

  const rows: { id: string; node: ReactNode }[] = [];
  for (const id of order) {
    const node = renderItem(id);
    if (node != null) {
      rows.push({ id, node });
    }
  }

  const valueIds = rows.map((r) => r.id);

  const groupClass = isVertical
    ? "flex w-full flex-col gap-1"
    : "flex flex-wrap items-center gap-1";

  const itemClass = (slotIndex: number) =>
    cn(
      "relative touch-none select-none outline-none",
      isVertical ? "w-full max-w-full" : "inline-flex max-w-full",
      !isVertical &&
        slotIndex > 0 &&
        "ms-0.5 ps-1.5 before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-6 before:w-px before:-translate-y-1/2 before:rounded-full before:bg-border/55 before:content-['']",
    );

  return (
    <>
      {layoutEditMode ? (
        <Reorder.Group
          axis={isVertical ? "y" : "x"}
          values={valueIds}
          onReorder={(next) => commitReorderIfChanged(valueIds, next, onReorder, play)}
          as="div"
          className={groupClass}
        >
          {rows.map(({ id, node }, slotIndex) => {
            const affordance = (
              <HubReorderEditAffordance
                key={`nav-aff-${id}-${introNonce}`}
                slotIndex={slotIndex}
                reducedMotion={reducedMotion}
                rowContext={layoutRowContextForId(id)}
                fullWidth={isVertical}
              >
                {node}
              </HubReorderEditAffordance>
            );
            return (
            <Reorder.Item
              key={id}
              value={id}
              as="div"
              layout="position"
              className={itemClass(slotIndex)}
              aria-label={em.shellReorderDragHandleAria(labelForId(id))}
              onContextMenu={(e: ReactMouseEvent<HTMLElement>) => {
                // Framer Motion drag internals call preventDefault on contextmenu to
                // prevent the browser menu — we stop propagation and re-dispatch to
                // the parent layout handler directly so the correct target is used.
                e.stopPropagation();
                onContextMenu?.(e);
              }}
            >
              {affordance}
            </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        <div className={groupClass}>
          {rows.map(({ id, node }) => (
            <div key={id} className={isVertical ? "w-full max-w-full" : "inline-flex max-w-full"}>
              {node}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
