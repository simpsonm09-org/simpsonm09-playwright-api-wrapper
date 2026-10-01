import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFixture } from "../../fixture/server.js";
import { loadFlows } from "../../src/config/flows.js";
import { BrowserPool } from "../../src/run/browser.js";
import { buildTestApp, TEST_API_KEY, testConfig } from "../helpers.js";

interface Fixture {
  port: number;
  close: () => Promise<void>;
}

interface RunResultLike {
  status: string;
  outputs: Record<string, string>;
  error: { code: string } | null;
}

interface OrderLike {
  email: string;
  cardLast4: string;
}

let fixture: Fixture;
let pool: BrowserPool;
let app: ReturnType<typeof buildTestApp>["app"];
let base: string;
let origin: string;

function scenario() {
  return {
    url: `${origin}/checkout`,
    vars: { email: "qa@example.test", card: "4242424242424242" },
    options: { timeoutMs: 30000, stepTimeoutMs: 10000 },
    steps: [
      {
        action: "fill",
        target: { by: "label", text: "Email" },
        value: "${email}",
      },
      {
        action: "fill",
        target: { by: "label", text: "Card number" },
        value: "${card}",
      },
      {
        action: "click",
        target: { by: "role", role: "button", name: "Place order" },
      },
      {
        action: "assertText",
        target: { by: "text", text: "Order received" },
        contains: "Order received",
      },
      {
        action: "readText",
        target: { by: "testId", value: "order-id" },
        as: "orderId",
      },
    ],
  };
}

function postRun(
  body: unknown,
  headers: Record<string, string> = {},
  path = "/v1/runs",
) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_API_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  fixture = await startFixture(0);
  origin = `http://127.0.0.1:${fixture.port}`;
  const config = testConfig({
    ALLOWED_TARGETS: origin,
    RUN_TIMEOUT_MS: "30000",
  });
  pool = new BrowserPool(config);
  ({ app } = buildTestApp({
    config,
    pool,
    flows: loadFlows("flows/flows.json"),
  }));
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
  await pool.close();
  await fixture.close();
});

describe("end-to-end browser run", () => {
  it("runs a checkout flow, returns outputs, and changes server state", async () => {
    await fetch(`${origin}/__reset`, { method: "POST" });
    const response = await postRun(scenario());
    expect(response.status).toBe(200);
    const result = (await response.json()) as RunResultLike;
    expect(result.status).toBe("passed");
    expect(result.outputs.orderId).toMatch(/^ord_/);

    const orderResponse = await fetch(
      `${origin}/orders/${result.outputs.orderId}`,
    );
    expect(orderResponse.status).toBe(200);
    const order = (await orderResponse.json()) as OrderLike;
    expect(order.email).toBe("qa@example.test");
    expect(order.cardLast4).toBe("4242");
  }, 60_000);

  it("runs the named checkout flow loaded from FLOWS_FILE", async () => {
    await fetch(`${origin}/__reset`, { method: "POST" });
    const response = await postRun({
      flow: "checkout",
      url: `${origin}/checkout`,
      vars: { email: "flow@example.test", card: "4242424242424242" },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as RunResultLike;
    expect(result.status).toBe("passed");
    expect(result.outputs.orderId).toMatch(/^ord_/);

    const order = (await (
      await fetch(`${origin}/orders/${result.outputs.orderId}`)
    ).json()) as OrderLike;
    expect(order.email).toBe("flow@example.test");
  }, 60_000);

  it("fills the basic form and reads back the submission", async () => {
    await fetch(`${origin}/__reset`, { method: "POST" });
    const response = await postRun({
      flow: "basic-form",
      url: `${origin}/form`,
      vars: {
        name: "Ada Lovelace",
        email: "ada@example.test",
        plan: "pro",
        notes: "filled by the wrapper",
      },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as RunResultLike;
    expect(result.status).toBe("passed");
    expect(result.outputs.submissionId).toMatch(/^sub_/);
    expect(result.outputs.nameValue).toBe("Ada Lovelace");

    const submission = (await (
      await fetch(`${origin}/submissions/${result.outputs.submissionId}`)
    ).json()) as Record<string, string>;
    expect(submission.name).toBe("Ada Lovelace");
    expect(submission.email).toBe("ada@example.test");
    expect(submission.plan).toBe("pro");
    expect(submission.news).toBe("yes");
    expect(submission.notes).toBe("filled by the wrapper");
  }, 60_000);

  it("streams step events and a terminal result over SSE", async () => {
    await fetch(`${origin}/__reset`, { method: "POST" });
    const response = await postRun(scenario(), { accept: "text/event-stream" });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("event: step");
    expect(text).toContain("event: result");
    expect(text).toContain('"status":"passed"');
  }, 60_000);

  it("reports a failed assertion with the failOnRunFailure status", async () => {
    const response = await postRun(
      {
        url: `${origin}/checkout`,
        options: { stepTimeoutMs: 1000 },
        steps: [
          {
            action: "assertText",
            target: { by: "text", text: "No such element" },
            contains: "nope",
          },
        ],
      },
      {},
      "/v1/runs?failOnRunFailure=true",
    );
    expect(response.status).toBe(409);
    const result = (await response.json()) as RunResultLike;
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("ASSERTION_FAILED");
  }, 60_000);

  it("rejects a target outside the allowlist", async () => {
    const response = await postRun({
      url: "http://169.254.169.254/",
      steps: [{ action: "navigate", url: "http://169.254.169.254/" }],
    });
    expect(response.status).toBe(403);
  });
});
