import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type HubCopy,
  type HubLocale,
  HUB_LOCALE_STORAGE_KEY,
  hubCopy,
} from "@/i18n/hub-copy";

type LocaleProviderState = {
  locale: HubLocale;
  setLocale: (locale: HubLocale) => void;
  copy: HubCopy;
};

const LocaleContext = createContext<LocaleProviderState | undefined>(undefined);

type LocaleProviderProps = {
  children: ReactNode;
  defaultLocale?: HubLocale;
  storageKey?: string;
};

function readStoredLocale(storageKey: string, fallback: HubLocale): HubLocale {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === "sv" || raw === "en") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function LocaleProvider({
  children,
  defaultLocale = "sv",
  storageKey = HUB_LOCALE_STORAGE_KEY,
}: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<HubLocale>(() =>
    readStoredLocale(storageKey, defaultLocale),
  );

  const setLocale = useCallback(
    (next: HubLocale) => {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
      setLocaleState(next);
    },
    [storageKey],
  );

  const copy = useMemo(() => hubCopy[locale], [locale]);

  const value = useMemo<LocaleProviderState>(
    () => ({ locale, setLocale, copy }),
    [copy, locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useHubLocale(): LocaleProviderState {
  const ctx = useContext(LocaleContext);
  if (ctx === undefined) {
    throw new Error("useHubLocale must be used within LocaleProvider");
  }
  return ctx;
}
