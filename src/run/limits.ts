import type { Config } from '../config/env.js';
import type { RunOptions } from '../schema/request.js';
import { ERROR_CODES, RunFailure } from './errors.js';

export interface Limits {
  readonly runTimeoutMs: number;
  readonly stepTimeoutMs: number;
  readonly failFast: boolean;
}

function clamp(value: number, max: number): number {
  return Math.min(value, max);
}

/** Per-request options may tighten the configured caps, never exceed them. */
export function resolveLimits(config: Config, options?: RunOptions): Limits {
  const requestedRun = options?.timeoutMs ?? config.runTimeoutMs;
  const requestedStep = options?.stepTimeoutMs ?? config.stepTimeoutMs;
  return {
    runTimeoutMs: clamp(requestedRun, config.runTimeoutMs),
    stepTimeoutMs: clamp(requestedStep, config.stepTimeoutMs),
    failFast: options?.failFast ?? true,
  };
}

export function assertStepCount(count: number, config: Config): void {
  if (count > config.maxSteps) {
    throw new RunFailure(
      ERROR_CODES.LIMIT_EXCEEDED,
      `Step count ${count} exceeds MAX_STEPS ${config.maxSteps}`,
    );
  }
}

export function assertOutputsWithinLimit(
  outputs: Readonly<Record<string, string>>,
  config: Config,
): void {
  const size = Buffer.byteLength(JSON.stringify(outputs), 'utf8');
  if (size > config.maxOutputsBytes) {
    throw new RunFailure(
      ERROR_CODES.LIMIT_EXCEEDED,
      `Outputs size ${size} exceeds MAX_OUTPUTS_BYTES ${config.maxOutputsBytes}`,
    );
  }
}
