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
      type: "navPrimary";
      navId: string;
      label: string;
      path: string;
      iconKey?: string | null;
    }
  | {
      type: "navBookmark";
      bookmarkId: string;
      label: string;
      path: string;
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
  children?: readonly HubContextMenuItem[];
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
  let el: Element | null = null;
  if (target instanceof Element) {
    el = target;
  } else if (target instanceof Node) {
    el = target.parentElement;
  }
  if (!el) {
    return { type: "shell.surface", area: "fallback" };
  }

  // Walk from the clicked element outward. Stop at the first element that
  // carries data-hub-context OR is an <a href>. This makes the closest
  // annotated wrapper (e.g. a drag-affordance div) take precedence over an
  // ancestor anchor that is further away in the tree.
  let cur: Element | null = el;
  while (cur !== null) {
    // Explicit annotation wins immediately.
    const ctxAttr = cur.getAttribute(HUB_CONTEXT_ATTR);
    if (ctxAttr !== null) {
      const parsed = parseTarget(ctxAttr);
      if (parsed) {
        return parsed;
      }
    }

    // Unannotated anchor: derive target from href.
    if (cur.tagName === "A" && cur.hasAttribute("href")) {
      return resolveAnchorTarget(cur as HTMLAnchorElement);
    }

    cur = cur.parentElement;
  }

  return { type: "shell.surface", area: "fallback" };
}
