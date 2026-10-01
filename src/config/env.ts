import { parseAllowedTargets, type TargetRule } from './allowlist.js';

export interface Config {
  readonly nodeEnv: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly apiKey: string;
  readonly apiKeyIsDefault: boolean;
  readonly allowedTargets: TargetRule[];
  readonly flowsFile: string | undefined;
  readonly runTimeoutMs: number;
  readonly stepTimeoutMs: number;
  readonly maxSteps: number;
  readonly maxBodyBytes: number;
  readonly maxConcurrentRuns: number;
  readonly maxOutputsBytes: number;
  readonly chromiumArgs: string[];
}

const DEFAULT_DEV_KEY = 'dev-local-key';

function readInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

function readList(env: NodeJS.ProcessEnv, name: string): string[] {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Parse and validate configuration once, at process start. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const configuredKey = env.API_KEY?.trim();
  if (isProduction && (!configuredKey || configuredKey === DEFAULT_DEV_KEY)) {
    throw new Error('API_KEY must be set to a non-default value when NODE_ENV=production');
  }
  const apiKeyIsDefault = !configuredKey;
  const apiKey = configuredKey ?? DEFAULT_DEV_KEY;

  const rawTargets = env.ALLOWED_TARGETS?.trim() ?? '';
  const allowedTargets = parseAllowedTargets(
    rawTargets === '' ? 'http://localhost,http://127.0.0.1' : rawTargets,
  );

  const rawFlows = env.FLOWS_FILE?.trim();

  return {
    nodeEnv,
    host: env.HOST ?? '127.0.0.1',
    port: readInt(env, 'PORT', 3000, 1, 65535),
    logLevel: env.LOG_LEVEL ?? 'info',
    apiKey,
    apiKeyIsDefault,
    allowedTargets,
    flowsFile: rawFlows === undefined || rawFlows === '' ? undefined : rawFlows,
    runTimeoutMs: readInt(env, 'RUN_TIMEOUT_MS', 60_000, 1000, 600_000),
    stepTimeoutMs: readInt(env, 'STEP_TIMEOUT_MS', 15_000, 100, 120_000),
    maxSteps: readInt(env, 'MAX_STEPS', 100, 1, 200),
    maxBodyBytes: readInt(env, 'MAX_BODY_BYTES', 262_144, 1024, 10_485_760),
    maxConcurrentRuns: readInt(env, 'MAX_CONCURRENT_RUNS', 2, 1, 64),
    maxOutputsBytes: readInt(env, 'MAX_OUTPUTS_BYTES', 65_536, 256, 10_485_760),
    chromiumArgs: readList(env, 'CHROMIUM_ARGS'),
  };
}
