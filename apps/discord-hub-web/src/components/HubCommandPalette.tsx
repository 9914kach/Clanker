import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from "@clanker/ui/components/command";
import { Badge } from "@clanker/ui/components/badge";
import { useHubLocale } from "@/components/locale-provider";
import type { HubAction, HubActionSection } from "@/config/hub-actions";
import type { HubCopy } from "@/i18n/hub-copy";

const SECTIONS: readonly HubActionSection[] = ["Navigation", "System", "Chaos"];
const RECENT_ACTIONS_KEY = "hub.command-palette.recent.v1";
const MAX_RECENT_ACTIONS = 5;

function sectionHeading(section: HubActionSection, cp: HubCopy["commandPalette"]) {
  if (section === "System") {
    return cp.sectionSystem;
  }
  if (section === "Chaos") {
    return cp.sectionChaos;
  }
  return cp.sectionNavigation;
}

function toneLabel(tone: HubAction["tone"], cp: HubCopy["commandPalette"]) {
  if (tone === "social") {
    return cp.toneSocial;
  }
  if (tone === "chaos") {
    return cp.toneChaos;
  }
  return cp.toneUseful;
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readRecentActionIds() {
  try {
    const raw = localStorage.getItem(RECENT_ACTIONS_KEY);
    if (!raw) {
      return [] as string[];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [] as string[];
  }
}

function actionSearchValue(action: HubAction) {
  return normalizeValue(
    [
      action.label,
      action.description,
      action.shortcut,
      ...(action.keywords ?? []),
      ...(action.revealKeywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isHiddenActionUnlocked(action: HubAction, normalizedQuery: string) {
  if (action.discoverability !== "hidden") {
    return true;
  }

  if (!normalizedQuery) {
    return false;
  }

  return (action.revealKeywords ?? []).some((keyword) => {
    const token = normalizeValue(keyword);
    return token.includes(normalizedQuery) || normalizedQuery.includes(token);
  });
}

export default function HubCommandPalette({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: readonly HubAction[];
}) {
  const { copy } = useHubLocale();
  const cp = copy.commandPalette;
  const [query, setQuery] = useState("");
  const [recentActionIds, setRecentActionIds] = useState<string[]>(() => readRecentActionIds());

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(recentActionIds));
    } catch {
      // ignore storage failures
    }
  }, [recentActionIds]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const normalizedQuery = normalizeValue(query);
  const recentActions = useMemo(() => {
    const visibleActions = new Map(
      actions
        .filter((action) => action.discoverability !== "hidden")
        .map((action) => [action.id, action] as const),
    );
    return recentActionIds
      .map((id) => visibleActions.get(id))
      .filter((action): action is HubAction => Boolean(action))
      .slice(0, MAX_RECENT_ACTIONS);
  }, [actions, recentActionIds]);

  const groupedActions = useMemo(
    () =>
      SECTIONS.map((section) => ({
        section,
        items: actions.filter((action) => {
          if (action.section !== section) {
            return false;
          }

          if (!isHiddenActionUnlocked(action, normalizedQuery)) {
            return false;
          }

          if (normalizedQuery && !actionSearchValue(action).includes(normalizedQuery)) {
            return false;
          }

          if (!normalizedQuery && recentActions.some((recentAction) => recentAction.id === action.id)) {
            return false;
          }

          return true;
        }),
      })).filter((group) => group.items.length > 0),
    [actions, normalizedQuery, recentActions],
  );

  const showRecentActions = normalizedQuery.length === 0 && recentActions.length > 0;

  const runAction = (action: HubAction) => {
    if (action.discoverability !== "hidden") {
      setRecentActionIds((prev) => [action.id, ...prev.filter((id) => id !== action.id)].slice(0, MAX_RECENT_ACTIONS));
    }
    action.onSelect();
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={cp.dialogTitle}
      description={cp.dialogDescription}
      className="sm:max-w-2xl"
      contentProps={{
        onCloseAutoFocus: (event) => {
          event.preventDefault();
        },
      }}
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={cp.inputPlaceholder}
        />
        <CommandList>
          {showRecentActions ? (
            <CommandGroup heading={cp.recentHeading}>
              {recentActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem key={`recent-${action.id}`} value={actionSearchValue(action)} onSelect={() => runAction(action)}>
                    <Icon />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{action.label}</span>
                        <Badge variant={action.tone === "chaos" ? "destructive" : "outline"}>
                          {cp.recentBadge}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {action.description}
                      </div>
                    </div>
                    {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {showRecentActions && groupedActions.length > 0 ? <CommandSeparator /> : null}
          <CommandEmpty>
            <div className="flex flex-col gap-2 px-4 py-2 text-left">
              <p className="text-sm font-medium text-foreground">{cp.emptyTitle(query.trim() || "…")}</p>
              <p className="text-xs text-muted-foreground">{cp.emptyHint}</p>
            </div>
          </CommandEmpty>
          {groupedActions.map((group, index) => (
            <div key={group.section}>
              {index > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading={sectionHeading(group.section, cp)}>
                {group.items.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      value={actionSearchValue(action)}
                      onSelect={() => runAction(action)}
                    >
                      <Icon />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{action.label}</span>
                          <Badge variant={action.tone === "chaos" ? "destructive" : "outline"}>
                            {toneLabel(action.tone, cp)}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {action.description}
                        </div>
                      </div>
                      {action.shortcut ? (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
