export type HubChaosFrequency = "always" | "sometimes" | "rare";

const HUB_CHAOS_CHANCE: Record<Exclude<HubChaosFrequency, "always">, number> = {
  sometimes: 0.2,
  rare: 0.06,
};

export function rollHubChaos(
  frequency: HubChaosFrequency,
  rng: () => number = Math.random,
): boolean {
  if (frequency === "always") {
    return true;
  }

  return rng() < HUB_CHAOS_CHANCE[frequency];
}

export function pickHubChaosLine(
  lines: readonly string[],
  fallback: string,
  seed?: number,
): string {
  if (lines.length === 0) {
    return fallback;
  }

  const value =
    typeof seed === "number" && Number.isFinite(seed)
      ? Math.abs(Math.floor(seed))
      : Math.floor(Math.random() * lines.length);

  return lines[value % lines.length] ?? fallback;
}
