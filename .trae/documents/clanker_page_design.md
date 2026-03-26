# Page Design Spec (desktop-first)

## Global Styles (applies to all pages)
- Layout system: CSS Grid for shell regions + Flexbox inside components.
- Theme: shadcn tokens + palette switching (keep `html[data-palette=…]` approach).
- Typography: 1) system UI for general text; 2) optional “OS flavor” mono palette for special modes.
- Motion: Framer Motion with a small set of shared variants (`enter`, `hover`, `press`, `toast`). Respect `prefers-reduced-motion`.
- Interaction: “warm” hover states (slight lift + glow), playful microcopy, occasional rare variants.

## 1) Home
- Meta: title “Clanker”; description “Neutralen’s community OS.”
- Structure: centered hero + short pitch; primary CTA “Log in with Discord”; secondary CTA “View profiles”.
- Components:
  - Hero block: logo/wordmark + one-line “alive” subtext (rotating live line).
  - Footer: small “build stamp” / version label.

## 2) Login
- Meta: title “Login – Clanker”.
- Structure: single card, clear OAuth CTA.
- Components:
  - OAuth button (Discord branding) + short explanation.
  - Error/empty states written in the house voice (helpful + slightly dramatic).

## 3) Hub Shell (wraps authenticated pages)
- Meta: title per route; consistent OG image later.
- Layout: sticky top “system bar” + main content container.
- Components (core shell):
  - Header identity strip: avatar, display name, quick actions (theme toggle, logout).
  - Primary nav: Menubar-style links + “Tools” menu.
  - Live text: ticker slot with 2 densities (top + compact).
  - Notifications area (future): global toaster anchored top-right; used for successes/errors and “sometimes/rare” flavor.
  - Context menus (future): right-click on key objects (profile cards, link cards, wheel participants).

## 4) Dashboard
- Meta: title “Dashboard – Clanker”.
- Structure: stacked sections; first section establishes mood + status; second is module grid.
- Components:
  - Page header: animated entrance, friendly one-liner.
  - Status widgets: Discord bot/guild health card (already present).
  - Module cards grid: “Spin the Wheel”, “Profile”, “Upcoming modules”. Each card includes: useful hook + tiny charm element (icon, microcopy).

## 5) Spin the Wheel
- Meta: title “Spin the Wheel – Clanker”.
- Structure: two-column layout (controls left, outputs right).
- Components:
  - Participants input: textarea + removable chips.
  - Wheel panel: animated wheel, “selected player” readout.
  - Teams panel: cards per team.
  - Saved groups + recent sessions: list rows with primary action + secondary action.
  - Context menu hooks (future): right-click participant chip for actions (remove, “mark cursed”, “pin”).

## 6) Public Profile + Profile Settings
- Meta: title “@username – Clanker”.
- Public profile structure: banner, avatar, identity stats, linked modules (e.g., game data).
- Settings structure: grouped sections with clear headings; inline save feedback via notifications.
