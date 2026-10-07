# Security

- **Allowlist.** `ALLOWED_TARGETS` is a comma-separated list of `scheme://host[:port][/path]` entries. Scheme, host, and port must match, and the path must start with the entry's prefix. The default is local fixtures.
- **SSRF checks.** HTTP and HTTPS only. The host is resolved and metadata and link-local addresses are refused. Every browser request is checked against the allowlist, so redirects to disallowed hosts are blocked.
- **Auth.** Bearer key required on every route except the health checks.
- **Limits.** Body size, step count, per-step timeout, per-run timeout, concurrency, output size, and a per-client request rate, all environment driven.
- **Isolation.** A fresh browser context per run, closed on success, failure, timeout, validation error, or client disconnect.
- **Logging.** The authorization header and cookies are redacted. Resolved secret values are redacted from error messages.

This service is built for local development and controlled CI. It is not safe to expose publicly without authentication review and deployment hardening.
