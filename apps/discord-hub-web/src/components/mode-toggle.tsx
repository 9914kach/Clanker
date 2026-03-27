import { Moon, Sun } from "lucide-react";
import { Button } from "@clanker/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@clanker/ui/components/dropdown-menu";

import {
  type ColorPalette,
  useTheme,
} from "@/components/theme-provider";
import { cn } from "@clanker/ui/lib/utils";

type Appearance = "dark" | "light" | "system";

/** OKLCH previews — mirrors shadcn-theme.css (menu swatches before selection) */
const PALETTE_PREVIEW: Record<ColorPalette, readonly string[]> = {
  carbon: [
    "oklch(0.43 0.05 250)",
    "oklch(0.68 0.08 250)",
    "oklch(0.6 0.07 210)",
    "oklch(0.7 0.09 280)",
  ],
  "slate-ocean": [
    "oklch(0.5 0.14 235)",
    "oklch(0.66 0.16 235)",
    "oklch(0.62 0.12 210)",
    "oklch(0.74 0.12 255)",
  ],
  bubblegum: [
    "oklch(0.65 0.22 350)",
    "oklch(0.72 0.24 350)",
    "oklch(0.7 0.16 320)",
    "oklch(0.78 0.14 10)",
  ],
  "citrus-pop": [
    "oklch(0.75 0.2 85)",
    "oklch(0.78 0.2 85)",
    "oklch(0.7 0.16 55)",
    "oklch(0.8 0.16 120)",
  ],
  goblin: [
    "oklch(0.55 0.18 135)",
    "oklch(0.7 0.2 135)",
    "oklch(0.6 0.12 95)",
    "oklch(0.76 0.14 165)",
  ],
  "midnight-acid": [
    "oklch(0.65 0.22 310)",
    "oklch(0.74 0.26 310)",
    "oklch(0.72 0.18 280)",
    "oklch(0.82 0.18 250)",
  ],
  "violett-neutral": [
    "oklch(0.488 0.243 264.376)",
    "oklch(0.809 0.105 251.813)",
    "oklch(0.623 0.214 259.815)",
    "oklch(0.546 0.245 262.881)",
  ],
  green: [
    "oklch(0.648 0.2 131.684)",
    "oklch(0.871 0.15 154.449)",
    "oklch(0.723 0.219 149.579)",
    "oklch(0.627 0.194 149.214)",
  ],
  "terminal-dark-russian": [
    "hsl(0 80% 42%)",
    "hsl(0 0% 35%)",
    "hsl(0 0% 55%)",
    "hsl(0 80% 30%)",
  ],
};

function PaletteSwatchPreview({ palette }: { palette: ColorPalette }) {
  return (
    <div className="flex shrink-0 gap-0.5" aria-hidden>
      {PALETTE_PREVIEW[palette].map((color) => (
        <span
          key={color}
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function ModeToggle({ triggerClassName }: { triggerClassName?: string }) {
  const { theme, setTheme, colorPalette, setColorPalette } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={cn("relative", triggerClassName)}>
          <Sun className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span
            className="ring-background absolute right-1 bottom-1 size-2 rounded-full ring-2"
            style={{ backgroundColor: PALETTE_PREVIEW[colorPalette][0] }}
            aria-hidden
          />
          <span className="sr-only">Byt tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Läge</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Appearance)}
        >
          <DropdownMenuRadioItem value="light">Ljust</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Mörkt</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Färgtema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={colorPalette}
          onValueChange={(value) => setColorPalette(value as ColorPalette)}
        >
          <DropdownMenuRadioItem value="carbon" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Carbon</span>
              <span className="text-muted-foreground text-xs">serious · graphite</span>
            </div>
            <PaletteSwatchPreview palette="carbon" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="slate-ocean" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Slate Ocean</span>
              <span className="text-muted-foreground text-xs">serious · blue slate</span>
            </div>
            <PaletteSwatchPreview palette="slate-ocean" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bubblegum" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Bubblegum</span>
              <span className="text-muted-foreground text-xs">playful · pink</span>
            </div>
            <PaletteSwatchPreview palette="bubblegum" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="citrus-pop" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Citrus Pop</span>
              <span className="text-muted-foreground text-xs">playful · citrus</span>
            </div>
            <PaletteSwatchPreview palette="citrus-pop" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="goblin" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Goblin</span>
              <span className="text-muted-foreground text-xs">troll · swamp</span>
            </div>
            <PaletteSwatchPreview palette="goblin" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="midnight-acid" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Midnight Acid</span>
              <span className="text-muted-foreground text-xs">troll · neon</span>
            </div>
            <PaletteSwatchPreview palette="midnight-acid" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="violett-neutral"
            className="items-center gap-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Violett / neutral</span>
              <span className="text-muted-foreground text-xs">
                shadcn themes
              </span>
            </div>
            <PaletteSwatchPreview palette="violett-neutral" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="green" className="items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Grön</span>
              <span className="text-muted-foreground text-xs">
                shadcn themes · green
              </span>
            </div>
            <PaletteSwatchPreview palette="green" />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="terminal-dark-russian"
            className="items-center gap-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>Terminal Dark Russian</span>
              <span className="text-muted-foreground text-xs">
                tweakcn · hög kontrast
              </span>
            </div>
            <PaletteSwatchPreview palette="terminal-dark-russian" />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
