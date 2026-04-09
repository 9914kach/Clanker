/** Poll bot music state often while the tab is visible; back off in background. */
export const HUB_MUSIC_POLL_VISIBLE_MS = 1_000;
export const HUB_MUSIC_POLL_HIDDEN_MS = 8_000;

export function hubMusicPollIntervalMs(): number {
  return typeof document !== "undefined" && document.hidden ? HUB_MUSIC_POLL_HIDDEN_MS : HUB_MUSIC_POLL_VISIBLE_MS;
}
