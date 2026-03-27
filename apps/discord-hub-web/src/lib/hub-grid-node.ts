/**
 * hub-grid-node.ts — Fas 1 intern modell för Unified Shell Grid.
 *
 * `HubGridNode` är den interna representationen av ett element på ytan.
 * Legacy `desktopLayout` (Record<widgetId, HubDesktopWidgetLayout>) är fortfarande
 * canonical för lagring och API — den nya modellen nås via adapterlagret nedan.
 *
 * Kompatibilitetsstrategi:
 *   - `desktopLayout` → `nodes` via `desktopLayoutToNodes()`
 *   - `nodes` → `desktopLayout` via `nodesToDesktopLayout()`
 *   - Okända node-kind hanteras fail-soft (bevaras oförändrade i roundtrip).
 *
 * Kända begränsningar inför Fas 3:
 *   - Modellen har ännu ingen container-hierarki; root är implicit.
 *   - `metadata` är fri `Record<string, unknown>` — Fas 3 specificerar schema per kind.
 *   - Shell-ordnade listor (nav, dock-pins) ingår inte ännu.
 */

import type { HubDesktopWidgetLayout } from "@/lib/hub-desktop-layout";

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/**
 * Geometry för ett spatialt node (position + storlek + stapelordning).
 * Matchar exakt `HubDesktopWidgetLayout` utan `hidden`-flaggan.
 */
export type HubGridGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

/**
 * Kind-taxonomi för noder — utökas i Fas 3 med `container`, `shellObject`, m.fl.
 * `widget` motsvarar nuvarande `desktopLayout`-poster.
 * `unknown` används för node-typer som framtida klienter introducerar men denna
 * version inte känner igen — bevaras oförändrade i roundtrip (fail-soft).
 */
export type HubGridNodeKind = "widget" | "container" | "unknown";

/**
 * En statisk "child"-sektion i en container (Fas 3 v1).
 * Barn edit:as inte och deltar inte i drag/drop/reorder i denna fas.
 */
export type HubGridContainerStaticChild = {
  /** Stabilt id inom klienten (t.ex. "status", "league", "steam"). */
  id: string;
  kind: "staticSection";
};

/**
 * Kind-specifik metadata för en container (Fas 3 v1).
 *
 * Obs: metadata är fortfarande serialiserbar (Record) men vi erbjuder en tydlig typ
 * för att undvika "magic strings" i routes som bygger container-innehåll.
 */
export type HubGridContainerMetadataV1 = {
  schema: "hub.container.v1";
  staticChildren: HubGridContainerStaticChild[];
};

/**
 * En nod på den gemensamma grid-ytan.
 *
 * - `id` — stabil sträng (t.ex. widgetId som "welcome", "server-pulse").
 * - `kind` — taxonomi; avgör vilka capabilities som gäller.
 * - `geometry` — spatial position och storlek; `null` för icke-spatiala noder.
 * - `hidden` — om noden är dold på ytan (spawn-listan).
 * - `containerId` — framtida: vilken container noden tillhör. `null` = root.
 * - `metadata` — kind-specifik fri data för framtida utökning.
 */
export type HubGridNode = {
  id: string;
  kind: HubGridNodeKind;
  geometry: HubGridGeometry | null;
  hidden: boolean;
  containerId: string | null;
  metadata: Record<string, unknown>;
};

/**
 * En samling noder indexerade på id — internt arbetsformat.
 */
export type HubGridNodeMap = Record<string, HubGridNode>;

// ---------------------------------------------------------------------------
// Container helpers (Fas 3)
// ---------------------------------------------------------------------------

export function createContainerNode(args: {
  id: string;
  geometry: HubGridGeometry;
  staticChildren: readonly HubGridContainerStaticChild[];
  hidden?: boolean;
  containerId?: string | null;
}): HubGridNode {
  return {
    id: args.id,
    kind: "container",
    geometry: { ...args.geometry },
    hidden: args.hidden ?? false,
    containerId: args.containerId ?? null,
    metadata: {
      schema: "hub.container.v1",
      staticChildren: [...args.staticChildren],
    } satisfies HubGridContainerMetadataV1,
  };
}

export function readContainerMetadataV1(node: HubGridNode): HubGridContainerMetadataV1 | null {
  if (!node || node.kind !== "container") {
    return null;
  }
  const md = node.metadata as Partial<HubGridContainerMetadataV1> | null;
  if (!md || md.schema !== "hub.container.v1" || !Array.isArray(md.staticChildren)) {
    return null;
  }
  const staticChildren: HubGridContainerStaticChild[] = md.staticChildren.filter(
    (c): c is HubGridContainerStaticChild =>
      Boolean(c) &&
      typeof (c as HubGridContainerStaticChild).id === "string" &&
      (c as HubGridContainerStaticChild).kind === "staticSection",
  );
  return { schema: "hub.container.v1", staticChildren };
}

// ---------------------------------------------------------------------------
// Adapter: legacy desktopLayout → nodes
// ---------------------------------------------------------------------------

/**
 * Konverterar ett legacy `desktopLayout`-record till en `HubGridNodeMap`.
 *
 * Alla kända widget-poster översätts till kind `"widget"`.
 * Okända fält i layoutposten ignoreras (fail-soft).
 */
export function desktopLayoutToNodes(
  layout: Readonly<Record<string, HubDesktopWidgetLayout>>,
): HubGridNodeMap {
  const nodes: HubGridNodeMap = {};
  for (const [id, entry] of Object.entries(layout)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    nodes[id] = {
      id,
      kind: "widget",
      geometry: {
        x: typeof entry.x === "number" ? entry.x : 0,
        y: typeof entry.y === "number" ? entry.y : 0,
        w: typeof entry.w === "number" ? entry.w : 320,
        h: typeof entry.h === "number" ? entry.h : 200,
        z: typeof entry.z === "number" ? entry.z : 1,
      },
      hidden: typeof entry.hidden === "boolean" ? entry.hidden : false,
      containerId: null,
      metadata: {},
    };
  }
  return nodes;
}

/**
 * Konverterar en `HubGridNodeMap` tillbaka till legacy `desktopLayout`-format.
 *
 * Noder med kind `"widget"` och giltig geometry inkluderas.
 * Noder med `geometry: null` eller annan kind hoppas över (de har ingen legacy-representation).
 * Okända noder (kind `"unknown"`) hoppas också över — de kan inte representeras i legacy-formatet.
 */
export function nodesToDesktopLayout(
  nodes: Readonly<HubGridNodeMap>,
): Record<string, HubDesktopWidgetLayout> {
  const layout: Record<string, HubDesktopWidgetLayout> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!node || node.kind !== "widget" || !node.geometry) {
      continue;
    }
    layout[id] = {
      x: node.geometry.x,
      y: node.geometry.y,
      w: node.geometry.w,
      h: node.geometry.h,
      z: node.geometry.z,
      hidden: node.hidden,
    };
  }
  return layout;
}

// ---------------------------------------------------------------------------
// Normalisering (fail-soft)
// ---------------------------------------------------------------------------

/**
 * Normaliserar ett `HubGridNodeMap` mot ett defaults-record.
 *
 * - Noder som saknar geometry men har en default-geometry fylls i.
 * - Okända noder (id inte i defaults) bevaras oförändrade (fail-soft).
 * - Noder med kind `"unknown"` bevaras alltid.
 *
 * Denna funktion är medvetet INTE låst mot fasta widget-ID:n — den tar
 * defaults som parameter, vilket gör den återanvändbar för framtida
 * node-typer och container-ytor.
 */
export function normalizeNodeMap(
  nodes: Readonly<HubGridNodeMap>,
  defaultGeometries: Readonly<Record<string, HubGridGeometry>>,
): HubGridNodeMap {
  const result: HubGridNodeMap = {};

  // Bevara alla inkommande noder
  for (const [id, node] of Object.entries(nodes)) {
    if (!node) {
      continue;
    }
    if (node.geometry === null && defaultGeometries[id]) {
      result[id] = { ...node, geometry: { ...defaultGeometries[id]! } };
    } else {
      result[id] = node;
    }
  }

  // Lägg till noder från defaults som saknas
  for (const [id, geo] of Object.entries(defaultGeometries)) {
    if (!result[id]) {
      result[id] = {
        id,
        kind: "widget",
        geometry: { ...geo },
        hidden: false,
        containerId: null,
        metadata: {},
      };
    }
  }

  return result;
}

/**
 * Bygger ett `HubGridGeometry`-record från ett legacy `desktopLayout`-record.
 * Hjälpfunktion för att skapa defaults-parametern till `normalizeNodeMap`.
 */
export function geometriesFromDesktopLayout(
  layout: Readonly<Record<string, HubDesktopWidgetLayout>>,
): Record<string, HubGridGeometry> {
  const result: Record<string, HubGridGeometry> = {};
  for (const [id, entry] of Object.entries(layout)) {
    if (!entry) {
      continue;
    }
    result[id] = {
      x: entry.x,
      y: entry.y,
      w: entry.w,
      h: entry.h,
      z: entry.z,
    };
  }
  return result;
}
