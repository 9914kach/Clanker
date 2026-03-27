import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@clanker/ui/components/badge";
import { Button } from "@clanker/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@clanker/ui/components/card";
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

const DEFAULT_ITEM: HubCustomModuleItem = {
  id: crypto.randomUUID(),
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
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{item.title || "Untitled"}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[0.65rem] uppercase">{item.size}</Badge>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove module">
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder="Module title"
          className="rounded-xl"
        />
        <HubCustomModuleSizePicker
          value={item.size}
          onChange={(size) => onChange({ ...item, size })}
        />
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Add modules and customize their size + content.</p>
        <Badge variant="secondary">{moduleCountLabel}</Badge>
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
                return remaining.length > 0 ? remaining : [{ ...DEFAULT_ITEM, id: crypto.randomUUID() }];
              });
            }}
          />
        ))}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={addDisabled}
        onClick={() => {
          setItems((prev) => [
            ...prev,
            { ...DEFAULT_ITEM, id: crypto.randomUUID(), title: `New note ${prev.length + 1}` },
          ]);
        }}
      >
        <Plus data-icon="inline-start" />
        Add module
      </Button>
    </div>
  );
}
