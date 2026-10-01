import { buildApp } from "../src/app.js";
import { createTargetGuard } from "../src/config/allowlist.js";
import { type Config, loadConfig } from "../src/config/env.js";
import type { FlowRegistry } from "../src/config/flows.js";
import type { AppDeps } from "../src/deps.js";
import type { BrowserPool } from "../src/run/browser.js";
import { ConcurrencyGate } from "../src/run/concurrency.js";

export const TEST_API_KEY = "test-key";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: "test",
    API_KEY: TEST_API_KEY,
    LOG_LEVEL: "silent",
    ...overrides,
  });
}

/** A pool that fails if a test tries to launch a real browser. */
export function fakePool(): BrowserPool {
  const pool = {
    get: async (): Promise<never> => {
      throw new Error("browser must not be used in this test");
    },
    ready: async (): Promise<boolean> => true,
    close: async (): Promise<void> => undefined,
  };
  return pool as unknown as BrowserPool;
}

export interface TestAppOptions {
  config?: Config;
  pool?: BrowserPool;
  gate?: ConcurrencyGate;
  secrets?: Record<string, string>;
  flows?: FlowRegistry;
}

export function buildTestApp(options: TestAppOptions = {}) {
  const config = options.config ?? testConfig();
  const deps: AppDeps = {
    config,
    pool: options.pool ?? fakePool(),
    guard: createTargetGuard(config.allowedTargets),
    gate: options.gate ?? new ConcurrencyGate(config.maxConcurrentRuns),
    secrets: options.secrets ?? {},
    flows: options.flows ?? new Map(),
  };
  return { app: buildApp(deps), deps };
}

export function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${TEST_API_KEY}`,
    "content-type": "application/json",
  };
}
