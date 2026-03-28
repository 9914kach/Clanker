export const HUB_WIDGET_TIERS = {
  /** Hidden below 192px — secondary info only shown at base size and above */
  hiddenAtMicro: "@[192px]:block hidden",
  /** Hidden below 320px — wide+ content (e.g. channel lists, blurb text) */
  blurbVisible: "@[320px]:block hidden",
  /** Hidden below 450px — full detail content */
  fullVisible: "@[450px]:block hidden",
  /** Gap adapts: tight at micro, normal at base+ */
  adaptiveGap: "gap-1.5 @[192px]:gap-3",
} as const;
