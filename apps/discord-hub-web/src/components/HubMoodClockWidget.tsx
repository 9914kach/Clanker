import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@clanker/ui/components/badge";
import { Button } from "@clanker/ui/components/button";
import { cn } from "@clanker/ui/lib/utils";
import { useHubAudio } from "@/components/HubAudioProvider";
import { useHubPrefs } from "@/components/HubPrefsProvider";
import { useHubToasts } from "@/components/HubToastProvider";
import { useHubLocale } from "@/components/locale-provider";
import { useTheme, type ColorPalette } from "@/components/theme-provider";
import { toBcp47 } from "@/i18n/hub-copy";
import { hubMotionDurationScale } from "@/lib/hub-motion";

type MoodPreset = {
  id: string;
  label: string;
  detail: string;
  palette: ColorPalette;
  tone: "useful" | "social" | "chaos";
};

function presetForHour(hour: number, copy: { vibeMorning: string; vibeDay: string; vibeEvening: string; vibeNight: string }): MoodPreset {
  if (hour >= 0 && hour <= 5) {
    return {
      id: "night",
      label: copy.vibeNight,
      detail: "low light · high lore · do not ping",
      palette: "midnight-acid",
      tone: "chaos",
    };
  }
  if (hour <= 10) {
    return {
      id: "morning",
      label: copy.vibeMorning,
      detail: "boot sequence · warm paper · mild cope",
      palette: "citrus-pop",
      tone: "useful",
    };
  }
  if (hour <= 16) {
    return {
      id: "day",
      label: copy.vibeDay,
      detail: "steady signal · dashboards pretending to be alive",
      palette: "slate-ocean",
      tone: "useful",
    };
  }
  if (hour <= 20) {
    return {
      id: "evening",
      label: copy.vibeEvening,
      detail: "prime time · snacks approved",
      palette: "citrus-pop",
      tone: "social",
    };
  }
  return {
    id: "night",
    label: copy.vibeNight,
    detail: "ritual hour · suspicious vibes",
    palette: "goblin",
    tone: "chaos",
  };
}

function toneBadgeVariant(tone: MoodPreset["tone"]): "outline" | "secondary" | "destructive" {
  if (tone === "chaos") return "destructive";
  if (tone === "social") return "secondary";
  return "outline";
}

export default function HubMoodClockWidget() {
  const { copy, locale } = useHubLocale();
  const d = copy.dashboard;
  const reducedMotion = useReducedMotion() ?? false;
  const { play } = useHubAudio();
  const toasts = useHubToasts();
  const { prefs } = useHubPrefs();
  const { colorPalette, setColorPalette } = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const preset = useMemo(
    () =>
      presetForHour(now.getHours(), {
        vibeMorning: d.moodClockVibeMorning,
        vibeDay: d.moodClockVibeDay,
        vibeEvening: d.moodClockVibeEvening,
        vibeNight: d.moodClockVibeNight,
      }),
    [d.moodClockVibeDay, d.moodClockVibeEvening, d.moodClockVibeMorning, d.moodClockVibeNight, now],
  );

  const timeLabel = useMemo(() => {
    return new Intl.DateTimeFormat(toBcp47(locale), { hour: "2-digit", minute: "2-digit" }).format(now);
  }, [locale, now]);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat(toBcp47(locale), { weekday: "short", month: "short", day: "2-digit" }).format(now);
  }, [locale, now]);

  const dayProgress = useMemo(() => {
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes / (24 * 60);
  }, [now]);

  const progressPct = Math.max(0, Math.min(100, Math.round(dayProgress * 100)));
  const durationScale = hubMotionDurationScale(prefs.motion.animationIntensity);

  const applyMood = () => {
    setColorPalette(preset.palette);
    play("confirm");
    toasts.push({
      kind: "success",
      title: d.moodClockToastAppliedTitle,
      message: preset.palette,
    });
  };

  const chime = () => {
    play(preset.tone === "chaos" ? "chaos" : "confirm");
    toasts.push({
      kind: preset.tone === "chaos" ? "chaos" : "info",
      title: d.moodClockToastChimeTitle,
      message: d.moodClockChimeMessage(preset.label),
    });
  };

  const isAlreadyApplied = colorPalette === preset.palette;

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p className="hub-blurb">{d.moodClockBlurb}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-foreground">{timeLabel}</span>
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{dateLabel}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={toneBadgeVariant(preset.tone)}>{preset.label}</Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {preset.palette}
            </Badge>
          </div>
        </div>

        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
          animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.22 * durationScale, ease: "easeOut" }}
          className="relative size-16 shrink-0 rounded-full p-1"
          style={{
            backgroundImage: `conic-gradient(color-mix(in oklab, var(--primary) 80%, transparent) 0%, color-mix(in oklab, var(--primary) 80%, transparent) ${progressPct}%, transparent ${progressPct}%, transparent 100%)`,
          }}
          aria-label={d.moodClockProgressLabel(progressPct)}
        >
          <div className="size-full rounded-full border border-border/60 bg-background/70" />
          <div
            className={cn(
              "absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/80 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent)]",
              !reducedMotion && "animate-pulse",
            )}
            aria-hidden
          />
        </motion.div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={applyMood} disabled={isAlreadyApplied}>
          {isAlreadyApplied ? d.moodClockApplied : d.moodClockApply}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={chime}>
          {d.moodClockChime}
        </Button>
      </div>
    </div>
  );
}
