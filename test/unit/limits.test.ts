import { describe, expect, it } from "vitest";

import {
  assertOutputsWithinLimit,
  assertStepCount,
  resolveLimits,
} from "../../src/run/limits.js";
import { testConfig } from "../helpers.js";

describe("resolveLimits", () => {
  const config = testConfig({
    RUN_TIMEOUT_MS: "60000",
    STEP_TIMEOUT_MS: "15000",
  });

  it("uses configured defaults", () => {
    expect(resolveLimits(config, undefined)).toEqual({
      runTimeoutMs: 60000,
      stepTimeoutMs: 15000,
      failFast: true,
    });
  });

  it("clamps a request below the configured cap but never above it", () => {
    expect(resolveLimits(config, { timeoutMs: 5000 }).runTimeoutMs).toBe(5000);
    expect(resolveLimits(config, { timeoutMs: 600000 }).runTimeoutMs).toBe(
      60000,
    );
  });
});

describe("assertStepCount", () => {
  const config = testConfig({ MAX_STEPS: "3" });

  it("accepts a count within the cap", () => {
    expect(() => assertStepCount(3, config)).not.toThrow();
  });

  it("rejects a count over the cap", () => {
    expect(() => assertStepCount(4, config)).toThrow(/MAX_STEPS/);
  });
});

describe("assertOutputsWithinLimit", () => {
  const config = testConfig({ MAX_OUTPUTS_BYTES: "256" });

  it("accepts small outputs", () => {
    expect(() =>
      assertOutputsWithinLimit({ id: "ord_1" }, config),
    ).not.toThrow();
  });

  it("rejects oversized outputs", () => {
    expect(() =>
      assertOutputsWithinLimit({ blob: "x".repeat(300) }, config),
    ).toThrow(/MAX_OUTPUTS_BYTES/);
  });
});
