---
name: verify
description: Drive the playwright-api-wrapper Fastify service the way a caller does and prove a browser run works end to end. Use when verifying a change to POST /v1/runs, the run DSL, named flows, SSE streaming, the failure status, or the allowlist.
---

# Verify playwright-api-wrapper

playwright-api-wrapper is a Fastify service that runs one Playwright browser scenario per request. The user-facing surface is HTTP: `POST /v1/runs` (Bearer-authenticated; an inline `steps` array or a `flow` name; `Accept: text/event-stream` for SSE; `?failOnRunFailure=true`) and `GET /healthz`. Chromium is driven against the in-repo fixture server, never an external host. This skill launches the real service and fixture, drives each entry point, and captures proof.

## Launch

Run from the repository root. Build first, then start both processes with the launcher, which pins the API to port 3010 and the fixture to port 4010 so a developer instance on 3000 is untouched:

```bash
npm run build
node .claude/skills/verify/scripts/launch.mjs
```

The launcher spawns `node dist/fixture/server.js` and `node dist/src/server.js` detached, points `ALLOWED_TARGETS` at `http://127.0.0.1:4010`, loads `flows/flows.json`, and records the PIDs in `artifacts/verify/.state.json`. Explicit environment values win over the repo's `.env`. It prints the state once both `/healthz` endpoints answer:

```json
{ "apiPid": 12345, "fixturePid": 12346, "apiPort": 3010, "fixturePort": 4010, "apiKey": "<generated>", "apiBaseUrl": "http://127.0.0.1:3010", "fixtureBaseUrl": "http://127.0.0.1:4010" }
```

Teardown is `cleanup.mjs` (see Cleanup). Do not kill by port or process name, because that also kills a developer's instance.

`npm run dev` remains the interactive development command; use the launcher for verification because a watcher restarts itself and hides the process to stop.

## Doctor

One read-only check that decides whether the instance is worth driving. The API key is required on every route except the health checks:

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3010/healthz
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3010/readyz
# {"status":"ok"}
# 200
# {"status":"ready"}
# 200
```

`/healthz` proving 200 means the process is up; `/readyz` proving 200 means Chromium launched. A 401 from `POST /v1/runs` means the key is wrong, not that the run failed. If either health check is not 200, stop and relaunch from Launch rather than driving a stale server.

## Drive

Run the shipped helper against the running instance:

```bash
node .claude/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify
```

The helper resets the fixture, then exercises the inline-steps run, the named flow, the SSE stream, the `failOnRunFailure` status, and the allowlist rejection. It writes one evidence file per feature and exits non-zero when any expectation is wrong (`verify: pass` / `verify: FAIL`).

For a single run by hand, read the generated key from the state file first:

```bash
API_KEY=$(node -e "process.stdout.write(require('./artifacts/verify/.state.json').apiKey)")
curl -sS http://127.0.0.1:3010/v1/runs \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1:4010/checkout","vars":{"email":"qa@example.test","card":"4242424242424242"},"steps":[{"action":"fill","target":{"by":"label","text":"Email"},"value":"${email}"},{"action":"click","target":{"by":"role","role":"button","name":"Place order"}},{"action":"readText","target":{"by":"testId","value":"order-id"},"as":"orderId"}]}'
```

## Evidence

Proof artifacts go to `artifacts/verify/<feature>/` and survive teardown. `artifacts/` is gitignored.

- The run's status code and its result JSON, not only the final screen. The inline run must return `status: "passed"` with `outputs.orderId`, and the fixture must then answer `GET /orders/<orderId>` with the same email and `cardLast4: "4242"`.
- A named run is proven through the flow, not inline steps: `flow: "basic-form"` with no `steps` array, checking `outputs.submissionId` and `outputs.nameValue` and the saved submission.
- The SSE path is proven by the raw stream: `event: step` lines, a terminal `event: result`, and `"status":"passed"` in that result. The helper writes the raw bytes to `artifacts/verify/sse-stream/stream.txt`.
- A failure is proven by the code the runner reports (`ASSERTION_FAILED`) and by the status the query flag changes: the same body returns `200` with `status: "failed"` alone and `409` with `?failOnRunFailure=true`.
- An allowlist rejection is proven by `403` with `error.code: "TARGET_NOT_ALLOWED"` for a metadata address, without a browser ever reaching it.
- Store the request intent with every artifact: the feature id, the entry point, and the ports the run used.

## Cleanup

Stop the processes started in Launch and leave `artifacts/verify/` in place:

```bash
node .claude/skills/verify/scripts/cleanup.mjs
```

It kills only the PIDs recorded in `artifacts/verify/.state.json` and removes that scratch file; the response bodies, stream capture, logs, and summary stay. Cleanup removes the instance, never the proof.

## Helpers

- `scripts/launch.mjs` starts the fixture and API detached with the verification ports and env, waits for readiness, and writes the PID state file. Accepts `--api-port`, `--fixture-port`, `--api-key`, `--out`.
- `scripts/drive.mjs` drives every mapped feature over HTTP, captures the responses, and returns non-zero on a failed check. Accepts `--base-url`, `--fixture-url`, `--api-key`, `--out`.
- `scripts/cleanup.mjs` stops the recorded PIDs. Accepts `--out`.
