#!/usr/bin/env node
/**
 * Stop the API and fixture started by launch.mjs.
 *
 *   node .opencode/skills/verify/scripts/cleanup.mjs
 *
 * Kills only the PIDs recorded in artifacts/verify/.state.json, never by port or
 * process name, so a developer's own instance is untouched. Evidence under
 * artifacts/verify/ is left in place; only the scratch state file is removed.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const outDir = resolve(repoRoot, arg("out", "artifacts/verify"));
const stateFile = join(outDir, ".state.json");

if (!existsSync(stateFile)) {
  process.stdout.write("cleanup: no state file; nothing to stop.\n");
  process.exit(0);
}

const state = JSON.parse(readFileSync(stateFile, "utf8"));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function stop(pid) {
  if (typeof pid !== "number" || !alive(pid)) return "already-stopped";
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return "already-stopped";
  }
  for (let i = 0; i < 20 && alive(pid); i += 1) await sleep(200);
  if (alive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // raced to exit
    }
  }
  return alive(pid) ? "still-alive" : "stopped";
}

const api = await stop(state.apiPid);
const fixture = await stop(state.fixturePid);
rmSync(stateFile, { force: true });

process.stdout.write(
  `${JSON.stringify({ api: state.apiPid, apiResult: api, fixture: state.fixturePid, fixtureResult: fixture })}\n`,
);
