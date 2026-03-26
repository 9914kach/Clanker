import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";

const DRAG_THRESHOLD_PX = 3;

type MarqueePhase = "idle" | "tracking" | "marquee";

type MarqueeSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  shiftKey: boolean;
  phase: MarqueePhase;
};

function rectsOverlap(
  a: { left: number; top: number; w: number; h: number },
  b: { left: number; top: number; w: number; h: number },
): boolean {
  return a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top;
}

export type HubDesktopMarqueeBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function useHubDesktopMarquee({
  enabled,
  surfaceRef,
  visibleWidgetIds,
  layouts,
  selectedWidgetIds,
  onSetWidgetSelection,
  onClearSelection,
}: {
  enabled: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  visibleWidgetIds: readonly string[];
  layouts: Readonly<Record<string, HubDesktopWidgetLayout>>;
  selectedWidgetIds: readonly string[];
  onSetWidgetSelection: (ids: readonly string[]) => void;
  onClearSelection: () => void;
}): {
  marqueeBox: HubDesktopMarqueeBox | null;
  surfacePointerProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
} {
  const [marqueeBox, setMarqueeBox] = useState<HubDesktopMarqueeBox | null>(null);
  const sessionRef = useRef<MarqueeSession | null>(null);

  const propsRef = useRef({
    visibleWidgetIds,
    layouts,
    selectedWidgetIds,
    onSetWidgetSelection,
    onClearSelection,
  });
  propsRef.current = { visibleWidgetIds, layouts, selectedWidgetIds, onSetWidgetSelection, onClearSelection };

  const finishMarqueeFromEvent = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    const session = sessionRef.current;
    if (!surface || !session || event.pointerId !== session.pointerId) {
      return;
    }

    try {
      surface.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    const { visibleWidgetIds: ids, layouts: loMap, selectedWidgetIds: sel, onSetWidgetSelection: setSel } =
      propsRef.current;

    if (session.phase === "tracking") {
      propsRef.current.onClearSelection();
    } else if (session.phase === "marquee") {
      const r = surface.getBoundingClientRect();
      const x1 = session.startClientX - r.left;
      const y1 = session.startClientY - r.top;
      const x2 = event.clientX - r.left;
      const y2 = event.clientY - r.top;
      const ml = Math.min(x1, x2);
      const mt = Math.min(y1, y2);
      const mw = Math.abs(x2 - x1);
      const mh = Math.abs(y2 - y1);
      const marq = { left: ml, top: mt, w: mw, h: mh };

      const hits = ids.filter((id) => {
        const lo = loMap[id];
        if (!lo) {
          return false;
        }
        return rectsOverlap(marq, { left: lo.x, top: lo.y, w: lo.w, h: lo.h });
      });

      if (session.shiftKey) {
        setSel([...new Set([...sel, ...hits])]);
      } else {
        setSel(hits);
      }
    }

    sessionRef.current = null;
    setMarqueeBox(null);
  }, [surfaceRef]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      sessionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        shiftKey: event.shiftKey,
        phase: "tracking",
      };
      setMarqueeBox(null);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) {
        return;
      }
      const session = sessionRef.current;
      const surface = surfaceRef.current;
      if (!session || !surface || event.pointerId !== session.pointerId) {
        return;
      }

      if (session.phase === "tracking") {
        const dx = event.clientX - session.startClientX;
        const dy = event.clientY - session.startClientY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          session.phase = "marquee";
        }
      }

      if (session.phase === "marquee") {
        event.preventDefault();
        const r = surface.getBoundingClientRect();
        const x1 = session.startClientX - r.left;
        const y1 = session.startClientY - r.top;
        const x2 = event.clientX - r.left;
        const y2 = event.clientY - r.top;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        setMarqueeBox({ left, top, width, height });
      }
    },
    [enabled, surfaceRef],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) {
        return;
      }
      finishMarqueeFromEvent(event);
    },
    [enabled, finishMarqueeFromEvent],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) {
        return;
      }
      finishMarqueeFromEvent(event);
    },
    [enabled, finishMarqueeFromEvent],
  );

  return {
    marqueeBox,
    surfacePointerProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
