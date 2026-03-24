/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIME_ISO__: string;

declare module "virtual:clanker-repo-md" {
  export const markdownBySlug: Record<string, string>;
}
