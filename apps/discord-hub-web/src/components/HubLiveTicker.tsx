import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { cn } from "@clanker/ui/lib/utils";

type HubLiveTickerVariant = "top" | "compact";

type LiveLine = {
  friend: string;
  note: string;
};

const LIVE_LINES: readonly LiveLine[] = [
  { friend: "Anton", note: "kallar fortfarande 14 flikar och en energy drink for en snabb fix." },
  { friend: "Linus", note: "har backup pa backupen och litar anda mest pa magkanslan." },
  { friend: "Maja", note: "droppar en one-liner i chatten och forsvinner innan nagon hinner svara." },
  { friend: "Joel", note: "ser ett nytt verktyg och hor direkt hur tangentbordet borjar jobba overtid." },
  { friend: "Nora", note: "sager bara en liten designgrej och lyckas starta en tva timmars diskussion." },
  { friend: "Viktor", note: "lovar en snabb ARAM och menar i praktiken hela kvallen." },
];

function reorderLines(lines: readonly LiveLine[], seed: number) {
  if (lines.length === 0) {
    return [];
  }

  const offset = seed % lines.length;
  return [...lines.slice(offset), ...lines.slice(0, offset)];
}

export default function HubLiveTicker({ variant }: { variant: HubLiveTickerVariant }) {
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion() ?? false;
  const daySeed = new Date().getDate();
  const orderedLines = useMemo(
    () => reorderLines(LIVE_LINES, daySeed + pathname.length),
    [daySeed, pathname.length],
  );

  /** Sekunder per helt loop — längre = långsammare. Tidigare kopplades duration till scroll-hastighet, vilket gav hopp när headern blev kompakt. */
  const durationSec = variant === "top" ? 52 : 38;
  const repeatedLines = useMemo(() => [...orderedLines, ...orderedLines], [orderedLines]);

  return (
    <div
      data-compact={variant === "compact" ? "true" : undefined}
      className={cn(
        "hub-live-ticker-wrap group min-w-0 overflow-hidden",
        variant === "top" ? "py-0 pl-0.5" : "py-0.5 pl-0.5",
      )}
    >
      <span className="sr-only">
        Dagens kompisradar:{" "}
        {orderedLines.map((line) => `${line.friend} ${line.note}`).join(" ")}
      </span>

      <div
        aria-hidden="true"
        className="hub-live-ticker-fade pointer-events-none min-w-0 overflow-hidden whitespace-nowrap"
      >
        <div
          className={cn(
            "hub-live-ticker-track flex min-w-max items-center [--hub-live-gap:0.9rem] gap-[var(--hub-live-gap)] pr-[var(--hub-live-gap)] will-change-transform group-hover:[animation-play-state:paused]",
            variant === "compact" && "[--hub-live-gap:0.7rem]",
          )}
          style={
            reducedMotion
              ? undefined
              : {
                  animationDuration: `${durationSec.toFixed(2)}s`,
                }
          }
        >
          {repeatedLines.map((line, index) => (
            <div
              key={`${line.friend}-${index}`}
              className={cn(
                "flex items-center gap-[var(--hub-live-gap)]",
                variant === "compact" ? "text-xs" : "text-xs leading-tight",
              )}
            >
              <span className="font-medium text-foreground">{line.friend}</span>
              <span className="text-muted-foreground">{line.note}</span>
              <span className="bg-border size-1.5 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
