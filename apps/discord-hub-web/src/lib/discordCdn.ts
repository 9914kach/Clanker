const DEFAULT_AVATAR_COUNT = 6n;

/** Avatar URL; uses default embed avatar when `avatar` is null. */
export function discordAvatarUrl(
  userId: string,
  avatar: string | null,
  size = 128,
): string {
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=${size}`;
  }
  const idx = (BigInt(userId) >> 22n) % DEFAULT_AVATAR_COUNT;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

/** Discord CDN banner URL; animated hashes start with `a_` → `.gif`. */
export function discordBannerUrl(
  userId: string,
  bannerHash: string,
  size = 600,
): string {
  const ext = bannerHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${ext}?size=${size}`;
}

/** `accent_color` from User object: RGB integer → `#rrggbb`. */
export function accentColorToHex(accent: number): string {
  return `#${accent.toString(16).padStart(6, "0")}`;
}
