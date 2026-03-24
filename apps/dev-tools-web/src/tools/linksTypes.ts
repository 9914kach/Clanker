export type ExternalLink = {
  label: string;
  href: string;
  description?: string;
};

export type ExternalLinksFile = {
  groups: { title: string; links: ExternalLink[] }[];
};
