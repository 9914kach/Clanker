import type { HubSnapStrength } from "@/lib/hub-desktop-layout";
import { snapCoord } from "@/lib/hub-desktop-layout";

export type Rect = { x: number; y: number; w: number; h: number };

export type GuideLines = { vertical: number[]; horizontal: number[] };

export const GUIDE_THRESHOLD = 6;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function collectGuideLines(
  preview: Rect,
  others: readonly Rect[],
  threshold: number,
): GuideLines {
  const vertical = new Set<number>();
  const horizontal = new Set<number>();
  const pl = preview.x;
  const pr = preview.x + preview.w;
  const pcx = preview.x + preview.w / 2;
  const pt = preview.y;
  const pb = preview.y + preview.h;
  const pcy = preview.y + preview.h / 2;

  for (const o of others) {
    const ol = o.x;
    const or = o.x + o.w;
    const ocx = o.x + o.w / 2;
    const ot = o.y;
    const ob = o.y + o.h;
    const ocy = o.y + o.h / 2;

    if (Math.abs(pl - ol) < threshold) {
      vertical.add(ol);
    }
    if (Math.abs(pl - or) < threshold) {
      vertical.add(or);
    }
    if (Math.abs(pr - ol) < threshold) {
      vertical.add(ol);
    }
    if (Math.abs(pr - or) < threshold) {
      vertical.add(or);
    }
    if (Math.abs(pcx - ocx) < threshold) {
      vertical.add(ocx);
    }

    if (Math.abs(pt - ot) < threshold) {
      horizontal.add(ot);
    }
    if (Math.abs(pt - ob) < threshold) {
      horizontal.add(ob);
    }
    if (Math.abs(pb - ot) < threshold) {
      horizontal.add(ot);
    }
    if (Math.abs(pb - ob) < threshold) {
      horizontal.add(ob);
    }
    if (Math.abs(pcy - ocy) < threshold) {
      horizontal.add(ocy);
    }
  }

  return { vertical: [...vertical], horizontal: [...horizontal] };
}

export function snapAxisToGuides(value: number, size: number, guides: number[], threshold: number): number {
  let bestValue = value;
  let bestDist = threshold + 1;
  for (const guide of guides) {
    const candidates = [
      { v: guide, dist: Math.abs(value - guide) },
      { v: guide - size, dist: Math.abs(value + size - guide) },
      { v: guide - size / 2, dist: Math.abs(value + size / 2 - guide) },
    ];
    for (const candidate of candidates) {
      if (candidate.dist < bestDist) {
        bestDist = candidate.dist;
        bestValue = candidate.v;
      }
    }
  }
  return bestDist <= threshold ? bestValue : value;
}

export function snapEdgeToGuides(start: number, size: number, guides: number[], threshold: number): number {
  const edge = start + size;
  let bestSize = size;
  let bestDist = threshold + 1;
  for (const guide of guides) {
    const dist = Math.abs(edge - guide);
    if (dist < bestDist) {
      bestDist = dist;
      bestSize = guide - start;
    }
  }
  return bestDist <= threshold ? bestSize : size;
}

export type DragResolveInput = {
  rawX: number;
  rawY: number;
  layout: { w: number; h: number };
  surfaceRect: DOMRect;
  surfaceHeight: number;
  gridSnapEnabled: boolean;
  gridStep: number;
  snapStrength: HubSnapStrength;
  peerRects: readonly Rect[];
  margin?: number;
};

export type DragResolveOutput = {
  rawX: number;
  rawY: number;
  x: number;
  y: number;
  guides: GuideLines;
};

export function resolveDragPosition(input: DragResolveInput): DragResolveOutput {
  const {
    rawX,
    rawY,
    layout,
    surfaceRect,
    surfaceHeight,
    gridSnapEnabled,
    gridStep,
    snapStrength,
    peerRects,
    margin = 16,
  } = input;

  const width = Math.min(layout.w, surfaceRect.width - margin * 2);
  const baseX = clamp(rawX, margin, Math.max(margin, surfaceRect.width - width - margin));
  const baseY = clamp(rawY, margin, Math.max(margin, surfaceHeight - layout.h - margin));
  const snappedX = snapCoord(baseX, gridSnapEnabled, gridStep, snapStrength);
  const snappedY = snapCoord(baseY, gridSnapEnabled, gridStep, snapStrength);
  const preview = { x: snappedX, y: snappedY, w: layout.w, h: layout.h };
  const guides = collectGuideLines(preview, peerRects, GUIDE_THRESHOLD);
  const guidedX = snapAxisToGuides(snappedX, layout.w, guides.vertical, GUIDE_THRESHOLD);
  const guidedY = snapAxisToGuides(snappedY, layout.h, guides.horizontal, GUIDE_THRESHOLD);
  const maxX = Math.max(margin, surfaceRect.width - width - margin);
  const maxY = Math.max(margin, surfaceHeight - layout.h - margin);
  const clampedX = clamp(guidedX, margin, maxX);
  const clampedY = clamp(guidedY, margin, maxY);

  return { rawX: baseX, rawY: baseY, x: clampedX, y: clampedY, guides };
}
