export type ChecklistItem = {
  id: string;
  label: string;
};

export type ChecklistDefinition = {
  id: string;
  title: string;
  items: ChecklistItem[];
};
