/**
 * Taxonomy for shell-managed UI objects (Neutralen OS).
 * Use at sensible boundaries — not every DOM node.
 */
export type HubShellObjectKind =
  | "navGroup"
  | "brandBlock"
  | "dockBar"
  | "routePanel"
  | "desktopZone"
  | "utilityZone";
