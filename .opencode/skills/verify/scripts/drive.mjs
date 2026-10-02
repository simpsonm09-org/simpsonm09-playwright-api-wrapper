#!/usr/bin/env node
/**
 * Drive the playwright-api-wrapper HTTP surface and capture evidence.
 *
 * Start the service with launch.mjs first, then run from the repository root:
 *
 *   node .opencode/skills/verify/scripts/drive.mjs \
 *     --base-url http://127.0.0.1:3010 \
 *     --fixture-url http://127.0.0.1:4010 \
 *     --out artifacts/verify
 *
 * Exercises the inline-steps run, the named flow, the SSE stream, the
 * failOnRunFailure status, and the allowlist rejection. Writes each response
 * under <out>/<feature>/ and exits non-zero when any expected result is wrong.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const baseUrl = arg("base-url", "http://127.0.0.1:3010");
const fixtureUrl = arg("fixture-url", "http://127.0.0.1:4010");
const outDir = resolve(repoRoot, arg("out", "artifacts/verify"));
// The launcher generates the key and records it in the state file, so the driver
// reads it from there unless one is passed explicitly.
const statePath = join(outDir, ".state.json");
const stateKey = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8")).apiKey
  : undefined;
const apiKey = arg("api-key") ?? stateKey;

const checks = [];
function check(feature, name, ok, detail) {
  checks.push({ feature, name, ok: ok === true, ...(detail === undefined ? {} : { detail }) });
}

function save(feature, name, payload) {
  const dir = join(outDir, feature);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...extra };
}

async function postRun(body, options = {}) {
  const query = options.query ?? "";
  const headers = authHeaders(options.accept === undefined ? {} : { accept: options.accept });
  const response = await fetch(`${baseUrl}/v1/runs${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, text, json, contentType: response.headers.get("content-type") };
}

function checkoutSteps() {
  return {
    url: `${fixtureUrl}/checkout`,
    vars: { email: "qa@example.test", card: "4242424242424242" },
    options: { timeoutMs: 30000, stepTimeoutMs: 10000 },
    steps: [
      { action: "fill", target: { by: "label", text: "Email" }, value: "${email}" },
      { action: "fill", target: { by: "label", text: "Card number" }, value: "${card}" },
      { action: "click", target: { by: "role", role: "button", name: "Place order" } },
      { action: "assertText", target: { by: "text", text: "Order received" }, contains: "Order received" },
      { action: "readText", target: { by: "testId", value: "order-id" }, as: "orderId" },
    ],
  };
}

async function resetFixture() {
  await fetch(`${fixtureUrl}/__reset`, { method: "POST" });
}

async function getFixtureJson(path) {
  const response = await fetch(`${fixtureUrl}${path}`);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json };
}

// --- inline-steps: a run that changes server-side state ---------------------
await resetFixture();
const inline = await postRun(checkoutSteps());
save("inline-steps", "response.json", { status: inline.status, body: inline.json ?? inline.text });
check("inline-steps", "status 200", inline.status === 200, inline.status);
check("inline-steps", "run passed", inline.json?.status === "passed", inline.json?.status);
check("inline-steps", "every step passed", inline.json?.steps?.every((s) => s.status === "passed") === true, inline.json?.steps);
check("inline-steps", "orderId output", (inline.json?.outputs?.orderId ?? "").startsWith("ord_"), inline.json?.outputs?.orderId);
const orderId = inline.json?.outputs?.orderId;
const order = orderId === undefined ? { status: 0, json: undefined } : await getFixtureJson(`/orders/${orderId}`);
save("inline-steps", "fixture-order.json", { status: order.status, body: order.json });
check("inline-steps", "fixture has the order", order.status === 200, order.status);
check("inline-steps", "fixture email", order.json?.email === "qa@example.test", order.json?.email);
check("inline-steps", "fixture card last4", order.json?.cardLast4 === "4242", order.json?.cardLast4);

// --- named-flow: the same surface via a server-side flow --------------------
await resetFixture();
const named = await postRun({
  flow: "basic-form",
  url: `${fixtureUrl}/form`,
  vars: { name: "Ada Lovelace", email: "ada@example.test", plan: "pro", notes: "filled by the wrapper" },
});
save("named-flow", "response.json", { status: named.status, body: named.json ?? named.text });
check("named-flow", "status 200", named.status === 200, named.status);
check("named-flow", "run passed", named.json?.status === "passed", named.json?.status);
check("named-flow", "submissionId output", (named.json?.outputs?.submissionId ?? "").startsWith("sub_"), named.json?.outputs?.submissionId);
check("named-flow", "nameValue output", named.json?.outputs?.nameValue === "Ada Lovelace", named.json?.outputs?.nameValue);
const subId = named.json?.outputs?.submissionId;
const sub = subId === undefined ? { status: 0, json: undefined } : await getFixtureJson(`/submissions/${subId}`);
save("named-flow", "fixture-submission.json", { status: sub.status, body: sub.json });
check("named-flow", "fixture has the submission", sub.status === 200, sub.status);
check("named-flow", "fixture plan", sub.json?.plan === "pro", sub.json?.plan);

// --- sse-stream: one step event per step and a terminal result event --------
await resetFixture();
const stream = await postRun(checkoutSteps(), { accept: "text/event-stream" });
save("sse-stream", "stream.txt", stream.text);
save("sse-stream", "meta.json", {
  status: stream.status,
  contentType: stream.contentType,
  stepEvents: (stream.text.match(/event: step/g) ?? []).length,
  resultEvents: (stream.text.match(/event: result/g) ?? []).length,
});
check("sse-stream", "status 200", stream.status === 200, stream.status);
check("sse-stream", "content-type is text/event-stream", (stream.contentType ?? "").includes("text/event-stream"), stream.contentType);
check("sse-stream", "step events", stream.text.includes("event: step"), (stream.text.match(/event: step/g) ?? []).length);
check("sse-stream", "result event", stream.text.includes("event: result"), (stream.text.match(/event: result/g) ?? []).length);
check("sse-stream", "passed in terminal result", stream.text.includes('"status":"passed"'), undefined);

// --- failure-status: the query flag changes the HTTP status -----------------
const failingBody = {
  url: `${fixtureUrl}/checkout`,
  options: { stepTimeoutMs: 1000 },
  steps: [
    { action: "assertText", target: { by: "text", text: "No such element" }, contains: "nope" },
  ],
};
const failing = await postRun(failingBody, { query: "?failOnRunFailure=true" });
save("failure-status", "response.json", { status: failing.status, body: failing.json ?? failing.text });
check("failure-status", "status 409", failing.status === 409, failing.status);
check("failure-status", "run failed", failing.json?.status === "failed", failing.json?.status);
check("failure-status", "ASSERTION_FAILED code", failing.json?.error?.code === "ASSERTION_FAILED", failing.json?.error?.code);
const control = await postRun(failingBody);
save("failure-status", "control.json", { status: control.status, body: control.json ?? control.text });
check("failure-status", "control returns 200", control.status === 200, control.status);
check("failure-status", "control still failed", control.json?.status === "failed", control.json?.status);

// --- allowlist-rejection: a target outside the loopback fixture -------------
const blocked = await postRun({
  url: "http://169.254.169.254/",
  steps: [{ action: "navigate", url: "http://169.254.169.254/" }],
});
save("allowlist-rejection", "response.json", { status: blocked.status, body: blocked.json ?? blocked.text });
check("allowlist-rejection", "status 403", blocked.status === 403, blocked.status);
check("allowlist-rejection", "TARGET_NOT_ALLOWED code", blocked.json?.error?.code === "TARGET_NOT_ALLOWED", blocked.json?.error?.code);

// --- summary ----------------------------------------------------------------
const failures = checks.filter((entry) => !entry.ok);
const summary = { baseUrl, fixtureUrl, passed: checks.length - failures.length, failed: failures.length, checks };
save("drive", "summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(failures.length === 0 ? "verify: pass\n" : "verify: FAIL\n");
process.exit(failures.length === 0 ? 0 : 1);
