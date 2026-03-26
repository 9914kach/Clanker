import type { TargetAndTransition } from "framer-motion";

export const HUB_EASE_OUT: readonly [number, number, number, number] = [
  0.22,
  1,
  0.36,
  1,
];

/** 0 = snappier, 100 = default hub timings. */
export function hubMotionDurationScale(animationIntensity: number): number {
  const t = Math.max(0, Math.min(100, animationIntensity)) / 100;
  return 0.35 + t * 0.65;
}

export function hubEnterMotion(
  reducedMotion: boolean,
  y = 10,
  durationScale = 1,
): {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  transition?: { duration: number; ease: readonly [number, number, number, number] };
} {
  if (reducedMotion) {
    return {};
  }

  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.24 * durationScale, ease: HUB_EASE_OUT },
  };
}

export function hubPopMotion(
  reducedMotion: boolean,
  durationScale = 1,
): {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  transition?: { duration: number; ease: readonly [number, number, number, number] };
} {
  if (reducedMotion) {
    return {};
  }

  return {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
    transition: { duration: 0.18 * durationScale, ease: HUB_EASE_OUT },
  };
}
