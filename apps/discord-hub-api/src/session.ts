import * as jose from "jose";

const COOKIE_NAME = "discord_session";

export type SessionPayload = {
  sub: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
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
  return new jose.SignJWT({
    username: payload.username,
    avatar: payload.avatar,
    global_name: payload.global_name,
    banner: payload.banner,
    accent_color: payload.accent_color,
  })
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
    return { sub, username, avatar, global_name, banner, accent_color };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
