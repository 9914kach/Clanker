import type { HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";
import { HUB_DESKTOP_LAYOUT_GRID } from "@/lib/hub-desktop-layout";
import { createContainerNode, type HubGridContainerStaticChild, type HubGridNodeMap } from "@/lib/hub-grid-node";

export type PublicProfileContainerId =
  | "public-profile.overview"
  | "public-profile.league"
  | "public-profile.steam";

export const PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS: Record<
  PublicProfileContainerId,
  HubDesktopWidgetLayout
> = {
  "public-profile.overview": {
    x: 0,
    y: 0,
    w: 3 * HUB_DESKTOP_LAYOUT_GRID,
    h: 3 * HUB_DESKTOP_LAYOUT_GRID,
    z: 1,
    hidden: false,
  },
  "public-profile.league": {
    x: 3 * HUB_DESKTOP_LAYOUT_GRID,
    y: 0,
    w: 3 * HUB_DESKTOP_LAYOUT_GRID,
    h: 4 * HUB_DESKTOP_LAYOUT_GRID,
    z: 2,
    hidden: false,
  },
  "public-profile.steam": {
    x: 0,
    y: 3 * HUB_DESKTOP_LAYOUT_GRID,
    w: 3 * HUB_DESKTOP_LAYOUT_GRID,
    h: 2 * HUB_DESKTOP_LAYOUT_GRID,
    z: 3,
    hidden: false,
  },
};

const overviewChildren: HubGridContainerStaticChild[] = [
  { id: "status", kind: "staticSection" },
  { id: "games", kind: "staticSection" },
  { id: "more", kind: "staticSection" },
];

const leagueChildren: HubGridContainerStaticChild[] = [{ id: "leagueStats", kind: "staticSection" }];

const steamChildren: HubGridContainerStaticChild[] = [{ id: "steam", kind: "staticSection" }];

export const PUBLIC_PROFILE_NODES: HubGridNodeMap = {
  "public-profile.overview": createContainerNode({
    id: "public-profile.overview",
    geometry: {
      x: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.overview"].x,
      y: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.overview"].y,
      w: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.overview"].w,
      h: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.overview"].h,
      z: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.overview"].z,
    },
    staticChildren: overviewChildren,
  }),
  "public-profile.league": createContainerNode({
    id: "public-profile.league",
    geometry: {
      x: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.league"].x,
      y: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.league"].y,
      w: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.league"].w,
      h: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.league"].h,
      z: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.league"].z,
    },
    staticChildren: leagueChildren,
  }),
  "public-profile.steam": createContainerNode({
    id: "public-profile.steam",
    geometry: {
      x: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.steam"].x,
      y: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.steam"].y,
      w: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.steam"].w,
      h: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.steam"].h,
      z: PUBLIC_PROFILE_CONTAINER_DEFAULT_LAYOUTS["public-profile.steam"].z,
    },
    staticChildren: steamChildren,
  }),
};

export const PUBLIC_PROFILE_CONTAINER_ORDER: readonly PublicProfileContainerId[] = [
  "public-profile.overview",
  "public-profile.league",
  "public-profile.steam",
];
