import { describe, expect, it } from "vitest";

import type { FlowRegistry } from "../../src/config/flows.js";
import { ERROR_CODES, isRunFailure } from "../../src/run/errors.js";
import { prepareRun } from "../../src/run/runner.js";

const url = "http://localhost:4010/checkout";

const flows: FlowRegistry = new Map([
  [
    "checkout",
    {
      steps: [
        {
          action: "fill",
          target: { by: "label", text: "Email" },
          value: "${email}",
        },
        { action: "assertUrl", contains: "${path}" },
      ],
      options: { timeoutMs: 5000 },
    },
  ],
]);

describe("prepareRun", () => {
  it("runs inline steps and picks the target from the url", () => {
    const prepared = prepareRun(
      {
        url,
        steps: [
          {
            action: "assertVisible",
            target: { by: "testId", value: "order-id" },
          },
        ],
      },
      {},
      flows,
    );
    expect(prepared.steps).toHaveLength(1);
    expect(prepared.target).toBe(url);
  });

  it("resolves a named flow and templates from vars", () => {
    const prepared = prepareRun(
      { flow: "checkout", url, vars: { email: "qa@test", path: "/orders" } },
      {},
      flows,
    );
    expect(prepared.steps).toHaveLength(2);
    expect(prepared.steps[0]).toMatchObject({
      action: "fill",
      value: "qa@test",
    });
    expect(prepared.steps[1]).toMatchObject({
      action: "assertUrl",
      contains: "/orders",
    });
    expect(prepared.target).toBe(url);
  });

  it("lets request options override flow options", () => {
    const prepared = prepareRun(
      {
        flow: "checkout",
        url,
        vars: { email: "qa@test", path: "/orders" },
        options: { timeoutMs: 2000 },
      },
      {},
      flows,
    );
    expect(prepared.options?.timeoutMs).toBe(2000);
  });

  it("rejects an unknown flow name", () => {
    try {
      prepareRun({ flow: "missing", url }, {}, flows);
      expect.unreachable("prepareRun should have thrown");
    } catch (error) {
      expect(isRunFailure(error)).toBe(true);
      if (isRunFailure(error))
        expect(error.code).toBe(ERROR_CODES.FLOW_NOT_FOUND);
    }
  });

  it("rejects a named flow with no url and no navigate step", () => {
    const registry: FlowRegistry = new Map([
      ["noop", { steps: [{ action: "assertUrl", contains: "/x" }] }],
    ]);
    expect(() => prepareRun({ flow: "noop" }, {}, registry)).toThrow(
      /url is required/,
    );
  });
});
