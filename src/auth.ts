import { timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of the bearer token. */
export function isAuthorized(header: string | undefined, apiKey: string): boolean {
  if (header === undefined) return false;
  const provided = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${apiKey}`);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
