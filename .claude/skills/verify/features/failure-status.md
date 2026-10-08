# Failure status

A run that fails still returns HTTP `200` with `status: "failed"` (or `"timedOut"`) and an error code in the body, unless the caller passes `?failOnRunFailure=true`, which turns any non-passed run into `409` so a client can branch on the status code.

## Sub-features

- `fail-status-body` reports `failed` or `timedOut` in the result body.
- `fail-on-run-failure` maps a non-passed run to `409` when `?failOnRunFailure=true` is set.
- `fail-error-code` names the cause: `ASSERTION_FAILED`, `STEP_FAILED`, `TIMEOUT`, and the rest.
- `fail-result-body` returns the full run result (not the `{error}` envelope) with the `409`.

## How to get to it (user POV)

- POST a body whose assertion cannot pass, for example an `assertText` on text that is not on the page.
- Add `?failOnRunFailure=true` to `POST /v1/runs` to make the HTTP status track the run's outcome.

## Driving it with curl and the drive helper

Preconditions: Launch is done, `/readyz` returned `200`.

- **Every feature at once.** Run `node .claude/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify`; it drives both the flagged and unflagged calls.
- **Flagged.** POST `{"url":"http://127.0.0.1:4010/checkout","options":{"stepTimeoutMs":1000},"steps":[{"action":"assertText","target":{"by":"text","text":"No such element"},"contains":"nope"}]}` to `http://127.0.0.1:3010/v1/runs?failOnRunFailure=true`. Status `409`, `status: "failed"`, `error.code: "ASSERTION_FAILED"`.
- **Unflagged control.** POST the same body without the query. Status `200` with the same `status: "failed"`.
- **Proof.** Keep `artifacts/verify/failure-status/response.json` and `artifacts/verify/failure-status/control.json`.

## Gotchas

- `200` never means the run passed; assert on the `status` field.
- The `409` body is the normal `RunResult`, not the `{error:{code,message}}` shape used for `400`/`403`/`401`.
- A missing element fails `assertText` as `ASSERTION_FAILED`; a run that runs out of time reports `TIMEOUT` and `status: "timedOut"`.
- The flag is the exact string `true`; any other value leaves the status at `200`.
