export type LeagueRankedEntry = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
};

const LEAGUE_TIER_PALETTES: Record<string, readonly string[]> = {
  IRON: ["#6b7280", "#9ca3af", "#4b5563", "#d1d5db"],
  BRONZE: ["#8c5a3c", "#b7794b", "#d4a373", "#6f4129"],
  SILVER: ["#94a3b8", "#cbd5e1", "#e2e8f0", "#a8b3c4"],
  GOLD: ["#f59e0b", "#fbbf24", "#fde68a", "#d97706"],
  PLATINUM: ["#67e8f9", "#5eead4", "#99f6e4", "#c4b5fd"],
  EMERALD: ["#10b981", "#34d399", "#6ee7b7", "#2dd4bf"],
  DIAMOND: ["#60a5fa", "#38bdf8", "#67e8f9", "#a78bfa"],
  MASTER: ["#c084fc", "#e879f9", "#f0abfc", "#a855f7"],
  GRANDMASTER: ["#fb7185", "#ef4444", "#f97316", "#f472b6"],
  CHALLENGER: ["#e0f2fe", "#93c5fd", "#f8fafc", "#fde68a"],
};

export function formatLeagueRank(entry: LeagueRankedEntry | null): string {
  if (!entry || !entry.tier || !entry.rank) {
    return "Ingen ranked-data ännu";
  }
  return `${entry.tier} ${entry.rank} · ${entry.leaguePoints} LP`;
}

export function getLeagueRankPalette(entry: LeagueRankedEntry | null): readonly string[] | null {
  if (!entry?.tier || !entry.rank) {
    return null;
  }
  return LEAGUE_TIER_PALETTES[entry.tier.toUpperCase()] ?? null;
}

export function formatGameDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Inte ännu";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("sv-SE");
}
