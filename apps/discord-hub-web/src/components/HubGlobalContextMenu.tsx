import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@clanker/ui/lib/utils";
import type { HubContextMenuSection } from "@/lib/hub-shell-context";

function toneClassName(tone: "default" | "danger" | "chaos" | undefined, disabled: boolean): string {
  if (disabled) {
    return "text-muted-foreground/60";
  }
  if (tone === "danger") {
    return "text-destructive";
  }
  if (tone === "chaos") {
    return "text-warning";
  }
  return "text-foreground";
}

export default function HubGlobalContextMenu({
  open,
  sections,
  position,
  onClose,
}: {
  open: boolean;
  sections: readonly HubContextMenuSection[];
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [measuredPosition, setMeasuredPosition] = useState(position);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };

    const handleWindowChange = () => onClose();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("blur", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("blur", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [onClose, open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const inset = 12;
    const x = Math.min(position.x, Math.max(inset, window.innerWidth - rect.width - inset));
    const y = Math.min(position.y, Math.max(inset, window.innerHeight - rect.height - inset));
    setMeasuredPosition({ x: Math.max(inset, x), y: Math.max(inset, y) });
  }, [open, position, sections]);

  const visibleSections = useMemo(
    () => sections.filter((section) => section.items.length > 0),
    [sections],
  );

  return (
    <AnimatePresence>
      {open && visibleSections.length > 0 ? (
        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={reducedMotion ? undefined : { opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-50"
        >
          <motion.div
            ref={menuRef}
            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: -4 }}
            animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{
              left: measuredPosition.x,
              top: measuredPosition.y,
            }}
            className={cn(
              "pointer-events-auto fixed min-w-[17rem] max-w-[22rem] rounded-[1.35rem] border border-border/70",
              "bg-background/88 p-2 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-background/80",
              "ring-1 ring-foreground/8",
            )}
            role="menu"
            aria-label="Context menu"
          >
            {visibleSections.map((section, sectionIndex) => (
              <div
                key={section.id}
                className={cn(
                  "py-1.5",
                  sectionIndex > 0 && "border-t border-border/55",
                )}
              >
                {section.label ? (
                  <div className="px-2 pb-1 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    {section.label}
                  </div>
                ) : null}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        onClose();
                        if (!item.disabled) {
                          item.onSelect();
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition",
                        item.disabled
                          ? "cursor-not-allowed opacity-60"
                          : "hover:bg-muted/65 active:scale-[0.995]",
                      )}
                    >
                      <span className={cn("inline-flex items-center gap-2", toneClassName(item.tone, Boolean(item.disabled)))}>
                        <span
                          className={cn(
                            "inline-flex size-3 items-center justify-center rounded-full border border-border/60 text-[0.65rem]",
                            item.checked ? "bg-primary/20 text-primary" : "bg-transparent text-transparent",
                          )}
                          aria-hidden="true"
                        >
                          •
                        </span>
                        <span>{item.label}</span>
                      </span>
                      {item.shortcut ? (
                        <span className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                          {item.shortcut}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
