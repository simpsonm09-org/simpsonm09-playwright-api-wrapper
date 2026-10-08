#!/usr/bin/env node
/**
 * Start the wrapper API and the in-repo fixture for verification.
 *
 * Run from the repository root after `npm run build`:
 *
 *   npm run build
 *   node .claude/skills/verify/scripts/launch.mjs
 *
 * Both servers run as plain `node dist/...` processes, detached, with their PIDs
 * recorded in artifacts/verify/.state.json so cleanup stops exactly what this
 * run started. Verification uses its own ports (API 3010, fixture 4010) so a
 * developer instance on 3000 is left alone. Explicit env wins over .env.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const apiPort = Number(arg("api-port", "3010"));
const fixturePort = Number(arg("fixture-port", "4010"));
const apiKey = arg("api-key") ?? randomUUID();
const outDir = resolve(repoRoot, arg("out", "artifacts/verify"));

const stateFile = join(outDir, ".state.json");
const logsDir = join(outDir, "logs");

if (existsSync(stateFile)) {
  process.stderr.write(
    `launch: ${stateFile} exists; run cleanup first or stop the recorded run.\n`,
  );
  process.exit(1);
}

const apiEntry = join(repoRoot, "dist", "src", "server.js");
const fixtureEntry = join(repoRoot, "dist", "fixture", "server.js");
for (const entry of [apiEntry, fixtureEntry]) {
  if (!existsSync(entry)) {
    process.stderr.write(
      `launch: missing ${entry}. Run "npm run build" from the repository root first.\n`,
    );
    process.exit(1);
  }
}

mkdirSync(logsDir, { recursive: true });

function start(entry, env, logName) {
  const fd = openSync(join(logsDir, logName), "w");
  const child = spawn(process.execPath, [entry], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  return child.pid;
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

function stop(pid) {
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
}

const fixturePid = start(
  fixtureEntry,
  { FIXTURE_HOST: "127.0.0.1", FIXTURE_PORT: String(fixturePort) },
  "fixture.log",
);

const apiPid = start(
  apiEntry,
  {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    API_KEY: apiKey,
    ALLOWED_TARGETS: `http://127.0.0.1:${fixturePort}`,
    FLOWS_FILE: "flows/flows.json",
    LOG_LEVEL: "info",
  },
  "api.log",
);

const fixtureReady = await waitFor(
  `http://127.0.0.1:${fixturePort}/healthz`,
  20_000,
);
const apiReady = await waitFor(`http://127.0.0.1:${apiPort}/healthz`, 20_000);

if (!fixtureReady || !apiReady) {
  stop(apiPid);
  stop(fixturePid);
  process.stderr.write(
    `launch: not ready (fixture=${fixtureReady} api=${apiReady}). See ${logsDir}.\n`,
  );
  process.exit(1);
}

const state = {
  apiPid,
  fixturePid,
  apiPort,
  fixturePort,
  apiKey,
  apiBaseUrl: `http://127.0.0.1:${apiPort}`,
  fixtureBaseUrl: `http://127.0.0.1:${fixturePort}`,
};
writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
