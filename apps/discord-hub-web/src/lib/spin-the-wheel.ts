export type TeamMode = "balanced" | "equal";

export type WheelTeamsResult = {
  seedUsed: string;
  teams: string[][];
};

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeParticipants(input: string): string[] {
  const raw = input
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of raw) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 64) break;
  }
  return out;
}

export function makeSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(36);
}

export function makeRng(seed: string): () => number {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}

export function pickIndex(count: number, rng: () => number): number {
  return Math.floor(rng() * count);
}

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildTeams(params: {
  participants: readonly string[];
  teamCount: number;
  mode: TeamMode;
  seed?: string;
  salt?: string;
}): WheelTeamsResult {
  const participants = [...params.participants].map((p) => p.trim()).filter(Boolean);
  if (participants.length === 0) return { seedUsed: params.seed ?? "", teams: [] };

  const seedUsed = params.seed?.trim() ? params.seed.trim() : makeSeed();
  const rng = makeRng([seedUsed, params.salt ?? ""].filter(Boolean).join(":"));

  const teamCount = Math.max(1, Math.min(16, Math.floor(params.teamCount)));
  const shuffled = shuffle(participants, rng);

  if (params.mode === "equal" && shuffled.length % teamCount !== 0) {
    return { seedUsed, teams: [] };
  }

  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  for (let i = 0; i < shuffled.length; i++) {
    teams[i % teamCount]!.push(shuffled[i]!);
  }
  return { seedUsed, teams };
}

