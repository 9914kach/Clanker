import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@clanker/ui/components/badge";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardHeader } from "@clanker/ui/components/card";
import { Input } from "@clanker/ui/components/input";
import { Textarea } from "@clanker/ui/components/textarea";
import { cn } from "@clanker/ui/lib/utils";
import { HubSegmentControl, type HubSegmentOption } from "@/components/HubPrefsControls";

export type HubCustomModuleSize = "compact" | "cozy" | "expanded";

export type HubCustomModuleItem = {
  id: string;
  title: string;
  content: string;
  size: HubCustomModuleSize;
};

function createModuleId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_ITEM: HubCustomModuleItem = {
  id: createModuleId(),
  title: "New note",
  content: "",
  size: "cozy",
};

function safeRead(storageKey: string): HubCustomModuleItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [{ ...DEFAULT_ITEM }];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [{ ...DEFAULT_ITEM }];
    const valid = parsed
      .filter((item): item is HubCustomModuleItem => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<HubCustomModuleItem>;
        return (
          typeof candidate.id === "string"
          && typeof candidate.title === "string"
          && typeof candidate.content === "string"
          && (candidate.size === "compact" || candidate.size === "cozy" || candidate.size === "expanded")
        );
      })
      .slice(0, 5);
    return valid.length > 0 ? valid : [{ ...DEFAULT_ITEM }];
  } catch {
    return [{ ...DEFAULT_ITEM }];
  }
}

export function HubCustomModuleSizePicker({
  value,
  onChange,
}: {
  value: HubCustomModuleSize;
  onChange: (size: HubCustomModuleSize) => void;
}) {
  const options: HubSegmentOption<HubCustomModuleSize>[] = [
    { value: "compact", label: "S" },
    { value: "cozy", label: "M" },
    { value: "expanded", label: "L" },
  ];

  return <HubSegmentControl options={options} value={value} onChange={onChange} className="w-[8rem]" />;
}

export function HubCustomModuleCardEditor({
  item,
  onChange,
  onRemove,
}: {
  item: HubCustomModuleItem;
  onChange: (item: HubCustomModuleItem) => void;
  onRemove: () => void;
}) {
  const textareaRows = item.size === "compact" ? 2 : item.size === "cozy" ? 4 : 7;

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            placeholder="Module title"
            className="h-9 flex-1 rounded-xl bg-background/80"
          />
          <HubCustomModuleSizePicker
            value={item.size}
            onChange={(size) => onChange({ ...item, size })}
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove module">
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          rows={textareaRows}
          value={item.content}
          onChange={(e) => onChange({ ...item, content: e.target.value })}
          placeholder="Write custom content..."
          className={cn("rounded-xl", item.size === "expanded" ? "text-sm" : "text-xs")}
        />
      </CardContent>
    </Card>
  );
}

export default function HubCustomModuleBuilder({
  storageKey = "hub.custom.modules.v1",
  maxItems = 5,
}: {
  storageKey?: string;
  maxItems?: number;
}) {
  const [items, setItems] = useState<HubCustomModuleItem[]>(() => safeRead(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, storageKey]);

  const addDisabled = items.length >= maxItems;
  const moduleCountLabel = useMemo(() => `${items.length}/${maxItems}`, [items.length, maxItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
        <p className="text-xs text-muted-foreground">Add modules and customize their size + content.</p>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{moduleCountLabel}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={addDisabled}
            onClick={() => {
              setItems((prev) => [
                ...prev,
                { ...DEFAULT_ITEM, id: createModuleId(), title: `New note ${prev.length + 1}` },
              ]);
            }}
          >
            <Plus data-icon="inline-start" />
            Add module
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <HubCustomModuleCardEditor
            key={item.id}
            item={item}
            onChange={(next) => setItems((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)))}
            onRemove={() => {
              setItems((prev) => {
                const remaining = prev.filter((entry) => entry.id !== item.id);
                return remaining.length > 0 ? remaining : [{ ...DEFAULT_ITEM, id: createModuleId() }];
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
