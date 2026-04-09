import { useEffect, useState } from "react";

export type MusicArtTextTone = "light-text" | "dark-text";

/**
 * Chooses light vs dark ink for text on the full-bleed now-playing card by
 * sampling the cover (right-hand band, where title/artist sit in LTR layout).
 * Approximates the black / theme overlays used on the card.
 */
export function useMusicArtTextTone(
  thumbnailUrl: string | null,
  /** Re-run when UI theme changes (light/dark overlays differ). */
  themeRevision: string,
): MusicArtTextTone {
  const [tone, setTone] = useState<MusicArtTextTone>("light-text");

  useEffect(() => {
    if (!thumbnailUrl) {
      setTone("light-text");
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    const measure = () => {
      if (cancelled) return;
      const isDarkDoc = document.documentElement.classList.contains("dark");
      try {
        const w = 56;
        const h = 56;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const x0 = Math.floor(w * 0.28);
        const { data } = ctx.getImageData(x0, 0, w - x0, h);
        let sum = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const avg = n > 0 ? sum / n : 128;
        const L = avg / 255;
        const composite = isDarkDoc ? L * 0.34 + 0.06 : L * 0.47;
        const useDarkText = composite > 0.36;
        if (!cancelled) setTone(useDarkText ? "dark-text" : "light-text");
      } catch {
        if (!cancelled) setTone("light-text");
      }
    };

    img.onload = measure;
    img.onerror = () => {
      if (!cancelled) setTone("light-text");
    };
    img.src = thumbnailUrl;

    return () => {
      cancelled = true;
    };
  }, [thumbnailUrl, themeRevision]);

  return tone;
}
