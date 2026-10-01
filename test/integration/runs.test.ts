import { describe, expect, it } from "vitest";

import type { FlowRegistry } from "../../src/config/flows.js";
import { ConcurrencyGate } from "../../src/run/concurrency.js";
import { authHeaders, buildTestApp, testConfig } from "../helpers.js";

const localTarget = "http://localhost:3000";
const validBody = {
  url: `${localTarget}/checkout`,
  steps: [{ action: "navigate", url: `${localTarget}/checkout` }],
};

const flows: FlowRegistry = new Map([
  [
    "checkout",
    { steps: [{ action: "navigate", url: `${localTarget}/checkout` }] },
  ],
]);

describe("run route", () => {
  it("exposes health without auth", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a request without an API key", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      payload: validBody,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a request with a wrong API key", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: {
        authorization: "Bearer wrong",
        "content-type": "application/json",
      },
      payload: validBody,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an invalid body", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: { steps: [] },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an unknown template variable", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: {
        url: `${localTarget}/\${missing}`,
        steps: [{ action: "navigate", url: `${localTarget}/\${missing}` }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an unknown named flow", async () => {
    const { app } = buildTestApp({ flows });
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: { flow: "missing", url: `${localTarget}/checkout` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("FLOW_NOT_FOUND");
    await app.close();
  });

  it("accepts a known named flow and reaches execution", async () => {
    const config = testConfig({ ALLOWED_TARGETS: localTarget });
    const { app } = buildTestApp({ config, flows });
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: { flow: "checkout", url: `${localTarget}/checkout` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().target).toBe(`${localTarget}/checkout`);
    await app.close();
  });

  it("rejects a target outside the allowlist", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: {
        url: "http://example.com/",
        steps: [{ action: "navigate", url: "http://example.com/" }],
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns 429 when the concurrency limit is reached", async () => {
    const config = testConfig({ ALLOWED_TARGETS: localTarget });
    const gate = new ConcurrencyGate(1);
    const release = gate.tryAcquire();
    const { app } = buildTestApp({ config, gate });
    const response = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: authHeaders(),
      payload: validBody,
    });
    expect(response.statusCode).toBe(429);
    release?.();
    await app.close();
  });
});
