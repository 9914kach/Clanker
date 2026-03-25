import * as jose from "jose";

const COOKIE_NAME = "discord_session";

export type SessionPayload = {
  sub: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
  /** OAuth scopes from token response. */
  discordScopes?: string[];
  /** When the Discord access token expires (ISO 8601). */
  discordAuthExpires?: string;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function claimStringOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    return v;
  }
  if (v === null) {
    return null;
  }
  return null;
}

function claimNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (v === null) {
    return null;
  }
  return null;
}

export async function signSession(
  secret: string,
  payload: SessionPayload,
): Promise<string> {
  const key = secretKey(secret);
  const claims: Record<string, unknown> = {
    username: payload.username,
    avatar: payload.avatar,
    global_name: payload.global_name,
    banner: payload.banner,
    accent_color: payload.accent_color,
  };
  if (payload.discordScopes?.length) {
    claims.discordScopes = payload.discordScopes;
  }
  if (payload.discordAuthExpires) {
    claims.discordAuthExpires = payload.discordAuthExpires;
  }
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<SessionPayload | null> {
  try {
    const key = secretKey(secret);
    const { payload } = await jose.jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    const sub = payload.sub;
    const username = payload.username;
    if (typeof sub !== "string" || typeof username !== "string") {
      return null;
    }
    const avatar = claimStringOrNull(payload.avatar);
    const global_name = claimStringOrNull(payload.global_name);
    const banner = claimStringOrNull(payload.banner);
    const accent_color = claimNumberOrNull(payload.accent_color);
    let discordScopes: string[] | undefined;
    const ds = payload.discordScopes;
    if (Array.isArray(ds) && ds.every((s) => typeof s === "string")) {
      discordScopes = ds as string[];
    }
    const discordAuthExpires =
      typeof payload.discordAuthExpires === "string"
        ? payload.discordAuthExpires
        : undefined;
    return {
      sub,
      username,
      avatar,
      global_name,
      banner,
      accent_color,
      discordScopes,
      discordAuthExpires,
    };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
