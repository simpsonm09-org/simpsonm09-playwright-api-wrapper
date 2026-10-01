export const ERROR_CODES = {
  TARGET_NOT_ALLOWED: 'TARGET_NOT_ALLOWED',
  TARGET_UNRESOLVABLE: 'TARGET_UNRESOLVABLE',
  NAVIGATION_FAILED: 'NAVIGATION_FAILED',
  STEP_FAILED: 'STEP_FAILED',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  TEMPLATE_FAILED: 'TEMPLATE_FAILED',
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  CONCURRENCY_LIMIT: 'CONCURRENCY_LIMIT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** A failure that should surface in the run result rather than crash the server. */
export class RunFailure extends Error {
  readonly code: ErrorCode;
  readonly stepIndex: number | undefined;

  constructor(code: ErrorCode, message: string, stepIndex?: number) {
    super(message);
    this.name = 'RunFailure';
    this.code = code;
    this.stepIndex = stepIndex;
  }
}

export function isRunFailure(value: unknown): value is RunFailure {
  return value instanceof RunFailure;
}
