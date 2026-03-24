import { useCallback, useEffect, useState } from "react";
import { BuildStamp } from "@/components/BuildStamp";
import { checklists } from "@/data/checklists";
import type { ChecklistDefinition } from "@/tools/checklistTypes";

const STORAGE_PREFIX = "dev-tools-checklist-v1:";

function storageKey(checklistId: string): string {
  return `${STORAGE_PREFIX}${checklistId}`;
}

function loadChecked(checklistId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(checklistId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveChecked(checklistId: string, state: Record<string, boolean>): void {
  localStorage.setItem(storageKey(checklistId), JSON.stringify(state));
}

function ChecklistSection({ definition }: { definition: ChecklistDefinition }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    loadChecked(definition.id),
  );

  useEffect(() => {
    setChecked(loadChecked(definition.id));
  }, [definition.id]);

  const toggle = useCallback(
    (itemId: string, next: boolean) => {
      setChecked((prev) => {
        const merged = { ...prev, [itemId]: next };
        saveChecked(definition.id, merged);
        return merged;
      });
    },
    [definition.id],
  );

  return (
    <section className="tool-page__section card">
      <h2 className="tool-page__h2">{definition.title}</h2>
      <p className="tool-page__muted tool-page__section-lead">
        Status sparas i webbläsaren (<code>localStorage</code>) för denna enhet.
      </p>
      <ul className="checklist-list">
        {definition.items.map((item) => (
          <li key={item.id} className="checklist-list__item">
            <label className="checklist-list__label">
              <input
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={(e) => toggle(item.id, e.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChecklistsPage() {
  return (
    <div className="tool-page layout">
      <header className="tool-page__header header">
        <h1 className="tool-page__title">Checklistor</h1>
        <p className="tagline">
          Checklistor definieras som JSON under{" "}
          <code>src/data/checklists/</code> och registreras i{" "}
          <code>index.ts</code>.
        </p>
      </header>
      <main className="tool-page__main main">
        {checklists.map((c) => (
          <ChecklistSection key={c.id} definition={c} />
        ))}
        <BuildStamp />
      </main>
    </div>
  );
}
