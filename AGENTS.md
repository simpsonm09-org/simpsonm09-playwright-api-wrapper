# playwright-api-wrapper working agreements

A Fastify service that runs one Playwright browser scenario per request.

## Ground rules

- The run DSL is declarative. Never add an action that executes caller-supplied JavaScript, shell, or `eval`.
- One fresh browser context per run, closed on every exit path.
- Every browser request is checked against `ALLOWED_TARGETS`. Do not bypass the route handler.
- Only `RUN_SECRET_` variables reach templates. Keep secrets redacted in logs and error messages.
- No secret, credential, or machine path is committed.

## Commands

- `just install`, `just lint`, `just test`, `just verify`.

## Repo facts

- Language and toolchain: Node 24, Fastify 5, TypeScript 5.9 strict, Playwright 1.63, Vitest.
- Business logic lives in `src/run` as functions over typed input. The Fastify layer only parses, authenticates, authorizes, and serializes.
- The request carries either an inline `steps` array or a `flow` name. Flows load at startup from `FLOWS_FILE` and are validated against the step schema.
- Variables use `${name}` and `${secret.NAME}`. Do not use `{{...}}`, because Postman and newman substitute that form.
- Docs: `docs/api.md`, `docs/security.md`, `docs/design.md`, `docs/development.md`.

## Skills

No repo-local skills. General best practices and integration come from the plugins.
