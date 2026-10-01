# Playwright wrapper API — design and implementation

**Status:** Implemented and verified locally through 2026-09-28. This file replaces the earlier requirements draft and is the single source of truth for the design.

## Goal

A small, Dockerized HTTP API that drives a Playwright browser flow in one
request. A caller sends a target URL and a declarative step script. The API runs
the flow in an isolated browser context and returns a structured result.

The three use cases:

1. **Human testing from Postman.** A person edits a request in the Postman GUI
   and inspects the response. The service runs in Docker.
2. **Automated testing from newman, locally.** A Postman collection runs under
   newman and asserts on the API result.
3. **Automated testing from newman in GitHub Actions.** The same collection runs
   in a workflow against a published container image.

Design consequences of these clients:

- The request carries the whole scenario: URL, ordered steps, and parameter
  values including test data such as a credit card.
- The response exposes the run status and any captured values, so a later API
  call can verify server-side state.
- The service is one request per run for the common case.
- The image runs unattended in CI with no manual setup.

## Decisions locked

- **Result transport.** Blocking JSON by default. `Accept: text/event-stream`
  opts into an SSE stream that ends with a terminal `result` event. newman gets
  a guaranteed JSON body; the Postman GUI and curl get live progress. No polling
  endpoint.
- **Run cap.** Environment driven, `RUN_TIMEOUT_MS`, default 60000.
- **Target scope.** Local and Compose-fixture origins only. The allowlist ships
  restricted to loopback and the fixture service.
- **CI image.** Build and publish to GHCR. A workflow starts the image and runs
  newman against it.
- **Variable syntax.** `${name}`, not `{{name}}`. Postman and newman both
  substitute `{{...}}` in request bodies, so the run DSL avoids that form.
- **Named flows.** A request may send `flow: "name"` instead of an inline
  `steps` array. Flows load once at startup from `FLOWS_FILE`, a JSON map of
  name to `{ steps, options? }`. The flow stays environment-agnostic because
  `url` and `vars` still come from the request. An unknown name is a `400`.

## Non-goals

- No arbitrary JavaScript, shell, or `eval` supplied by the caller.
- No cross-request browser session persistence. Each run gets a fresh context.
- No public unauthenticated deployment.
- No screenshot or trace collection.
- No multi-browser matrix. Chromium only.

## Stack and versions

- Node.js 24 Active LTS, pinned in `.nvmrc` and the Dockerfile.
- Fastify 5 with the TypeBox type provider for schema-first validation and
  serialization.
- `playwright` 1.63.0, Chromium only, matching the Docker image tag, which is
  pinned by digest.
- TypeScript 5.9 strict, Vitest 5 for tests, newman 6 for client tests.

The API code stays small. The browser layer is the weight. The official
Playwright image is roughly 0.9 to 1.8 GB uncompressed, so "light" applies to
the API footprint, not to Chromium.

## Repository layout

```
src/
  server.ts              # bootstrap, listen, shutdown
  app.ts                 # Fastify instance, auth hook, error handler
  auth.ts                # constant-time bearer check
  deps.ts                # AppDeps type
  config/
    env.ts               # parse and validate env at startup
    allowlist.ts         # parse ALLOWED_TARGETS, match, resolve, guard
    secrets.ts           # RUN_SECRET_ variables to a secrets map
    flows.ts             # load FLOWS_FILE into a named-flow registry
  schema/
    request.ts           # TypeBox run request, step union, locator union
    response.ts          # TypeBox run result, step result, error response
  run/
    runner.ts            # prepareRun and executeRun
    steps.ts             # step execution over a Playwright Page
    locators.ts          # locator union to Playwright Locator
    browser.ts           # shared Chromium, isolated contexts
    template.ts          # ${var} resolution and secret redaction
    limits.ts            # caps for steps, outputs, timeouts
    concurrency.ts       # bounded concurrency gate
    errors.ts            # RunFailure and error codes
  routes/
    health.ts            # GET /healthz, GET /readyz
    runs.ts              # POST /v1/runs (JSON and SSE)
fixture/server.ts        # test-only fixture site, plain node http
flows/flows.json         # named scenarios loaded by FLOWS_FILE
test/unit, test/integration, test/e2e
postman/                 # collection and environment template
scripts/newman.mjs       # cross-platform newman runner
scripts/postman-cli.mjs  # cross-platform Postman CLI runner
Dockerfile, docker-compose.yml, .env.example
.github/workflows/       # ci.yml, postman.yml, publish.yml
```

Business logic lives in `src/run` as functions over typed input. The Fastify
layer parses, authenticates, authorizes, and serializes. This is boundary
discipline, and it keeps the runner testable without booting the server.

## API contract

### Endpoints

- `GET /healthz` returns `200 { "status": "ok" }`.
- `GET /readyz` returns `200` when Chromium launches, otherwise `503`.
- `POST /v1/runs` runs one scenario.

### Auth

Every route except the health checks requires `Authorization: Bearer <API_KEY>`,
compared in constant time. A development default is allowed only when
`NODE_ENV` is not `production`; startup logs a warning.

### Request

```json
{
  "url": "http://fixture:4010/checkout",
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

`url` is required unless the first step is a `navigate` with its own URL.
`options.timeoutMs` and `options.stepTimeoutMs` may tighten the configured caps
but never exceed them.

### Named flows

The request body is a union. It carries either an inline `steps` array or a
`flow` name. Both accept `url`, `vars`, and `options`.

`FLOWS_FILE` points at a JSON object. Each key is a flow name. Each value holds
a `steps` array and optional `options`:

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

The loader validates every flow against the step schema at startup. A bad file
fails the process at boot, not per request. Templates inside a flow resolve from
the request `vars` and `secret.*`, exactly like inline steps. Request `options`
override the flow's `options` per key.

### Step union

A discriminated union on `action`: `navigate`, `fill`, `click`, `press`,
`selectOption`, `check`, `waitFor`, `assertVisible`, `assertText`, `assertUrl`,
`readText`, `readInputValue`. A new action forces the compiler to name every
place that must handle it.

### Locator union

`role` (with optional `name`), `label`, `testId`, `text`, `css`. Accessible
locators are preferred; `text` and `css` remain for sites without test ids.

### Response

`runId`, `status`, `target`, optional `finalUrl`, timestamps, `durationMs`,
`outputs`, per-step results, and `error`. `status` is `passed`, `failed`,
`timedOut`, or `rejected`.

Status codes: `200` completed run (including failure and timeout), `400` invalid
request or unresolved template, `401` bad key, `403` target not allowed, `409`
failed run when `?failOnRunFailure=true`, `413` body too large, `429`
concurrency limit, `502` unresolvable host. Fastify's own validation errors are
normalized to the same `{ error: { code, message } }` shape by an error handler.

### SSE

With `Accept: text/event-stream`, the response emits one `step` event per step
and a terminal `result` event with the same JSON, then closes. A `: ping`
comment every 15 seconds keeps intermediaries from idling the stream. A client
disconnect aborts the run and closes the context.

## Security and reliability

- **Allowlist.** `ALLOWED_TARGETS` entries are `scheme://host[:port][/path]`.
  Scheme, host, and port must match exactly and the path must start with the
  prefix. The default is local fixtures.
- **SSRF checks.** HTTP and HTTPS only. The host is resolved and metadata and
  link-local addresses are refused. A Playwright route handler checks every
  browser request against the allowlist, so redirects to disallowed hosts are
  blocked.
- **Auth.** Constant-time bearer key on every non-health route.
- **Limits.** Body size, step count, per-step timeout, per-run timeout,
  concurrency, and output size.
- **Isolation.** One fresh browser context per run, closed on every exit path.
- **Logging.** pino redacts the authorization header and cookies. Resolved
  secret values are redacted from error messages.
- **Secrets.** Only `RUN_SECRET_` variables are exposed to templates, as
  `${secret.NAME}`.

## Fixture and self-test

`fixture/server.ts` is a plain node http server with no framework:

- `GET /checkout` serves a form with labeled Email and Card number fields and a
  Place order button.
- `POST /orders` creates an order in memory and returns a confirmation page with
  a visible order id under `data-testid="order-id"`.
- `GET /orders/:id` returns JSON for server-side validation.
- `GET /form` serves a basic form with text, email, select, checkbox, and
  textarea fields, each under a label.
- `POST /form` creates a submission in memory and returns a result page with the
  values under `data-testid="result-*"` and an id under `data-testid="submission-id"`.
- `GET /submissions/:id` returns JSON for server-side validation.
- `POST /__reset` clears state.
- `GET /healthz` returns `200`.

The e2e test starts the fixture, sends a scenario to the API, asserts the run
status and `outputs.orderId`, then calls `GET /orders/:id` to prove the browser
flow changed server-side state. A second case fills the basic form through the
`basic-form` flow, reads back `outputs.submissionId`, and confirms the saved
values through `GET /submissions/:id`. It also exercises the SSE path, a failed
assertion, and an allowlist rejection.

## Docker and Compose

The Dockerfile is multi-stage. A single `runtime` target carries both the API
and the fixture; the fixture is started with a command override and never
exposed in production. The runtime stage installs production dependencies only
and runs as `pwuser`.

`docker-compose.yml` defines the `api` service and a `fixture` service under the
`test` profile on a private network. The API reaches the fixture by service name
(`http://fixture:4010`). The API sets `shm_size: "1gb"` and `init: true`, and
passes `--no-sandbox` because CI service containers often lack the seccomp
capabilities Chromium's sandbox needs.

## Postman and newman

`postman/collection.json` uses `{{baseUrl}}`, `{{targetUrl}}`, `{{formUrl}}`,
and `{{apiKey}}` for Postman's own variables, and `${...}` for run-level
variables. It holds three requests. The first sends inline steps. The second
sends `flow: "checkout"`. The third sends `flow: "basic-form"`. All assert
`status === 'passed'` and capture an id from `outputs`.
`postman/environment.template.json` holds placeholders only.
`scripts/newman.mjs` and `scripts/postman-cli.mjs` run the collection with values
from environment variables, which keeps the commands working on Windows and
Linux. The Postman CLI script fetches the CLI through `npx`, so no dependency is
added to the image or the lockfile.

## GitHub Actions

- `ci.yml` calls the `repo-standard` lint, aislop, and security workflows by
  pinned SHA, then runs typecheck, unit, integration, e2e, and build.
- `postman.yml` runs on every pull request. It builds the image, starts the api
  and fixture containers on a Docker network, waits for readiness, and runs the
  collection through both newman and the Postman CLI.
- `publish.yml` builds a multi-arch image and pushes it to GHCR on main and tags
  with `sha`, `latest`, and semver tags, then runs both clients against the
  published image.

## Testing

- **Unit:** allowlist parsing and matching, template resolution and redaction,
  secret loading, limit clamping, flow loading and named-flow resolution. No
  browser.
- **Integration:** routes with Fastify `inject` and a fake browser pool, covering
  auth, validation, allowlist, and concurrency.
- **E2E:** real Chromium against the fixture, asserted through the API result and
  the fixture's own API, over real HTTP for both transports.

## Implementation notes and deviations from the original plan

- **Variable syntax changed from `{{name}}` to `${name}`.** Postman and newman
  substitute `{{...}}` in request bodies, so the original syntax collided with
  the clients. This was the concrete drawback the plan said to watch for.
- **One image instead of two targets.** The original plan kept the fixture out of
  the runtime image. A single image with a fixture command override is simpler,
  works with GitHub service containers, and the fixture is tiny and profile
  gated.
- **Error responses are normalized.** Fastify's default validation error shape
  did not match the declared error schema, so an error handler formats all
  failures to `{ error: { code, message } }`.
- **Secrets are namespaced.** `${secret.NAME}` reads `RUN_SECRET_NAME`, never the
  whole environment.

## Verification

Ran locally on Node 24.19.0 on 2026-09-27:

- `npm run typecheck` clean.
- `npx vitest run` green: 32 unit and integration tests plus 4 e2e tests.
- The e2e test passed a full checkout flow through real Chromium, returned
  `outputs.orderId`, and confirmed the order through the fixture API.
- SSE returned `step` events and a terminal `result` event with `"status":"passed"`.

Ran locally on Node 24.19.0 on 2026-09-28, for named flows, the basic-form
walkthrough, and both Postman clients:

- `npm run typecheck` clean.
- `npx vitest run` green: 36 unit tests, 9 integration tests, and 6 e2e tests.
- The e2e suite ran the named `checkout` flow and the `basic-form` flow through
  real Chromium, returned `outputs.orderId` and `outputs.submissionId`, and
  confirmed the saved order and submission through the fixture API.
- A direct `POST /v1/runs` with `flow: "basic-form"` returned `status: "passed"`,
  all eleven steps passed, and `outputs` carried `nameValue` and `submissionId`.
- With the fixture and API running locally, `npm run newman` and `npm run postman`
  each ran all three collection requests. The inline request, the named checkout
  request, and the basic-form request all passed. The Postman CLI ran from the
  collection file with no login and no API key.
- `gitleaks detect` over the branch history found no leaks.

Docker, Compose, and the GitHub Actions workflows were written but not executed
on this machine, which has no Docker. Verify them where Docker is available
before relying on them.

## Open items

- Adopt the `repo-standard` rulesets. GitHub does not apply rulesets to a private
  repository on the free plan, so `protect-main` is written and waiting for the
  public flip. The apply script reports it and stops while private.
- Resolve the moderate and high advisories reported by `npm audit`, most of which
  come from newman's dependency tree (a dev dependency).
- Decide the artifact policy if screenshots or traces are ever wanted.
- Optionally slim the image by deleting non-Chromium browsers, measured against
  build time.

## References

- [Playwright installation and supported runtimes](https://playwright.dev/docs/intro)
- [Playwright Docker guidance](https://playwright.dev/docs/docker)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright locators](https://playwright.dev/docs/locators)
- [Fastify documentation](https://fastify.dev/docs/latest/)
- [Postman SSE support announcement](https://blog.postman.com/support-for-server-sent-events/)
- [newman SSE support issue](https://github.com/postmanlabs/newman/issues/1156)
- [Node.js release schedule](https://github.com/nodejs/release)
