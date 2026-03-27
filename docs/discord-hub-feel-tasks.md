# Discord Hub — Vision Feel Task Backlog

This backlog turns `docs/CLANKER_VISION.md` into concrete tasks that move the **feel** of the Discord hub toward the target identity: useful + social + chaos, with a warm "community OS" vibe.

## How to use this backlog

- Prioritize top-to-bottom within each phase.
- Keep each task small enough to ship in 1 PR.
- Mark done tasks with date + PR number for momentum and traceability.

---

## Phase 1 — Identity foundation (make it feel like *our place*)

### 1) Voice & microcopy system
- [ ] Add a `hub-copy-tone` guide and apply it to key strings (dashboard hero, empty states, toasts, loading/error text).
- [ ] Replace generic UX strings (e.g. "No data", "Saved") with characterful Neutralen-flavored variants.
- [ ] Add at least 3 copy variants for recurring states (save success, sync fail, empty widgets) and rotate lightly.

**Acceptance signals**
- 80% of major visible text in dashboard shell follows tone guide.
- No default/generic placeholder copy in primary routes.

### 2) Rotating live text rail
- [ ] Add a "live text" component in the shell (ticker/banner) with rotating categories: quotes, meme headlines, system drama, status blurbs.
- [ ] Pull text from local seeded data first; make source pluggable for API later.
- [ ] Add freshness rules (cadence, dedupe, cooldown) so it feels alive but not noisy.

**Acceptance signals**
- Live text updates automatically on a timer.
- At least 4 text categories are represented.

### 3) Motion language pass
- [ ] Define standard motion tokens: subtle hover, open/close, celebration pulse, error wobble.
- [ ] Apply them consistently to dock, widgets, context menus, and toasts.
- [ ] Respect reduced-motion preference and include a prefs toggle.

**Acceptance signals**
- Shared motion behavior across major shell components.
- Reduced-motion users get calmer transitions with no jank.

### 4) Notification personality layer
- [ ] Create notification styles: normal, social, chaos, rare-event.
- [ ] Add playful/iconic phrasing + sound hooks (muted by default if needed).
- [ ] Add rarity controls so high-chaos notifications stay special.

**Acceptance signals**
- Notification events can pick style + tone explicitly.
- Rare category triggers significantly less than normal/social.

### 5) Empty-state personality sweep
- [ ] Implement expressive empty states for all dashboard modules (links, quotes, wheel, profile widgets).
- [ ] Include one clear CTA + one humorous flavor line per empty state.
- [ ] Ensure empty states teach what to do next.

**Acceptance signals**
- No blank/sterile empty container in main hub routes.
- Empty states contain both utility (next step) and personality.

---

## Phase 2 — Useful + social core modules

### 6) Quotes hub (Neutralen Says) v1
- [ ] Ship quote list/create/vote/random surfaces in one coherent module.
- [ ] Add "Quote of the day" placement in shell.
- [ ] Add profile tie-ins: "most quoted" and recent quote highlights.

**Acceptance signals**
- Users can add, browse, and vote quotes end-to-end.
- Quote of the day appears in at least one persistent shell location.

### 7) Link hub v1 (culture-preserving utility)
- [ ] Build ingest + dedupe + tag flow for shared links.
- [ ] Add reactions: save, cursed, weekly-gold nomination.
- [ ] Add sorting views (recent, top, cursed).

**Acceptance signals**
- Duplicate links collapse into one canonical entry.
- Reactions visibly influence sorting/highlighting.

### 8) Hall of Fame / Lore archive v1
- [ ] Create lore entry type system (quote, screenshot, clip, event).
- [ ] Add "save to lore" actions from context menus where relevant.
- [ ] Add timeline or era filters (by month/season/event).

**Acceptance signals**
- At least 3 content types can be stored and browsed together.
- Lore can be populated from other modules, not only manual entry.

---

## Phase 3 — Community OS shell depth

### 9) Context-menu expansion pass
- [ ] Add domain-specific right-click actions for profiles, links, and dashboard surface.
- [ ] Include useful + social + absurd actions per menu (balanced by rarity).
- [ ] Log action analytics to evaluate which interactions feel sticky.

**Acceptance signals**
- Profile/link/surface menus each contain at least one useful, one social, one playful action.
- Menu actions are instrumented for usage tracking.

### 10) Command palette personality mode
- [ ] Add aliases and playful command names (with serious fallback commands preserved).
- [ ] Add hidden/lightly discoverable commands for lore and chaos actions.
- [ ] Show contextual suggestions based on time/activity.

**Acceptance signals**
- Command palette supports both practical and playful command pathways.
- At least 5 non-generic commands map to real actions.

### 11) Dock/widgets coherence pass
- [ ] Define canonical widget behavior (pin, reorder, collapse, alert states).
- [ ] Introduce 2–3 tiny ambient widgets (clock mood, sinner-of-day, chaos meter).
- [ ] Ensure widget chrome feels handcrafted (not default UI library look).

**Acceptance signals**
- Widgets share consistent chrome/interactions.
- At least one ambient widget updates dynamically by time/randomness.

---

## Phase 4 — Social presence + multiplayer proof

### 12) Lightweight presence layer
- [ ] Show who is currently active in the hub shell and selected modules.
- [ ] Add soft-presence cues ("X is editing wheel", "Y is viewing quote board").
- [ ] Keep visual treatment subtle and non-intrusive.

**Acceptance signals**
- Presence is visible in at least shell + one module.
- Presence updates live without manual refresh.

### 13) Shared wheel polish (multiplayer showcase)
- [ ] Add collaborative presence avatars/cursors in wheel editor.
- [ ] Add live event toasts (join, spin start, result celebration).
- [ ] Add anti-chaos guardrails (cooldowns/role checks) to avoid griefing.

**Acceptance signals**
- Multiple users can visibly co-edit in real time.
- Collaboration feels fun, clear, and stable under rapid updates.

### 14) Social reactions mini-layer
- [ ] Add quick reactions on shared objects (quote, link, wheel result, lore post).
- [ ] Add floating microfeedback animations for reactions.
- [ ] Add anti-spam constraints and aggregation rules.

**Acceptance signals**
- Reactions can be sent and seen live by other users.
- Reaction spam is rate-limited and visually aggregated.

---

## Phase 5 — Curated chaos (memorable but not exhausting)

### 15) Chaos event scheduler
- [ ] Implement frequency tiers: always-on, sometimes, rare.
- [ ] Create a config-driven event registry so chaos can be tuned without code edits.
- [ ] Add global kill-switch + per-user opt-outs.

**Acceptance signals**
- Chaos events are controlled by explicit rarity rules.
- Admin/user safety controls work and are discoverable.

### 16) Seasonal/date-based modes
- [ ] Add date-triggered skins or micro-events (weekend night mode, special dates).
- [ ] Keep overrides subtle and reversible.
- [ ] Add retrospective logging to evaluate delight vs annoyance.

**Acceptance signals**
- At least one date-based mode activates automatically.
- Users can disable seasonal effects in preferences.

### 17) Easter eggs and hidden routes
- [ ] Add a small set of discoverable secrets tied to Neutralen lore.
- [ ] Gate spoilers and avoid exposing all secrets in code comments/UI.
- [ ] Add non-invasive hints so discovery feels intentional.

**Acceptance signals**
- At least 3 easter eggs exist across shell/modules.
- Discovery telemetry confirms at least some organic finds.

---

## Cross-cutting quality guardrails (apply in every phase)

### 18) "Useful + social + charm" PR checklist
- [ ] Add a PR template checkbox: does this change include utility, social signal, or charm impact?
- [ ] Require at least one explicit "feel" note in every user-facing PR.

### 19) Default component detox
- [ ] Audit all visible shadcn defaults and style tokens.
- [ ] Replace template-looking surfaces with Clanker-specific visual language.

### 20) Feel telemetry and review ritual
- [ ] Track a few lightweight metrics: session return, playful action usage, command palette usage, chaos dismiss rate.
- [ ] Run a monthly "does this still feel like us?" review with screenshots and examples.

---

## Suggested execution order (next 6–8 weeks)

1. Tasks **1 → 5** (identity + shell feel baseline)
2. Tasks **6 + 7** (strong useful wins)
3. Tasks **9 + 11 + 10** (community OS coherence)
4. Task **13** (multiplayer wow factor)
5. Tasks **15 + 16** (controlled chaos)

This order aims to make the hub feel distinct quickly while still shipping practical value.
