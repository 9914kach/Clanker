import { execSync } from "node:child_process";

const PORTS = [3010, 5173, 5174, 5175, 5176];

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function killOnWindows(ports) {
  const netstat = run("netstat -ano -p tcp");
  const pids = new Set();

  for (const line of netstat.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    for (const port of ports) {
      if (!line.includes(`:${port}`)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
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

if (killed.length > 0) {
  console.log(`[dev-clean] stopped processes on dev ports: ${killed.join(", ")}`);
} else {
  console.log("[dev-clean] no stale dev-port processes found");
}
