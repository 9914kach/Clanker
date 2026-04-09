import http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { setupWSConnection } from "@y/websocket-server/utils";
import type { AppEnv } from "./env.js";
import { COOKIE_NAME, verifySession } from "./session.js";

const ROOM_RE = /^[a-z0-9-]{1,48}$/;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey !== name) {
      continue;
    }
    return decodeURIComponent(rest.join("="));
  }

  return null;
}

function rejectUpgrade(
  socket: Duplex & { write: (chunk: string) => void; destroy: () => void },
  statusCode = 401,
) {
  try {
    socket.write(
      `HTTP/1.1 ${statusCode} Unauthorized\r\nConnection: close\r\n\r\n`,
    );
  } finally {
    socket.destroy();
  }
}

export function startWheelCollabServer(env: AppEnv): () => Promise<void> {
  const wss = new WebSocketServer({ noServer: true });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("wheel-collab ready");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `discord-hub-api: wheel-collab cannot bind ${env.listenHost}:${env.wheelCollabPort} (${err.code}). From repo root run: node scripts/kill-dev-ports.mjs`,
      );
    } else {
      console.error("discord-hub-api: wheel-collab server error:", err);
    }
    process.exit(1);
  });

  server.on("upgrade", async (request, socket, head) => {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (!token) {
      rejectUpgrade(socket);
      return;
    }

    const session = await verifySession(env.sessionSecret, token);
    if (!session) {
      rejectUpgrade(socket);
      return;
    }

    const host = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "/", `http://${host}`);
    const room = url.pathname.replace(/^\/+/, "").trim().toLocaleLowerCase();
    if (!ROOM_RE.test(room)) {
      rejectUpgrade(socket, 400);
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      setupWSConnection(ws, request, { docName: `wheel-${room}`, gc: true });
    });
  });

  server.listen(env.wheelCollabPort, env.listenHost, () => {
    console.log(
      `discord-hub-api wheel-collab listening on ws://${env.listenHost}:${env.wheelCollabPort}`,
    );
  });

  return async () =>
    await new Promise<void>((resolve, reject) => {
      wss.close((wsError?: Error) => {
        if (wsError) {
          reject(wsError);
          return;
        }
        server.close((serverError) => {
          if (serverError) {
            reject(serverError);
            return;
          }
          resolve();
        });
      });
    });
}
