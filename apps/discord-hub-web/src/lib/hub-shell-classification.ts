import type { HubContextTarget } from "@/lib/hub-shell-context";
import type { HubShellObjectKind } from "@/lib/hub-shell-object-kinds";

export type HubEntityClass =
  | "shellFixed"
  | "shellReorderable"
  | "shellConfigurable"
  | "surfaceWidget"
  | "surfaceContainer"
  | "routeContent";

export type HubEntityCapabilities = {
  editableInLayout: boolean;
  reorderable: boolean;
  movable: boolean;
  resizable: boolean;
  hideable: boolean;
  dashboardOnlyEditing: boolean;
};

export type HubPolicyOwner =
  | "shell-core"
  | "shell-nav"
  | "shell-prefs"
  | "route-surface"
  | "route-feature";

export type HubInteractionMode = "normal" | "layout";

export type HubClassification = {
  category: HubEntityClass;
  targetType: HubContextTarget["type"];
  entityId: string;
  owner: HubPolicyOwner;
  persistenceScope: string;
};

const CAPS: Record<HubEntityClass, HubEntityCapabilities> = {
  shellFixed: {
    editableInLayout: false,
    reorderable: false,
    movable: false,
    resizable: false,
    hideable: false,
    dashboardOnlyEditing: false,
  },
  shellReorderable: {
    editableInLayout: true,
    reorderable: true,
    movable: false,
    resizable: false,
    hideable: false,
    dashboardOnlyEditing: false,
  },
  shellConfigurable: {
    editableInLayout: true,
    reorderable: false,
    movable: false,
    resizable: false,
    hideable: false,
    dashboardOnlyEditing: false,
  },
  surfaceWidget: {
    editableInLayout: true,
    reorderable: false,
    movable: true,
    resizable: true,
    hideable: true,
    dashboardOnlyEditing: true,
  },
  surfaceContainer: {
    editableInLayout: true,
    reorderable: false,
    movable: true,
    resizable: true,
    hideable: false,
    dashboardOnlyEditing: false,
  },
  routeContent: {
    editableInLayout: false,
    reorderable: false,
    movable: false,
    resizable: false,
    hideable: false,
    dashboardOnlyEditing: false,
  },
};

function classifyShellObjectKind(kind: HubShellObjectKind): HubEntityClass {
  if (kind === "brandBlock") {
    return "shellFixed";
  }
  if (kind === "navGroup") {
    return "shellReorderable";
  }
  if (kind === "dockBar" || kind === "utilityZone") {
    return "shellConfigurable";
  }
  if (kind === "desktopZone") {
    return "surfaceContainer";
  }
  return "routeContent";
}

function ownerForClass(entityClass: HubEntityClass): HubPolicyOwner {
  if (entityClass === "shellFixed") {
    return "shell-core";
  }
  if (entityClass === "shellReorderable") {
    return "shell-nav";
  }
  if (entityClass === "shellConfigurable") {
    return "shell-prefs";
  }
  if (entityClass === "surfaceWidget" || entityClass === "surfaceContainer") {
    return "route-surface";
  }
  return "route-feature";
}

function persistenceScopeForTarget(target: HubContextTarget): string {
  if (target.type === "widget") {
    return "layout.surface";
  }
  if (target.type === "navPrimary" || target.type === "navBookmark") {
    return "layout.shell.nav";
  }
  if (target.type === "tool") {
    return "prefs.shell.dock";
  }
  if (target.type === "shell.identity" || target.type === "profile") {
    return "session.profile";
  }
  if (target.type === "shell.surface" || target.type === "panel") {
    return "runtime.route";
  }
  if (target.type === "shell.object") {
    return `layout.shell.object.${target.kind}`;
  }
  return "runtime.none";
}

function entityIdForTarget(target: HubContextTarget): string {
  if (target.type === "widget") {
    return `widget:${target.widgetId}`;
  }
  if (target.type === "tool") {
    return `tool:${target.toolId}`;
  }
  if (target.type === "navPrimary") {
    return `navPrimary:${target.navId}`;
  }
  if (target.type === "navBookmark") {
    return `navBookmark:${target.bookmarkId}`;
  }
  if (target.type === "panel") {
    return `panel:${target.panelId}`;
  }
  if (target.type === "shell.object") {
    return `shell.object:${target.objectId}`;
  }
  if (target.type === "shell.nav") {
    return `shell.nav:${target.area}`;
  }
  if (target.type === "shell.surface") {
    return `shell.surface:${target.area}`;
  }
  if (target.type === "shell.identity") {
    return `shell.identity:${target.profileId ?? "guest"}`;
  }
  if (target.type === "profile") {
    return `profile:${target.profileId ?? "unknown"}`;
  }
  if (target.type === "link") {
    return `link:${target.href}`;
  }
  return "routeContent";
}

function isDashboardRoute(route: string): boolean {
  return route === "/dashboard";
}

function classifyCategoryFromTarget(target: HubContextTarget): HubEntityClass {
  if (target.type === "shell.object") {
    return classifyShellObjectKind(target.kind);
  }
  if (target.type === "widget") {
    return "surfaceWidget";
  }
  if (target.type === "navPrimary") {
    return "shellReorderable";
  }
  if (target.type === "navBookmark" || target.type === "tool" || target.type === "panel" || target.type === "shell.nav") {
    return "shellConfigurable";
  }
  if (target.type === "shell.surface") {
    return target.area === "desktop" ? "surfaceContainer" : "routeContent";
  }
  if (target.type === "shell.identity" || target.type === "profile" || target.type === "link") {
    return "routeContent";
  }
  return "routeContent";
}

/**
 * Canonical policy classifier (Step A contract).
 * Route is accepted now so we can evolve route-aware classification
 * without changing call signatures in Step B/C/D.
 */
export function classifyTarget(target: HubContextTarget, route: string): HubClassification {
  const category = classifyCategoryFromTarget(target);
  const persistenceScope = persistenceScopeForTarget(target);
  const owner = ownerForClass(category);
  const entityId = entityIdForTarget(target);

  // Keep route parameter as part of policy boundary for future rules.
  void route;

  return {
    category,
    targetType: target.type,
    entityId,
    owner,
    persistenceScope,
  };
}

export function getCapabilities(
  classification: HubClassification,
  mode: HubInteractionMode,
  route = "/",
): HubEntityCapabilities {
  const base = capabilitiesForCategory(classification.category);
  if (mode !== "layout") {
    return {
      ...base,
      editableInLayout: false,
      reorderable: false,
      hideable: false,
    };
  }

  if (base.dashboardOnlyEditing && !isDashboardRoute(route)) {
    return {
      ...base,
      editableInLayout: false,
      reorderable: false,
      movable: false,
      resizable: false,
      hideable: false,
    };
  }

  return base;
}

export function isEditable(target: HubContextTarget, route: string, mode: HubInteractionMode): boolean {
  const classification = classifyTarget(target, route);
  return getCapabilities(classification, mode, route).editableInLayout;
}

function capabilitiesForCategory(entityClass: HubEntityClass): HubEntityCapabilities {
  return CAPS[entityClass];
}
