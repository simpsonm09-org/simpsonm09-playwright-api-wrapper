# Named flow run

A named flow lets a caller send `flow: "name"` instead of an inline `steps` array. Flows load once at startup from `FLOWS_FILE`, each holding its own steps and optional options, so the same scenario runs against any target supplied in the request.

## Sub-features

- `flow-checkout` runs the `checkout` flow: fill, fill, click, assert, read.
- `flow-basic-form` runs the `basic-form` flow, which exercises text, email, select, checkbox, and textarea fields plus a readback.
- `flow-options` merges the flow's `options` with the request's `options`, request keys winning.
- `flow-not-found` returns `400 FLOW_NOT_FOUND` for an unknown name.

## How to get to it (user POV)

- POST `{"flow":"basic-form","url":"http://127.0.0.1:4010/form","vars":{"name":"Ada Lovelace","email":"ada@example.test","plan":"pro","notes":"filled by the wrapper"}}` to `http://127.0.0.1:3010/v1/runs`.
- Read `status` and `outputs` from the response; the flow itself carries no URL, so the request still supplies it.

## Driving it with curl and the drive helper

Preconditions: Launch is done, `/readyz` returned `200`, and `FLOWS_FILE=flows/flows.json` resolves from the repo root.

- **Every feature at once.** Run `node .opencode/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify`.
- **Basic form.** POST the body above. Status `200`, `status: "passed"`, `outputs.submissionId` matches `^sub_`, and `outputs.nameValue` is `"Ada Lovelace"`.
- **Server-side state.** `curl -s http://127.0.0.1:4010/submissions/<submissionId>`. Status `200` with `plan: "pro"` and the submitted fields.
- **Proof.** Keep `artifacts/verify/named-flow/response.json` and `artifacts/verify/named-flow/fixture-submission.json`.

## Gotchas

- A flow stays environment-agnostic: `url` and `vars` always come from the request, so a named run still needs a `url` or a leading `navigate`.
- `FLOWS_FILE` is resolved relative to the process working directory; start the service from the repo root or the file is not found at boot.
- A malformed flows file fails the process at startup, not per request.
- An unknown flow name is validated before any browser opens, so it returns `400` without a run.
- Prove the flow path with `flow` and no `steps` array; sending inline steps verifies the inline feature instead.
