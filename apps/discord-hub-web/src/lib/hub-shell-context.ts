import type { HubActionTone } from "@/config/hub-actions";
import type { HubShellObjectKind } from "@/lib/hub-shell-object-kinds";

export type HubContextTarget =
  | { type: "shell.surface"; area: "desktop" | "workspace" | "fallback" }
  | { type: "shell.nav"; area: "topbar" | "dock" | "panel" }
  | {
      type: "shell.object";
      kind: HubShellObjectKind;
      objectId: string;
      label: string;
    }
  | {
      type: "shell.identity";
      profileId: string | null;
      profilePath: string | null;
      profileHandle: string | null;
      displayName: string | null;
    }
  | {
      type: "widget";
      widgetId: string;
      widgetLabel: string;
      widgetTone: HubActionTone;
    }
  | {
      type: "tool";
      toolId: string;
      label: string;
      path: string;
      pinned: boolean;
    }
  | {
      type: "profile";
      profileId: string | null;
      profilePath: string | null;
      label: string | null;
      isOwnProfile?: boolean;
    }
  | {
      type: "panel";
      panelId: string;
      panelLabel: string;
    }
  | {
      type: "link";
      href: string;
      label: string | null;
      external: boolean;
    };

export type HubContextMenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  tone?: "default" | "danger" | "chaos";
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type HubContextMenuSection = {
  id: string;
  label?: string;
  items: readonly HubContextMenuItem[];
};

const HUB_CONTEXT_ATTR = "data-hub-context";

function parseTarget(value: string | null): HubContextTarget | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!("type" in parsed) || typeof parsed.type !== "string") {
      return null;
    }
    return parsed as HubContextTarget;
  } catch {
    return null;
  }
}

export function hubContextData(target: HubContextTarget): Record<string, string> {
  return {
    [HUB_CONTEXT_ATTR]: JSON.stringify(target),
  };
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function resolveAnchorTarget(anchor: HTMLAnchorElement): HubContextTarget {
  const label = anchor.textContent?.trim() || anchor.getAttribute("aria-label") || anchor.title || null;

  try {
    const url = new URL(anchor.href, window.location.href);
    const external = url.origin !== window.location.origin;

    if (!external && url.pathname.startsWith("/u/")) {
      const profileId = decodeURIComponent(url.pathname.slice(3));
      return {
        type: "profile",
        profileId: profileId || null,
        profilePath: `${url.pathname}${url.search}${url.hash}`,
        label,
      };
    }

    return {
      type: "link",
      href: external ? url.toString() : `${url.pathname}${url.search}${url.hash}`,
      label,
      external,
    };
  } catch {
    return {
      type: "link",
      href: anchor.href,
      label,
      external: false,
    };
  }
}

export function resolveHubContextTarget(target: EventTarget | null): HubContextTarget {
  if (!(target instanceof Element)) {
    return { type: "shell.surface", area: "fallback" };
  }

  const explicitTarget = target.closest<HTMLElement>(`[${HUB_CONTEXT_ATTR}]`);
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (anchor && (!explicitTarget || (explicitTarget !== anchor && explicitTarget.contains(anchor)))) {
    return resolveAnchorTarget(anchor);
  }

  const parsedExplicitTarget = parseTarget(explicitTarget?.getAttribute(HUB_CONTEXT_ATTR) ?? null);
  if (parsedExplicitTarget) {
    return parsedExplicitTarget;
  }

  if (anchor) {
    return resolveAnchorTarget(anchor);
  }

  return { type: "shell.surface", area: "fallback" };
}
