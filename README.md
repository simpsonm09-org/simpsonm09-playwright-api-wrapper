# playwright-api-wrapper

A small HTTP API that runs one Playwright browser scenario per request. A caller sends a target URL and a declarative step script, and the API returns a structured result. Postman, newman, and GitHub Actions are the intended callers.

The original lives in `simpsonm09-org/simpsonm09-playwright-api-wrapper`; work happens on the personal fork. See [`repo-standard`](https://github.com/simpsonm09-org/simpsonm09-repo-standard).

## What it does

The request carries the whole scenario: the URL, the ordered steps, and the values to enter, including test data such as a test card. The response reports the run status and any values read from the page, so a later API call can verify server-side state.

## Quick start

```bash
just install
just verify
```

To run the API locally or with Docker Compose, see [`docs/development.md`](docs/development.md).

## Commands

| Command | Does |
| --- | --- |
| `just install` | Installs the pinned tools. |
| `just lint` | Runs the linters. |
| `just test` | Runs the unit, integration, and e2e tests. |
| `just verify` | Lints and tests. |

## Documentation

Read [`docs/README.md`](docs/README.md) for the design, the API, security, and development.

## License

MIT. See [`LICENSE`](LICENSE).

## Related repositories

- [`repo-standard`](https://github.com/simpsonm09-org/simpsonm09-repo-standard) owns the shared CI, linting, security, and governance.
