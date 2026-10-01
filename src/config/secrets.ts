const PREFIX = "RUN_SECRET_";

/**
 * Server-side secrets are environment variables prefixed with RUN_SECRET_.
 * A step references them as ${secret.NAME}, and only these values are exposed
 * to templates, never the whole environment.
 */
export function loadSecrets(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(PREFIX) && value !== undefined) {
      secrets[key.slice(PREFIX.length)] = value;
    }
  }
  return secrets;
}
