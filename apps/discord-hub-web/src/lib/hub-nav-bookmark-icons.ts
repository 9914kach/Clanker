import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bookmark,
  Heart,
  Home,
  LayoutDashboard,
  Link2,
  Search,
  Settings,
  Star,
  User,
  Workflow,
  Zap,
} from "lucide-react";

export const HUB_NAV_BOOKMARK_ICON_KEYS = [
  "Bookmark",
  "Home",
  "Settings",
  "Workflow",
  "Star",
  "LayoutDashboard",
  "User",
  "Search",
  "Link2",
  "Bell",
  "Heart",
  "Zap",
] as const;

export type HubNavBookmarkIconKey = (typeof HUB_NAV_BOOKMARK_ICON_KEYS)[number];

const ALLOWED = new Set<string>(HUB_NAV_BOOKMARK_ICON_KEYS);

const NAV_BOOKMARK_ICON_MAP: Record<HubNavBookmarkIconKey, LucideIcon> = {
  Bookmark,
  Home,
  Settings,
  Workflow,
  Star,
  LayoutDashboard,
  User,
  Search,
  Link2,
  Bell,
  Heart,
  Zap,
};

export function normalizeNavBookmarkIconKey(raw: unknown): HubNavBookmarkIconKey {
  if (typeof raw === "string" && ALLOWED.has(raw)) {
    return raw as HubNavBookmarkIconKey;
  }
  return "Bookmark";
}

export function resolveNavBookmarkIcon(key: HubNavBookmarkIconKey): LucideIcon {
  return NAV_BOOKMARK_ICON_MAP[key];
}
