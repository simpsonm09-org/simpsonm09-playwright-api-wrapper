# SSE stream

With `Accept: text/event-stream`, `POST /v1/runs` returns a live Server-Sent Events stream instead of a single JSON body: one `step` event as each step completes and a terminal `result` event carrying the same JSON the blocking response would return.

## Sub-features

- `sse-step-events` emits one `step` event per completed step, in order.
- `sse-result-event` emits the terminal `result` event with the full run result.
- `sse-ping` sends a `: ping` comment every 15 seconds to keep intermediaries from idling the stream.
- `sse-abort` aborts the run and closes the browser context when the client disconnects.

## How to get to it (user POV)

- POST the same request body to `http://127.0.0.1:3010/v1/runs` with header `Accept: text/event-stream`.
- Read events until the `result` event arrives; the server then closes the stream.

## Driving it with curl and the drive helper

Preconditions: Launch is done, `/readyz` returned `200`.

- **Every feature at once.** Run `node .opencode/skills/verify/scripts/drive.mjs --base-url http://127.0.0.1:3010 --fixture-url http://127.0.0.1:4010 --out artifacts/verify`; it writes the raw bytes to `artifacts/verify/sse-stream/stream.txt` and a `meta.json` with event counts.
- **By hand.** `curl -N -s http://127.0.0.1:3010/v1/runs -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' -H 'Accept: text/event-stream' -d '<checkout body>'`.
- **Assert.** The stream contains `event: step` lines, one `event: result`, and `"status":"passed"` inside that result event.
- **Proof.** Keep `artifacts/verify/sse-stream/stream.txt` and `artifacts/verify/sse-stream/meta.json`.

## Gotchas

- `curl` buffers by default; use `-N` or the stream appears empty until it closes.
- The reply is hijacked once streaming starts, so a later failure arrives as a `result` event with `"status":"failed"`, not as an HTTP error status; the status line is already `200`.
- The SSE path is only exercised by asking for it; a plain JSON call proves the blocking transport, not this one.
- A client disconnect aborts the run, so do not drop the connection halfway when asserting a pass.
