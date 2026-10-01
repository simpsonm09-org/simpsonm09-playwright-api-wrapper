# Development

## Local, without Docker

```sh
npm install
npx playwright install chromium
cp .env.example .env
npm run dev            # API on http://127.0.0.1:3000
npm run fixture        # fixture site on http://127.0.0.1:4010
```

## Docker Compose

Compose runs the API and the fixture under the `test` profile. Both are published to localhost.

```sh
cp .env.example .env
npm run compose:test        # api on :3000, fixture on :4010
```

The Compose API runs with `NODE_ENV=development` so the development API key works. The image itself defaults to production, which refuses that key.

## Postman and newman

Both clients run `postman/collection.json`.

```sh
WRAPPER_URL=http://localhost:3000 \
TARGET_URL=http://127.0.0.1:4010/checkout \
API_KEY=dev-local-key \
npm run newman
```

```sh
WRAPPER_URL=http://localhost:3000 \
TARGET_URL=http://127.0.0.1:4010/checkout \
API_KEY=dev-local-key \
npm run postman
```

newman is a local dev dependency. The Postman CLI is fetched on demand by `npx`.

## Tests

```sh
npm run typecheck      # tsc --noEmit
npm test               # unit, integration, and e2e
npm run test:unit
npm run test:integration
npm run test:e2e       # needs npx playwright install chromium
npm run build          # emits dist/
```

The e2e test starts the fixture, drives a real Chromium run through the API, and verifies the server-side effect through the fixture's own API.

## Continuous integration

`ci.yml` runs typecheck, unit, integration, e2e, and build. `postman.yml` runs on every pull request, builds the image, starts it with the fixture, and runs the collection through both newman and the Postman CLI. `publish.yml` builds a multi-arch image, pushes it to GHCR, then runs both clients against the published image.

## Verify the basic form

The fixture serves a basic form at `/form`. The named flow `basic-form` fills it, submits it, and reads the result back.

```sh
export API_KEY=dev-local-key
curl -sS http://127.0.0.1:3000/v1/runs \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "flow": "basic-form", "url": "http://127.0.0.1:4010/form", "vars": { "name": "Ada Lovelace", "email": "ada@example.test", "plan": "pro", "notes": "filled by the wrapper" } }'
```

The response reports `status: "passed"` and the values the browser read back. Confirm the saved state through the fixture's own API.

```sh
curl -sS http://127.0.0.1:4010/submissions/sub_1001
```
