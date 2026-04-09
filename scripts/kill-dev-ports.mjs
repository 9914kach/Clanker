import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** Vite / common hub dev ports plus discord-hub-api HTTP + wheel-collab (from .env). */
const STATIC_DEV_PORTS = [3010, 5173, 5174, 5175, 5176];

function parseEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(filePath)) {
    return out;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function hubApiListenPorts() {
  const rootEnv = parseEnvFile(path.join(repoRoot, ".env"));
  const apiEnv = parseEnvFile(path.join(repoRoot, "apps/discord-hub-api/.env"));
  const merged = { ...rootEnv, ...apiEnv };
  const port = Number(merged.PORT?.trim()) > 0 ? Number(merged.PORT) : 3001;
  const wheelRaw = merged.WHEEL_COLLAB_PORT?.trim();
  const wheelCollabPort =
    wheelRaw && Number(wheelRaw) > 0 ? Number(wheelRaw) : port + 1;
  return { port, wheelCollabPort };
}

/** discord-bot music HTTP (MUSIC_BOT_HTTP_URL); stale tsx/node often leaves this listening after Ctrl+C. */
function musicBotHttpPort() {
  const rootEnv = parseEnvFile(path.join(repoRoot, ".env"));
  const botEnv = parseEnvFile(path.join(repoRoot, "bots/discord-bot/.env"));
  const merged = { ...rootEnv, ...botEnv };
  const p = Number(merged.MUSIC_BOT_HTTP_PORT?.trim());
  return p > 0 ? p : 3012;
}

const musicPort = musicBotHttpPort();
const { port: apiPort, wheelCollabPort } = hubApiListenPorts();
const argvMode = process.argv[2]?.trim();
const PORTS =
  argvMode === "music-bot"
    ? [musicPort]
    : [...new Set([...STATIC_DEV_PORTS, apiPort, wheelCollabPort, musicPort])];

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function killOnWindows(ports) {
  const pids = new Set();

  // `netstat` output is localized on non-English Windows (not "LISTENING"), so PIDs were missed.
  for (const port of ports) {
    const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
    const out = run(cmd);
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(String(line).trim());
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
  }

  for (const pid of pids) {
    run(`taskkill /PID ${pid} /F`);
  }

  return [...pids];
}

function killOnUnix(ports) {
  const pidSet = new Set();
  for (const port of ports) {
    const output = run(`lsof -ti tcp:${port}`);
    for (const raw of output.split(/\r?\n/)) {
      const pid = Number(raw.trim());
      if (Number.isFinite(pid) && pid > 0) pidSet.add(pid);
    }
  }

  for (const pid of pidSet) {
    run(`kill -9 ${pid}`);
  }

  return [...pidSet];
}

const killed =
  process.platform === "win32" ? killOnWindows(PORTS) : killOnUnix(PORTS);

const logPrefix = argvMode === "music-bot" ? "[discord-bot predev]" : "[dev-clean]";
if (killed.length > 0) {
  console.log(
    `${logPrefix} stopped process(es) ${killed.join(", ")} (ports: ${PORTS.join(", ")})`,
  );
} else {
  console.log(`${logPrefix} no listener on ${PORTS.join(", ")}`);
}
