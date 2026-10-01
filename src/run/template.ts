import { ERROR_CODES, RunFailure } from './errors.js';

export interface TemplateScope {
  readonly vars: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
}

// Postman and newman both substitute {{...}} in request bodies, so the run DSL
// uses ${...} to avoid colliding with the clients' own variable syntax.
const TOKEN = /\$\{\s*([A-Za-z0-9_.]+)\s*\}/g;
const SECRET_PREFIX = 'secret.';

export interface TemplateResolver {
  resolveString(text: string): string;
  resolveDeep<T>(value: T): T;
  /** Resolved secret values, for redaction in logs and error messages. */
  usedSecretValues(): string[];
}

export function makeTemplateResolver(scope: TemplateScope): TemplateResolver {
  const used = new Set<string>();

  function resolveString(text: string): string {
    return text.replace(TOKEN, (_match, raw: string) => {
      if (raw.startsWith(SECRET_PREFIX)) {
        const key = raw.slice(SECRET_PREFIX.length);
        const value = scope.secrets[key];
        if (value === undefined) {
          throw new RunFailure(ERROR_CODES.TEMPLATE_FAILED, `Unknown secret: ${key}`);
        }
        used.add(value);
        return value;
      }
      const value = scope.vars[raw];
      if (value === undefined) {
        throw new RunFailure(ERROR_CODES.TEMPLATE_FAILED, `Unknown variable: ${raw}`);
      }
      return value;
    });
  }

  function resolveDeep<T>(value: T): T {
    if (typeof value === 'string') return resolveString(value) as unknown as T;
    if (Array.isArray(value)) return value.map((entry) => resolveDeep(entry)) as unknown as T;
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) out[key] = resolveDeep(entry);
      return out as unknown as T;
    }
    return value;
  }

  return { resolveString, resolveDeep, usedSecretValues: () => [...used] };
}

/** Replace every occurrence of a resolved secret value with a fixed marker. */
export function redactSecrets(text: string, secretValues: readonly string[]): string {
  let out = text;
  for (const secret of secretValues) {
    if (secret.length === 0) continue;
    out = out.split(secret).join('***');
  }
  return out;
}
