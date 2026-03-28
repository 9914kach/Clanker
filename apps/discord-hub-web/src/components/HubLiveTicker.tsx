import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { cn } from "@clanker/ui/lib/utils";
import { useHubLocale } from "@/components/locale-provider";

type HubLiveTickerVariant = "top" | "compact";

type LiveCategory = "system" | "quote" | "meme" | "status" | "rare";

type LiveLine = {
  category: LiveCategory;
  speaker: string | null;
  note: string;
};

const LIVE_LINES: Record<"sv" | "en", readonly LiveLine[]> = {
  sv: [
    { category: "system", speaker: "Neutralen OS", note: "startar upp. Inga garantier. Bara vibbar." },
    { category: "status", speaker: null, note: "Dashboarden låtsas vara stabil. Vi låter den." },
    { category: "meme", speaker: null, note: "”Bara en snabb match” dök upp i kablarna igen." },
    { category: "quote", speaker: "Någon", note: "”Det är inte en bugg. Det är en feature med aura.”" },
    { category: "status", speaker: null, note: "Dockan tittar på dig. Den vill bli klickad." },
    { category: "system", speaker: "Skalet", note: "har laddat 80% personlighet och 20% disciplin." },
    { category: "meme", speaker: null, note: "Vi har backup på backupen. Vi litar ändå mest på magkänslan." },
    { category: "quote", speaker: "Chatten", note: "”Säg bara att du är i voice så löser sig resten.”" },
    { category: "status", speaker: null, note: "Någon håller på att uppfinna en ny ritual. För säkerhets skull." },
    { category: "system", speaker: "Neutralen OS", note: "loggar allt. Mest för att kunna skoja om det sen." },
    { category: "meme", speaker: null, note: "Hjulet viskar: ‘seed? seed.’" },
    { category: "quote", speaker: "Maja", note: "”Det är bara en liten designgrej.” (två timmar senare...)" },
  ],
  en: [
    { category: "system", speaker: "Neutralen OS", note: "booting. No promises. Only vibes." },
    { category: "status", speaker: null, note: "The dashboard is pretending to be stable. Let it." },
    { category: "meme", speaker: null, note: "“Just one quick match” echoed through the cables again." },
    { category: "quote", speaker: "Someone", note: "“Not a bug. A feature with aura.”" },
    { category: "status", speaker: null, note: "The dock is staring. It wants to be clicked." },
    { category: "system", speaker: "Shell", note: "loaded 80% personality and 20% discipline." },
    { category: "meme", speaker: null, note: "We have backup of the backup. We still trust vibes more." },
    { category: "quote", speaker: "Chat", note: "“Say you’re in voice and the rest solves itself.”" },
    { category: "status", speaker: null, note: "Someone is inventing a new ritual. For safety." },
    { category: "system", speaker: "Neutralen OS", note: "logs everything. Mostly for future roasting." },
    { category: "meme", speaker: null, note: "The wheel is whispering: ‘seed? seed.’" },
    { category: "quote", speaker: "Maja", note: "“It’s just a tiny design tweak.” (two hours later...)" },
  ],
};

const RARE_LINES: Record<"sv" | "en", readonly LiveLine[]> = {
  sv: [
    { category: "rare", speaker: "Neutralen OS", note: "laddade en hemlig patch. Ingen vet vad den gör. Än." },
    { category: "rare", speaker: null, note: "Ett mytiskt ping passerade. Vi låtsas att vi såg det." },
  ],
  en: [
    { category: "rare", speaker: "Neutralen OS", note: "loaded a secret patch. No one knows what it does. Yet." },
    { category: "rare", speaker: null, note: "A mythical ping passed by. We pretend we saw it." },
  ],
};

const CATEGORY_LABEL: Record<"sv" | "en", Record<LiveCategory, string>> = {
  sv: { system: "system", quote: "citat", meme: "meme", status: "status", rare: "rare" },
  en: { system: "system", quote: "quote", meme: "meme", status: "status", rare: "rare" },
};

function reorderLines(lines: readonly LiveLine[], seed: number) {
  if (lines.length === 0) {
    return [];
  }

  const offset = seed % lines.length;
  return [...lines.slice(offset), ...lines.slice(0, offset)];
}

function pickLine(lines: readonly LiveLine[], seed: number): LiveLine {
  const index = Math.abs(seed) % lines.length;
  return lines[index] ?? lines[0]!;
}

function categoryBadgeClass(category: LiveCategory) {
  switch (category) {
    case "system":
      return "border-primary/25 bg-primary/10 text-primary/85";
    case "quote":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    case "meme":
      return "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200";
    case "rare":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    case "status":
    default:
      return "border-border/60 bg-background/60 text-muted-foreground";
  }
}

function categoryDotClass(category: LiveCategory) {
  switch (category) {
    case "system":
      return "bg-primary/60";
    case "quote":
      return "bg-emerald-500/55";
    case "meme":
      return "bg-fuchsia-500/55";
    case "rare":
      return "bg-amber-500/65";
    case "status":
    default:
      return "bg-border";
  }
}

export default function HubLiveTicker({ variant }: { variant: HubLiveTickerVariant }) {
  const { pathname } = useLocation();
  const { locale } = useHubLocale();
  const reducedMotion = useReducedMotion() ?? false;
  const [freshnessSeed, setFreshnessSeed] = useState(0);

  useEffect(() => {
    const cadenceMs = 35_000;
    const update = () => setFreshnessSeed(Math.floor(Date.now() / cadenceMs));
    update();
    const timer = window.setInterval(update, cadenceMs);
    return () => window.clearInterval(timer);
  }, []);

  const daySeed = new Date().getDate();
  const language = locale === "en" ? "en" : "sv";
  const lines = LIVE_LINES[language];
  const baseOrderedLines = useMemo(
    () => reorderLines(lines, daySeed + pathname.length + freshnessSeed),
    [daySeed, freshnessSeed, lines, pathname.length],
  );

  const orderedLines = useMemo(() => {
    const shouldInjectRare = variant === "top" && freshnessSeed % 13 === 0;
    if (!shouldInjectRare) {
      return baseOrderedLines;
    }
    const rareLine = pickLine(RARE_LINES[language], daySeed + pathname.length + freshnessSeed);
    return [rareLine, ...baseOrderedLines];
  }, [baseOrderedLines, daySeed, freshnessSeed, language, pathname.length, variant]);

  // Seconds per full loop — longer = slower.
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
        {language === "sv" ? "Live-raden:" : "Live rail:"}{" "}
        {orderedLines.map((line) => `${line.speaker ?? ""} ${line.note}`.trim()).join(" ")}
      </span>

      <div
        aria-hidden="true"
        className="hub-live-ticker-fade pointer-events-none min-w-0 overflow-hidden whitespace-nowrap"
      >
        <div
          key={`ticker-${language}-${freshnessSeed}-${variant}`}
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
              key={`${line.category}-${line.speaker ?? "anon"}-${index}`}
              className={cn(
                "flex items-center gap-[var(--hub-live-gap)]",
                variant === "compact" ? "text-xs" : "text-xs leading-tight",
              )}
            >
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]",
                  categoryBadgeClass(line.category),
                )}
              >
                {CATEGORY_LABEL[language][line.category]}
              </span>
              {line.speaker ? <span className="font-medium text-foreground">{line.speaker}</span> : null}
              <span className="text-muted-foreground">{line.note}</span>
              <span className={cn("size-1.5 shrink-0 rounded-full", categoryDotClass(line.category))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
