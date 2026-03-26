import { useCallback, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMotionValue, useSpring } from "framer-motion";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type HubMildSpringFollowOptions = {
  enabled: boolean;
  /** While true, stop tracking and spring back (e.g. widget drag in progress). */
  pause: boolean;
  /** Max offset in px — keep low for a mild feel. */
  maxOffsetPx?: number;
};

/**
 * Two layers following the same target with different springs (tighter vs looser),
 * similar idea to Motion’s “multi follow pointer with spring” — kept very subtle for hub chrome/widgets.
 */
export function useHubMildMultiSpringFollow({
  enabled,
  pause,
  maxOffsetPx = 3,
}: HubMildSpringFollowOptions) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const tight = { stiffness: 340, damping: 34, mass: 0.32 };
  const loose = { stiffness: 88, damping: 22, mass: 0.4 };

  const tightX = useSpring(rawX, tight);
  const tightY = useSpring(rawY, tight);
  const looseX = useSpring(rawX, loose);
  const looseY = useSpring(rawY, loose);

  const reset = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  useEffect(() => {
    if (!enabled || pause) {
      reset();
    }
  }, [enabled, pause, reset]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (!enabled || pause) {
        return;
      }
      const el = event.currentTarget;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) {
        return;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const nx = (event.clientX - cx) / (r.width * 0.5);
      const ny = (event.clientY - cy) / (r.height * 0.5);
      rawX.set(clamp(nx * maxOffsetPx, -maxOffsetPx, maxOffsetPx));
      rawY.set(clamp(ny * maxOffsetPx, -maxOffsetPx, maxOffsetPx));
    },
    [enabled, pause, rawX, rawY, maxOffsetPx],
  );

  const onPointerLeave = useCallback(() => {
    if (!pause) {
      reset();
    }
  }, [pause, reset]);

  const onPointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  return {
    onPointerMove,
    onPointerLeave,
    onPointerCancel,
    tight: { x: tightX, y: tightY },
    loose: { x: looseX, y: looseY },
    reset,
  };
}
