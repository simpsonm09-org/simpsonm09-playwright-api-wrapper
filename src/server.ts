import { buildApp } from './app.js';
import { createTargetGuard } from './config/allowlist.js';
import { loadConfig } from './config/env.js';
import { loadFlows } from './config/flows.js';
import { loadSecrets } from './config/secrets.js';
import { BrowserPool } from './run/browser.js';
import { ConcurrencyGate } from './run/concurrency.js';

// Load a local .env when present. Values already in the environment win, and a
// container without the file falls back to its own environment.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file to load.
}

const config = loadConfig();
const pool = new BrowserPool(config);
const deps = {
  config,
  pool,
  guard: createTargetGuard(config.allowedTargets),
  gate: new ConcurrencyGate(config.maxConcurrentRuns),
  secrets: loadSecrets(),
  flows: loadFlows(config.flowsFile),
};

const app = buildApp(deps);

if (config.apiKeyIsDefault) {
  app.log.warn(
    'API_KEY is not set. Using the development default. Do not expose this service.',
  );
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
