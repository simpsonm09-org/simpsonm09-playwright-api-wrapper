# Allowlist rejection

Every navigation target is checked against `ALLOWED_TARGETS` before a browser context opens, and every subsequent browser request is checked again. A target outside the allowlist is refused with `403` and never reaches the network.

## Sub-features

- `allow-scheme` refuses anything that is not `http` or `https`.
- `allow-rule` requires the scheme, host, and port to match exactly and the path to start with the entry's prefix.
- `allow-address` refuses metadata and link-local addresses even when a rule names the host.
- `allow-route` blocks in-page requests and redirects to a host outside the allowlist.

## How to get to it (user POV)

- POST `POST /v1/runs` with a `url` (or a leading `navigate`) that is not on `ALLOWED_TARGETS`, for example `http://169.254.169.254/`.
- The response is `403` with `error.code: "TARGET_NOT_ALLOWED"` and no run result.

## Driving it with curl and the drive helper

Preconditions: Launch is done and the service was started with `ALLOWED_TARGETS=http://127.0.0.1:4010`.

- **Every feature at once.** Run `node .claude/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify`.
- **By hand.** `curl -s -o - -w '\n%{http_code}\n' http://127.0.0.1:3010/v1/runs -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' -d '{"url":"http://169.254.169.254/","steps":[{"action":"navigate","url":"http://169.254.169.254/"}]}'`. Status `403` and body `{"error":{"code":"TARGET_NOT_ALLOWED","message":"..."}}`.
- **Proof.** Keep `artifacts/verify/allowlist-rejection/response.json`.

## Gotchas

- `502 TARGET_UNRESOLVABLE` is a different case: the rule matched and the host failed to resolve. Do not report a `502` as an allowlist rejection.
- The check runs before a browser context opens, so no browser traffic occurs for a rejected target.
- Verification allowlists only `http://127.0.0.1:4010`; anything else, including another loopback port, is rejected.
- Redirects and in-page requests are checked per request, so an allowlisted page that redirects off-host is blocked mid-run.
