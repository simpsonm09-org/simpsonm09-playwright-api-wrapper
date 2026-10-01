# API

One run endpoint and two health checks. See [`design.md`](design.md) for the design.

## Endpoints

- `GET /healthz` returns `200 { "status": "ok" }`.
- `GET /readyz` returns `200` when Chromium launches, otherwise `503`.
- `POST /v1/runs` runs one scenario.

## Auth

Every route except the health checks requires `Authorization: Bearer <API_KEY>`, compared in constant time. A development default is allowed only when `NODE_ENV` is not `production`.

## Request

```json
{
  "url": "http://127.0.0.1:4010/checkout",
  "vars": { "email": "qa@example.test", "card": "4242424242424242" },
  "options": { "timeoutMs": 30000, "stepTimeoutMs": 10000, "failFast": true },
  "steps": [
    { "action": "fill", "target": { "by": "label", "text": "Email" }, "value": "${email}" },
    { "action": "click", "target": { "by": "role", "role": "button", "name": "Place order" } },
    { "action": "assertText", "target": { "by": "text", "text": "Order received" }, "contains": "Order received" },
    { "action": "readText", "target": { "by": "testId", "value": "order-id" }, "as": "orderId" }
  ]
}
```

`url` is required unless the first step is a `navigate` with its own URL. `options.timeoutMs` and `options.stepTimeoutMs` may tighten the configured caps but never exceed them.

## Named flows

A request carries either an inline `steps` array or a `flow` name. Both accept `url`, `vars`, and `options`.

`FLOWS_FILE` points at a JSON object. Each key is a flow name. Each value holds a `steps` array and optional `options`.

```json
{
  "checkout": {
    "steps": [
      { "action": "fill", "target": { "by": "label", "text": "Email" }, "value": "${email}" },
      { "action": "assertText", "target": { "by": "text", "text": "Order received" }, "contains": "Order received" }
    ],
    "options": { "stepTimeoutMs": 10000 }
  }
}
```

The loader validates every flow against the step schema at startup. A bad file fails the process at boot, not per request. An unknown name returns `400` with code `FLOW_NOT_FOUND`. Request `options` override the flow's `options` per key.

## Steps

`navigate`, `fill`, `click`, `press`, `selectOption`, `check`, `waitFor`, `assertVisible`, `assertText`, `assertUrl`, `readText`, `readInputValue`.

`readText` and `readInputValue` write to `outputs` under the `as` name.

## Locators

```json
{ "by": "role", "role": "button", "name": "Place order" }
{ "by": "label", "text": "Email" }
{ "by": "testId", "value": "order-id" }
{ "by": "text", "text": "Order received" }
{ "by": "css", "selector": "#submit" }
```

Accessible locators are preferred. `text` and `css` remain for sites without test ids.

## Variables and secrets

Values use `${name}`. Postman and newman both substitute `{{...}}`, so the run DSL avoids that form.

- `${name}` resolves from the request `vars` map.
- `${secret.NAME}` resolves from an environment variable `RUN_SECRET_NAME`. Only `RUN_SECRET_` variables are exposed to templates.

Resolved secret values are redacted from error messages and logs.

## Response

```json
{
  "runId": "f0e2...",
  "status": "passed",
  "target": "http://127.0.0.1:4010/checkout",
  "finalUrl": "http://127.0.0.1:4010/orders",
  "startedAt": "2026-09-27T12:00:00.000Z",
  "finishedAt": "2026-09-27T12:00:04.120Z",
  "durationMs": 4120,
  "outputs": { "orderId": "ord_1001" },
  "steps": [{ "index": 0, "action": "fill", "status": "passed", "durationMs": 11 }],
  "error": null
}
```

`status` is one of `passed`, `failed`, `timedOut`, or `rejected`.

## Status codes

- `200` run completed, including `failed` and `timedOut`. Assert on `status`.
- `400` invalid request body or an unresolved template.
- `401` missing or invalid API key.
- `403` target not permitted by the allowlist.
- `409` a failed run when `?failOnRunFailure=true` is set.
- `413` request body over the size cap.
- `429` concurrency limit reached.
- `502` target host could not be resolved.

## Streaming

With `Accept: text/event-stream`, the response emits one `step` event per step and a terminal `result` event with the same JSON, then closes. A `: ping` comment every 15 seconds keeps intermediaries from idling the stream. A client disconnect aborts the run.

## Configuration

See `.env.example`. Key variables: `API_KEY`, `ALLOWED_TARGETS`, `FLOWS_FILE`, `RUN_TIMEOUT_MS`, `STEP_TIMEOUT_MS`, `MAX_STEPS`, `MAX_BODY_BYTES`, `MAX_CONCURRENT_RUNS`, `MAX_OUTPUTS_BYTES`, `CHROMIUM_ARGS`, and `RUN_SECRET_*`.
