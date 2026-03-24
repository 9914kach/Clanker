export type ToolNavItem = {
  id: string;
  label: string;
  path: string;
  /** Om true matchar endast exakt path (rekommenderas för /tools/...). */
  end?: boolean;
};

export const toolsNav: ToolNavItem[] = [
  { id: "docs", label: "Dokumentation", path: "/docs" },
  {
    id: "checklists",
    label: "Checklistor",
    path: "/tools/checklists",
    end: true,
  },
  { id: "links", label: "Länkar", path: "/tools/links", end: true },
  { id: "http", label: "API-test", path: "/tools/http", end: true },
];
