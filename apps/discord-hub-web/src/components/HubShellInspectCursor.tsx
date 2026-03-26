import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@clanker/ui/lib/utils";
import {
  inspectCursorCssColor,
  type HubInspectCursorPrefsSlice,
} from "@/lib/hub-prefs";

function CursorGlyph({
  preset,
  className,
}: {
  preset: HubInspectCursorPrefsSlice["preset"];
  className?: string;
}) {
  switch (preset) {
    case "dot":
      return (
        <svg
          className={cn("block overflow-visible", className)}
          width={20}
          height={20}
          viewBox="0 0 32 32"
          aria-hidden
        >
          <circle cx="16" cy="16" r="5" fill="currentColor" />
        </svg>
      );
    case "ring":
      return (
        <svg
          className={cn("block overflow-visible", className)}
          width={28}
          height={28}
          viewBox="0 0 32 32"
          aria-hidden
        >
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "bracket":
      return (
        <svg
          className={cn("block overflow-visible", className)}
          width={32}
          height={32}
          viewBox="0 0 36 36"
          aria-hidden
        >
          <path
            d="M 10 10 L 10 22 M 10 10 L 22 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 26 26 L 26 14 M 26 26 L 14 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "crosshair":
    default:
      return (
        <svg
          className={cn("block overflow-visible", className)}
          width={36}
          height={36}
          viewBox="0 0 32 32"
          aria-hidden
        >
          <line x1="16" y1="3" x2="16" y2="29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

/**
 * Följer pekaren när dev-läget med webbläsarens högerklick/Inspect är aktivt.
 * Utseende styrs av {@link HubInspectCursorPrefsSlice} (preset, tema-färg, storlek).
 */
export default function HubShellInspectCursor({
  active,
  prefs,
}: {
  active: boolean;
  prefs: HubInspectCursorPrefsSlice;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const sample = useCallback((clientX: number, clientY: number) => {
    setPos({ x: clientX, y: clientY });
  }, []);

  /** Direkt synlig pekare: html har redan cursor:none — undvik tom skärm innan första pointermove. */
  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") {
      return;
    }
    setPos({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    });
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const onMove = (e: PointerEvent | MouseEvent) => {
      sample(e.clientX, e.clientY);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true, capture: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onMove, { capture: true });
    };
  }, [active, sample]);

  if (!active) {
    return null;
  }

  const scale = prefs.sizePercent / 100;
  const color = inspectCursorCssColor(prefs);

  const node = (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[2147483647]"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -50%)",
        color,
      }}
      aria-hidden
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <CursorGlyph preset={prefs.preset} />
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
