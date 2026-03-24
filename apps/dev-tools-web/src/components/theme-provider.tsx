import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

export type ColorPalette = "green" | "violett-neutral";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  defaultColorPalette?: ColorPalette;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

function paletteStorageKey(storageKey: string) {
  return `${storageKey}-palette`;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultColorPalette = "violett-neutral",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  const [colorPalette, setColorPaletteState] = useState<ColorPalette>(() => {
    const stored = localStorage.getItem(
      paletteStorageKey(storageKey),
    ) as ColorPalette | null;
    if (stored === "green" || stored === "violett-neutral") {
      return stored;
    }
    return defaultColorPalette;
  });

  useLayoutEffect(() => {
    const root = window.document.documentElement;

    root.dataset.palette = colorPalette;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme, colorPalette]);

  const value = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
    },
    colorPalette,
    setColorPalette: (next: ColorPalette) => {
      localStorage.setItem(paletteStorageKey(storageKey), next);
      setColorPaletteState(next);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}
