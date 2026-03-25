import { hkdfSync, webcrypto } from "node:crypto";
import { CompactEncrypt, compactDecrypt } from "jose";

export const DISCORD_OAUTH_TOKENS_COOKIE = "discord_oauth_tokens";

export type DiscordTokenPayload = {
  access_token: string;
  refresh_token: string | null;
  expires_at_ms: number;
  scope: string;
};

function deriveKeyBytes(sessionSecret: string): Uint8Array {
  const extra = process.env.DISCORD_TOKEN_ENCRYPTION_KEY?.trim();
  if (extra) {
    const buf = Buffer.from(extra, "utf8");
    if (buf.length < 32) {
      throw new Error(
        "DISCORD_TOKEN_ENCRYPTION_KEY must be at least 32 UTF-8 bytes",
      );
    }
    return new Uint8Array(buf.subarray(0, 32));
  }
  return new Uint8Array(
    hkdfSync(
      "sha256",
      sessionSecret,
      Buffer.alloc(0),
      "discord-hub-api:oauth-jwe",
      32,
    ),
  );
}

async function importAesGcmKey(
  raw: Uint8Array,
): Promise<Awaited<ReturnType<typeof webcrypto.subtle.importKey>>> {
  return webcrypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealDiscordTokens(
  sessionSecret: string,
  payload: DiscordTokenPayload,
): Promise<string> {
  const raw = deriveKeyBytes(sessionSecret);
  const key = await importAesGcmKey(raw);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  return await new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(key);
}

export async function unsealDiscordTokens(
  sessionSecret: string,
  compact: string,
): Promise<DiscordTokenPayload | null> {
  try {
    const raw = deriveKeyBytes(sessionSecret);
    const key = await importAesGcmKey(raw);
    const { plaintext } = await compactDecrypt(compact, key);
    const obj = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!obj || typeof obj !== "object") {
      return null;
    }
    const o = obj as Record<string, unknown>;
    const access_token = o.access_token;
    const expires_at_ms = o.expires_at_ms;
    const scope = o.scope;
    if (typeof access_token !== "string" || access_token.length === 0) {
      return null;
    }
    if (typeof expires_at_ms !== "number" || !Number.isFinite(expires_at_ms)) {
      return null;
    }
    if (typeof scope !== "string") {
      return null;
    }
    const refresh_token =
      o.refresh_token === null || o.refresh_token === undefined
        ? null
        : typeof o.refresh_token === "string"
          ? o.refresh_token
          : null;
    return {
      access_token,
      refresh_token,
      expires_at_ms,
      scope,
    };
  } catch {
    return null;
  }
}
