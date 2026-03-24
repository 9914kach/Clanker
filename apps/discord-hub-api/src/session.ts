import * as jose from "jose";

const COOKIE_NAME = "discord_session";

export type SessionPayload = {
  sub: string;
  username: string;
  avatar: string | null;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  secret: string,
  payload: SessionPayload,
): Promise<string> {
  const key = secretKey(secret);
  return new jose.SignJWT({
    username: payload.username,
    avatar: payload.avatar,
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
    const avatar =
      typeof payload.avatar === "string" || payload.avatar === null
        ? (payload.avatar as string | null)
        : null;
    return { sub, username, avatar };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
