import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@clanker/ui/lib/utils";

type ToastKind = "info" | "success" | "error" | "chaos";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message: string | null;
  createdAt: number;
  ttlMs: number;
};

type ToastInput = {
  kind?: ToastKind;
  title: string;
  message?: string | null;
  ttlMs?: number;
};

type ToastApi = {
  push: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickChaosTitle(base: string) {
  const options = [
    base,
    "System whispers:",
    "Neutralen OS says:",
    "Not a bug. A feature.",
    "Mysterious but valid:",
  ];
  return options[Math.floor(Math.random() * options.length)] ?? base;
}

function stylesForKind(kind: ToastKind) {
  if (kind === "success") {
    return {
      frame: "border-primary/30 bg-primary/10",
      dot: "bg-primary",
      title: "text-foreground",
      message: "text-muted-foreground",
    };
  }
  if (kind === "error") {
    return {
      frame: "border-destructive/30 bg-destructive/10",
      dot: "bg-destructive",
      title: "text-foreground",
      message: "text-muted-foreground",
    };
  }
  if (kind === "chaos") {
    return {
      frame: "border-warning/40 bg-warning/10",
      dot: "bg-warning",
      title: "text-foreground",
      message: "text-muted-foreground",
    };
  }
  return {
    frame: "border-border/70 bg-background/70",
    dot: "bg-muted-foreground",
    title: "text-foreground",
    message: "text-muted-foreground",
  };
}

function ToastStack({ toasts, dismiss }: { toasts: readonly ToastItem[]; dismiss: (id: string) => void }) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,24rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const s = stylesForKind(t.kind);
          return (
            <motion.div
              key={t.id}
              layout
              initial={reducedMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "pointer-events-auto rounded-2xl border px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55",
                "ring-1 ring-foreground/5",
                s.frame,
              )}
              role="status"
            >
              <div className="flex items-start gap-2">
                <div className={cn("mt-1.5 size-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-medium", s.title)}>{t.title}</div>
                  {t.message ? (
                    <div className={cn("mt-0.5 text-xs", s.message)}>{t.message}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function HubToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const t = timeoutsRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const t of timeoutsRef.current.values()) {
      window.clearTimeout(t);
    }
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = randomId();
      const now = Date.now();
      const kind = toast.kind ?? "info";
      const ttlMs = toast.ttlMs ?? (kind === "error" ? 7_500 : kind === "chaos" ? 6_000 : 4_500);
      const title = kind === "chaos" ? pickChaosTitle(toast.title) : toast.title;
      const item: ToastItem = {
        id,
        kind,
        title,
        message: toast.message ?? null,
        createdAt: now,
        ttlMs,
      };
      setToasts((prev) => [item, ...prev].slice(0, 5));
      const handle = window.setTimeout(() => dismiss(id), ttlMs);
      timeoutsRef.current.set(id, handle);
    },
    [dismiss],
  );

  useEffect(() => () => clear(), [clear]);

  const api = useMemo<ToastApi>(() => ({ push, dismiss, clear }), [clear, dismiss, push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useHubToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useHubToasts must be used within HubToastProvider");
  }
  return ctx;
}

