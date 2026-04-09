import { DISCORD_API_V10 } from "./discord-rest.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 1;

export type BotFetchError = {
  status: number;
  code: string;
  message: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const ra = res.headers.get("retry-after");
  if (!ra) {
    return null;
  }
  const sec = Number(ra);
  if (Number.isFinite(sec)) {
    return Math.min(Math.ceil(sec * 1000), 60_000);
  }
  return null;
}

function parseRateLimitResetAfterMs(res: Response): number | null {
  const v = res.headers.get("x-ratelimit-reset-after");
  if (!v) {
    return null;
  }
  const sec = Number(v);
  if (Number.isFinite(sec)) {
    return Math.min(Math.ceil(sec * 1000), 60_000);
  }
  return null;
}

export async function discordBotFetchJson<T>(
  botToken: string,
  pathAndQuery: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ ok: true; data: T } | { ok: false; error: BotFetchError }> {
  const url = `${DISCORD_API_V10}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _t, ...rest } = init ?? {};

  const doOnce = async (): Promise<Response> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...rest,
        signal: ac.signal,
        headers: {
          Authorization: `Bot ${botToken}`,
          "User-Agent": "Clanker-discord-hub-api/1.0",
          ...(rest.headers as Record<string, string> | undefined),
        },
      });
    } finally {
      clearTimeout(t);
    }
  };

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    let res: Response;
    try {
      res = await doOnce();
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        error: {
          status: aborted ? 504 : 502,
          code: aborted ? "timeout" : "network_error",
          message: aborted ? "Discord request timed out" : "Discord request failed",
        },
      };
    }

    if (res.status === 429 || res.status === 503) {
      const wait =
        parseRetryAfterMs(res) ?? parseRateLimitResetAfterMs(res) ?? 1000;
      if (attempt < MAX_RETRIES) {
        await sleep(wait);
        attempt += 1;
        continue;
      }
      return {
        ok: false,
        error: {
          status: 502,
          code: "rate_limited",
          message: "Discord rate limited; retry later",
        },
      };
    }

    if (!res.ok) {
      let message = res.statusText || "Discord error";
      try {
        const text = await res.text();
        if (text.length > 0 && text.length < 500) {
          message = text;
        }
      } catch {
        /* keep default */
      }
      return {
        ok: false,
        error: {
          status: res.status >= 400 && res.status < 600 ? res.status : 502,
          code: "discord_error",
          message,
        },
      };
    }

    try {
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        error: {
          status: 502,
          code: "invalid_json",
          message: "Invalid JSON from Discord",
        },
      };
    }
  }

  return {
    ok: false,
    error: { status: 502, code: "exhausted_retries", message: "Retries exhausted" },
  };
}

/** Like discordBotFetchJson but does not parse a JSON body — use for PATCH/DELETE that return 204. */
export async function discordBotRequest(
  botToken: string,
  pathAndQuery: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ ok: true; status: number } | { ok: false; error: BotFetchError }> {
  const url = `${DISCORD_API_V10}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
  const timeoutMs = (init as { timeoutMs?: number } | undefined)?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _t, ...rest } = (init ?? {}) as RequestInit & { timeoutMs?: number };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ac.signal,
      headers: {
        Authorization: `Bot ${botToken}`,
        "User-Agent": "Clanker-discord-hub-api/1.0",
        ...(rest.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      let message = res.statusText || "Discord error";
      try {
        const text = await res.text();
        if (text.length > 0 && text.length < 500) message = text;
      } catch { /* ignore */ }
      return { ok: false, error: { status: res.status >= 400 ? res.status : 502, code: "discord_error", message } };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: {
        status: aborted ? 504 : 502,
        code: aborted ? "timeout" : "network_error",
        message: aborted ? "Discord request timed out" : "Discord request failed",
      },
    };
  } finally {
    clearTimeout(t);
  }
}
