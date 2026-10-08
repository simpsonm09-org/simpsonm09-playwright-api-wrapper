# Inline steps run

An inline run is the primary feature: a caller sends a target URL, a `vars` map, and an ordered `steps` array, and the service opens one fresh Chromium context, runs the steps against the fixture, and returns a structured result with any values read from the page.

## Sub-features

- `steps-navigate` sends the browser to a target given by the first step instead of the request `url`.
- `steps-fill` and `steps-click` enter values and submit the fixture checkout form.
- `steps-assert` proves page state with `assertVisible`, `assertText`, and `assertUrl`.
- `steps-read` copies page text or input values into `outputs` with `readText` and `readInputValue`.
- `steps-vars` resolves `${name}` from the request `vars` map before the run.

## How to get to it (user POV)

- POST a JSON body with `url`, `vars`, and `steps` to `http://127.0.0.1:3010/v1/runs` with `Authorization: Bearer <API_KEY>`.
- Read `status`, `steps`, and `outputs` from the JSON response; `200` means the run completed, not that it passed.

## Driving it with curl and the drive helper

Preconditions: Launch is done and `/readyz` returned `200`.

- **Every feature at once.** Run `node .claude/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify`.
- **Checkout scenario.** POST the checkout body (see the skill's Drive section) to `http://127.0.0.1:3010/v1/runs`. Status `200`, `status: "passed"`, every entry in `steps` `passed`, and `outputs.orderId` matches `^ord_`.
- **Server-side state.** `curl -s http://127.0.0.1:4010/orders/<orderId>`. Status `200` with `email: "qa@example.test"` and `cardLast4: "4242"`.
- **Reset first.** `curl -s -X POST http://127.0.0.1:4010/__reset` clears fixture state before a scenario that asserts on it.
- **Proof.** Keep `artifacts/verify/inline-steps/response.json` and `artifacts/verify/inline-steps/fixture-order.json`.

## Gotchas

- The endpoint returns `200` for a completed run even when the run failed; assert on `status`, never on the HTTP code alone.
- Values use `${name}`. Postman and newman substitute `{{name}}`, so the DSL never accepts that form.
- `url` is required unless the first step is a `navigate` with its own URL.
- Fixture state is in memory and order ids are sequential; reset before a run whose assertion depends on it.
- A green unit test with the fake browser pool is not proof; drive real Chromium through the running service.
