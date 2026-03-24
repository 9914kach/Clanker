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

type Appearance = "dark" | "light" | "system";

/** OKLCH previews — mirrors shadcn-theme.css (menu swatches before selection) */
const PALETTE_PREVIEW: Record<ColorPalette, readonly string[]> = {
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

export function ModeToggle() {
  const { theme, setTheme, colorPalette, setColorPalette } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
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
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
