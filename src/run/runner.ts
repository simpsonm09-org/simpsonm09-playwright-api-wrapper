import { randomUUID } from "node:crypto";

import type { BrowserContext, Page } from "playwright";

import type { TargetGuard } from "../config/allowlist.js";
import type { Config } from "../config/env.js";
import type { FlowRegistry } from "../config/flows.js";
import type { RunOptions, RunRequest, Step } from "../schema/request.js";
import type {
  RunError,
  RunResult,
  RunStatus,
  StepResult,
} from "../schema/response.js";
import type { BrowserPool } from "./browser.js";
import { ERROR_CODES, isRunFailure, RunFailure } from "./errors.js";
import {
  assertOutputsWithinLimit,
  assertStepCount,
  resolveLimits,
} from "./limits.js";
import { executeStep } from "./steps.js";
import { makeTemplateResolver, redactSecrets } from "./template.js";

export interface RunEventSink {
  onStep?(result: StepResult): void;
}

export interface RunnerDeps {
  readonly config: Config;
  readonly pool: BrowserPool;
  readonly guard: TargetGuard;
}

export interface RunMeta {
  readonly sink?: RunEventSink;
  readonly signal?: AbortSignal;
}

/**
 * A run request after boundary work: templates resolved, target chosen.
 * The route builds this so it can authorize the target before execution.
 */
export interface PreparedRun {
  readonly steps: Step[];
  readonly url?: string;
  readonly target: string;
  readonly options?: RunOptions;
  readonly usedSecrets: readonly string[];
}

/** Resolve templates and pick the target. Throws RunFailure for bad input. */
export function prepareRun(
  request: RunRequest,
  secrets: Readonly<Record<string, string>>,
  flows: FlowRegistry,
): PreparedRun {
  const flow = "flow" in request ? flows.get(request.flow) : undefined;
  if ("flow" in request && flow === undefined) {
    throw new RunFailure(
      ERROR_CODES.FLOW_NOT_FOUND,
      `Unknown flow: ${request.flow}`,
    );
  }

  const resolver = makeTemplateResolver({ vars: request.vars ?? {}, secrets });
  const rawSteps = "steps" in request ? request.steps : (flow?.steps ?? []);
  const steps = rawSteps.map((step) => resolver.resolveDeep(step));
  const url =
    request.url === undefined ? undefined : resolver.resolveString(request.url);
  const first = steps[0];
  const target = url ?? (first?.action === "navigate" ? first.url : undefined);
  if (target === undefined) {
    throw new RunFailure(
      ERROR_CODES.NAVIGATION_FAILED,
      "url is required unless the first step is navigate",
    );
  }
  const options = { ...(flow?.options ?? {}), ...(request.options ?? {}) };
  return {
    steps,
    ...(url === undefined ? {} : { url }),
    target,
    ...(Object.keys(options).length === 0 ? {} : { options }),
    usedSecrets: resolver.usedSecretValues(),
  };
}

function toFailure(error: unknown, stepIndex?: number): RunFailure {
  if (isRunFailure(error)) return error;
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return new RunFailure(ERROR_CODES.TIMEOUT, error.message, stepIndex);
    }
    return new RunFailure(ERROR_CODES.INTERNAL, error.message, stepIndex);
  }
  return new RunFailure(ERROR_CODES.INTERNAL, String(error), stepIndex);
}

function statusFor(failure: RunFailure): RunStatus {
  if (failure.code === ERROR_CODES.TIMEOUT) return "timedOut";
  if (failure.code === ERROR_CODES.TARGET_NOT_ALLOWED) return "rejected";
  if (failure.code === ERROR_CODES.TARGET_UNRESOLVABLE) return "rejected";
  return "failed";
}

function buildError(
  failure: RunFailure,
  secretValues: readonly string[],
): RunError {
  const message = redactSecrets(failure.message, secretValues);
  return failure.stepIndex === undefined
    ? { code: failure.code, message }
    : { code: failure.code, message, stepIndex: failure.stepIndex };
}

function withBudget<T>(promise: Promise<T>, budgetMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new RunFailure(ERROR_CODES.TIMEOUT, `Run exceeded its time budget`),
        ),
      budgetMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function executeRun(
  prepared: PreparedRun,
  deps: RunnerDeps,
  meta: RunMeta,
): Promise<RunResult> {
  const startedAt = new Date();
  const runId = randomUUID();
  const limits = resolveLimits(deps.config, prepared.options);
  const secretValues = prepared.usedSecrets;

  const outputs: Record<string, string> = {};
  const stepResults: StepResult[] = [];
  let status: RunStatus = "passed";
  let error: RunError | null = null;
  let finalUrl: string | undefined;
  let browserContext: BrowserContext | undefined;

  try {
    assertStepCount(prepared.steps.length, deps.config);

    const browser = await deps.pool.get();
    browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    browserContext.setDefaultTimeout(limits.stepTimeoutMs);
    browserContext.setDefaultNavigationTimeout(limits.stepTimeoutMs);
    await browserContext.route("**/*", (route) => {
      if (deps.guard.isRequestAllowed(route.request().url()))
        return route.continue();
      return route.abort("blockedbyclient");
    });

    const page: Page = await browserContext.newPage();
    if (prepared.url !== undefined) {
      await page.goto(prepared.url, { waitUntil: "domcontentloaded" });
    }

    const deadline = Date.now() + limits.runTimeoutMs;
    for (let index = 0; index < prepared.steps.length; index += 1) {
      const step = prepared.steps[index];
      if (step === undefined) continue;
      if (meta.signal?.aborted === true) {
        throw new RunFailure(ERROR_CODES.INTERNAL, "client disconnected");
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new RunFailure(
          ERROR_CODES.TIMEOUT,
          `Run exceeded ${limits.runTimeoutMs}ms`,
        );
      }
      const stepStart = Date.now();
      try {
        await withBudget(
          executeStep(page, step, index, { guard: deps.guard }, outputs),
          remaining,
        );
        const stepResult: StepResult = {
          index,
          action: step.action,
          status: "passed",
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(stepResult);
        meta.sink?.onStep?.(stepResult);
      } catch (stepError) {
        const stepResult: StepResult = {
          index,
          action: step.action,
          status: "failed",
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(stepResult);
        meta.sink?.onStep?.(stepResult);
        throw toFailure(stepError, index);
      }
    }

    finalUrl = page.url();
    assertOutputsWithinLimit(outputs, deps.config);
  } catch (caught) {
    const failure = toFailure(caught);
    status = statusFor(failure);
    error = buildError(failure, secretValues);
  } finally {
    if (browserContext !== undefined) {
      await browserContext.close().catch(() => undefined);
    }
  }

  const finishedAt = new Date();
  return {
    runId,
    status,
    target: prepared.target,
    ...(finalUrl === undefined ? {} : { finalUrl }),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    outputs,
    steps: stepResults,
    error,
  };
}
