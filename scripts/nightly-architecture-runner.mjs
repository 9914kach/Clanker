#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function parseRrule(rruleLine) {
  const value = rruleLine.replace(/^RRULE:/, "");
  const pairs = value.split(";").map((part) => part.split("="));
  const map = Object.fromEntries(pairs);
  const byHour = Number(map.BYHOUR);
  const byMinute = Number(map.BYMINUTE);
  return {
    freq: map.FREQ,
    byDay: map.BYDAY,
    byHour,
    byMinute,
    cronUtc: `${byMinute} ${byHour} * * *`,
  };
}

function runCommand(command, options = {}) {
  const { cwd, timeoutMs, env } = options;
  return new Promise((resolve) => {
    const startedAt = new Date();
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        command,
        exitCode: code ?? -1,
        ok: code === 0 && !timedOut,
        timedOut,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        stdout,
        stderr,
      });
    });
  });
}

function templateCommand(command, substitutions) {
  let out = command;
  for (const [key, value] of Object.entries(substitutions)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function buildMarkdownReport(summary) {
  const lines = [];
  lines.push("# Nightly Architecture Automation Report");
  lines.push("");
  lines.push(`- Task ID: \`${summary.taskId}\``);
  lines.push(`- Goal: ${summary.goal}`);
  lines.push(`- Schedule RRULE: \`${summary.rrule}\``);
  lines.push(`- Derived cron (UTC): \`${summary.cronUtc}\``);
  lines.push(`- Iterations: ${summary.iterations}`);
  lines.push(`- Started: ${summary.startedAt}`);
  lines.push(`- Ended: ${summary.endedAt}`);
  lines.push(`- Overall status: **${summary.success ? "SUCCESS" : "FAILED"}**`);
  lines.push("");
  for (const run of summary.runs) {
    lines.push(`## Iteration ${run.index}`);
    lines.push(`- Agent: ${run.agent.ok ? "ok" : "failed"} (exit ${run.agent.exitCode})`);
    lines.push(`- Checks passed: ${run.checks.every((c) => c.ok) ? "yes" : "no"}`);
    for (const check of run.checks) {
      lines.push(`- ${check.name}: ${check.ok ? "ok" : `failed (exit ${check.exitCode})`}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config || "automation/nightly-architecture.json");
  const outDir = path.resolve(args["out-dir"] || "artifacts/nightly-architecture");
  const config = await readJson(configPath);

  const rruleInfo = parseRrule(config.schedule.rrule);
  const iterations = Number(config.iterations || 3);
  const promptPath = path.resolve(config.agent.promptFile);
  const promptExists = await fs
    .access(promptPath)
    .then(() => true)
    .catch(() => false);
  if (!promptExists) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  const startedAt = new Date();
  const runs = [];
  for (let i = 1; i <= iterations; i += 1) {
    console.log(`\n== Nightly iteration ${i}/${iterations} ==`);
    const commandTemplate = process.env.NIGHT_AGENT_CMD || config.agent.command;
    const agentCommand = templateCommand(commandTemplate, {
      PROMPT_FILE: promptPath,
      ITERATION_INDEX: i,
      TOTAL_ITERATIONS: iterations,
    });

    const agent = await runCommand(agentCommand, {
      cwd: process.cwd(),
      timeoutMs: Number(config.agent.timeoutSeconds || 3600) * 1000,
      env: {
        NIGHT_ITERATION: String(i),
        NIGHT_TOTAL_ITERATIONS: String(iterations),
      },
    });

    const checks = [];
    for (const check of config.dod.checks) {
      console.log(`-- Check: ${check.name}`);
      const result = await runCommand(check.command, {
        cwd: process.cwd(),
        timeoutMs: Number(config.dod.timeoutSeconds || 1200) * 1000,
      });
      checks.push({ ...result, name: check.name });
    }

    runs.push({ index: i, agent, checks });
  }

  const success = runs.every((r) => r.agent.ok && r.checks.every((c) => c.ok));
  const endedAt = new Date();
  const summary = {
    taskId: config.taskId,
    goal: config.goal,
    rrule: config.schedule.rrule,
    cronUtc: rruleInfo.cronUtc,
    iterations,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    success,
    runs,
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "latest-report.json"), JSON.stringify(summary, null, 2));
  await fs.writeFile(path.join(outDir, "latest-report.md"), buildMarkdownReport(summary));
  console.log(`\nReport saved in: ${outDir}`);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
