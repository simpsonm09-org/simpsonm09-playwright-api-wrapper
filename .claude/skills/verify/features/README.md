# playwright-api-wrapper verification map

This directory is the maintained source for verifying the user-facing behavior of playwright-api-wrapper. Read the index before driving the service, then use the matching feature file as the recipe.

## Baseline preconditions

- Start the service and the in-repo fixture with the skill's Launch section (API on `http://127.0.0.1:3010`, fixture on `http://127.0.0.1:4010`).
- Confirm `/healthz` and `/readyz` both return `200` before driving anything.
- Every `POST /v1/runs` request needs `Authorization: Bearer <API_KEY>`; the launcher generates the key and records it as `apiKey` in `artifacts/verify/.state.json`.
- Drive only the loopback fixture. `ALLOWED_TARGETS` is `http://127.0.0.1:4010`; never point a run at an external host.
- Write proof under `artifacts/verify/<feature>/`.

## Driving conventions

- Run terminal actions with `curl`, or run every feature through `scripts/drive.mjs`.
- Prefer the run DSL's accessible locators (`role`, `label`, `testId`); the fixture exposes labels and `data-testid` attributes for this.
- Reset the fixture with `POST http://127.0.0.1:4010/__reset` before a scenario that asserts on server-side state.
- Read the fixture's own API (`GET /orders/:id`, `GET /submissions/:id`) to confirm the browser changed state.
- Keep proof artifacts during cleanup.

## Proof and skip reporting

- Capture the request intent, the HTTP status code, and the response body for every call.
- Prove a run through the API result and the fixture's server-side state, not by reading the runner module.
- Prove SSE with the raw stream bytes, including the terminal `result` event.
- Record the feature id and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`.

## Features

- [Inline steps run](./inline-steps.md) covers `POST /v1/runs` with a `steps` array against the fixture checkout.
- [Named flow run](./named-flow.md) covers `POST /v1/runs` with `flow` loaded from `FLOWS_FILE`.
- [SSE stream](./sse-stream.md) covers `Accept: text/event-stream` step and result events.
- [Failure status](./failure-status.md) covers a failed run and the `?failOnRunFailure=true` status.
- [Allowlist rejection](./allowlist-rejection.md) covers `403` for a target outside `ALLOWED_TARGETS`.
