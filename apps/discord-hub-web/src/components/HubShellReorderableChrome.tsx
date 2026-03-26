import type { ReactNode } from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { GripVertical, LayoutPanelTop, Workflow } from "lucide-react";
import { NavLink } from "react-router-dom";
import { motion, Reorder, useReducedMotion } from "framer-motion";
import { cn } from "@clanker/ui/lib/utils";
import type { HubCopy } from "@/i18n/hub-copy";
import { HUB_EASE_OUT } from "@/lib/hub-motion";
import { hubContextData } from "@/lib/hub-shell-context";
import type { HubNavBookmark } from "@/lib/hub-nav-bookmarks";
import { isBookmarkNavId, isExternalNavPath } from "@/lib/hub-nav-bookmarks";
import { resolveNavBookmarkIcon } from "@/lib/hub-nav-bookmark-icons";
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
  children,
}: {
  slotIndex: number;
  reducedMotion: boolean;
  children: ReactNode;
}) {
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

  if (reducedMotion) {
    return (
      <div
        className={cn(
          "group inline-flex max-w-full cursor-grab items-stretch gap-0.5 active:cursor-grabbing",
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
      className={cn(
        "group inline-flex max-w-full cursor-grab items-stretch gap-0.5 will-change-transform active:cursor-grabbing",
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
  profileId,
  pinnedIds,
  navBookmarks,
}: {
  order: readonly string[];
  onReorder: (next: string[]) => void;
  layoutEditMode: boolean;
  play: HubPlay;
  copy: HubCopy;
  navButtonClassName: (isActive: boolean) => string;
  profilePath: string | null;
  profileId: string | null;
  pinnedIds: readonly string[];
  navBookmarks: Readonly<Record<string, HubNavBookmark>>;
}) {
  const em = copy.editMode;
  const ch = copy.chrome;
  const reducedMotion = useReducedMotion() ?? false;
  const introNonce = useLayoutEditIntroNonce(layoutEditMode);

  const labelForId = (id: string): string => {
    if (id === "desktop") {
      return ch.navDesktop;
    }
    if (id === "profile") {
      return profilePath ? ch.myProfile : ch.myProfileOffline;
    }
    if (id === "settings") {
      return ch.settings;
    }
    if (id === "wheel") {
      return ch.wheel;
    }
    if (isBookmarkNavId(id)) {
      return navBookmarks[id]?.label ?? id;
    }
    return id;
  };

  const renderItem = (id: string): ReactNode => {
    const anchorDraggable = layoutEditMode ? false : undefined;

    if (id === "desktop") {
      return (
        <NavLink
          to="/dashboard"
          end
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "tool",
            toolId: "desktop",
            label: ch.toolDesktop,
            path: "/dashboard",
            pinned: true,
          })}
        >
          <LayoutPanelTop className="size-3.5 shrink-0" />
          {ch.navDesktop}
        </NavLink>
      );
    }
    if (id === "profile") {
      if (profilePath) {
        return (
          <NavLink
            to={profilePath}
            draggable={anchorDraggable}
            tabIndex={layoutEditMode ? -1 : undefined}
            onClick={(e) => {
              if (layoutEditMode) e.preventDefault();
            }}
            className={({ isActive }) => navButtonClassName(isActive)}
            {...hubContextData({
              type: "profile",
              profileId,
              profilePath,
              label: ch.myProfile,
              isOwnProfile: true,
            })}
          >
            {ch.myProfile}
          </NavLink>
        );
      }
      return (
        <span className={cn(navButtonClassName(false), layoutEditMode && "select-none")}>
          {ch.myProfileOffline}
        </span>
      );
    }
    if (id === "settings") {
      return (
        <NavLink
          to="/profile/settings"
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "panel",
            panelId: "settings",
            panelLabel: ch.panelSettings.label,
          })}
        >
          {ch.settings}
        </NavLink>
      );
    }
    if (id === "wheel") {
      return (
        <NavLink
          to="/tools/spin-the-wheel"
          draggable={anchorDraggable}
          tabIndex={layoutEditMode ? -1 : undefined}
          onClick={(e) => {
            if (layoutEditMode) e.preventDefault();
          }}
          className={({ isActive }) => navButtonClassName(isActive)}
          {...hubContextData({
            type: "tool",
            toolId: "spin-the-wheel",
            label: ch.panelWheel.label,
            path: "/tools/spin-the-wheel",
            pinned: pinnedIds.includes("spin-the-wheel"),
          })}
        >
          <Workflow className="size-3.5 shrink-0" />
          {ch.wheel}
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

  const rows = order
    .map((id) => {
      const node = renderItem(id);
      return node ? { id, node } : null;
    })
    .filter((row): row is { id: string; node: ReactNode } => row !== null);

  const valueIds = rows.map((r) => r.id);

  return (
    <>
      {layoutEditMode ? (
        <Reorder.Group
          axis="x"
          values={valueIds}
          onReorder={(next) => commitReorderIfChanged(valueIds, next, onReorder, play)}
          as="div"
          className="flex flex-wrap items-center gap-1"
        >
          {rows.map(({ id, node }, slotIndex) => {
            const bm = isBookmarkNavId(id) ? navBookmarks[id] : undefined;
            const bookmarkPayload =
              bm != null
                ? ({
                    type: "navBookmark" as const,
                    bookmarkId: id,
                    label: bm.label,
                    path: bm.path,
                  })
                : null;
            const affordance = (
              <HubReorderEditAffordance
                key={`nav-aff-${id}-${introNonce}`}
                slotIndex={slotIndex}
                reducedMotion={reducedMotion}
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
              className={cn(
                "relative inline-flex max-w-full touch-none select-none outline-none",
                slotIndex > 0 &&
                  "ms-0.5 ps-1.5 before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-6 before:w-px before:-translate-y-1/2 before:rounded-full before:bg-border/55 before:content-['']",
              )}
              aria-label={em.shellReorderDragHandleAria(labelForId(id))}
            >
              {bookmarkPayload ? (
                <div
                  {...hubContextData(bookmarkPayload)}
                  className="flex min-w-0 max-w-full flex-1"
                >
                  {affordance}
                </div>
              ) : (
                affordance
              )}
            </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {rows.map(({ id, node }) => (
            <div key={id} className="inline-flex max-w-full">
              {node}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
