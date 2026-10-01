import type { TargetGuard } from "./config/allowlist.js";
import type { Config } from "./config/env.js";
import type { FlowRegistry } from "./config/flows.js";
import type { BrowserPool } from "./run/browser.js";
import type { ConcurrencyGate } from "./run/concurrency.js";

export interface AppDeps {
  readonly config: Config;
  readonly pool: BrowserPool;
  readonly guard: TargetGuard;
  readonly gate: ConcurrencyGate;
  readonly secrets: Readonly<Record<string, string>>;
  readonly flows: FlowRegistry;
}
