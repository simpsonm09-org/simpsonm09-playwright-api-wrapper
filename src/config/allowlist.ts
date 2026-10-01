import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { ERROR_CODES, RunFailure } from '../run/errors.js';

/** An allowlist entry: exact scheme, host, and port, plus a path prefix. */
export interface TargetRule {
  readonly scheme: string;
  readonly host: string;
  readonly port: string;
  readonly pathPrefix: string;
}

/** Addresses that serve credentials or instance metadata. Always refused. */
const METADATA_ADDRESSES = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'fd00:ec2::254',
]);

function normalizePort(url: URL): string {
  return url.port;
}

function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return true;
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function parseAllowedTargets(raw: string): TargetRule[] {
  const rules: TargetRule[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error(`Invalid ALLOWED_TARGETS entry: "${trimmed}" is not a URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Invalid ALLOWED_TARGETS entry: "${trimmed}" must be http or https`);
    }
    rules.push({
      scheme: url.protocol,
      host: url.hostname.toLowerCase(),
      port: normalizePort(url),
      pathPrefix: url.pathname === '' ? '/' : url.pathname,
    });
  }
  return rules;
}

export function matchRule(url: URL, rules: readonly TargetRule[]): boolean {
  const host = url.hostname.toLowerCase();
  const port = normalizePort(url);
  return rules.some(
    (rule) =>
      rule.scheme === url.protocol &&
      rule.host === host &&
      rule.port === port &&
      pathMatches(url.pathname, rule.pathPrefix),
  );
}

/** Expand an IPv4-mapped IPv6 address such as ::ffff:169.254.169.254 to dotted form. */
function unmapIpv4(address: string): string {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted !== null) return dotted[1] ?? address;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex === null) return address;
  const high = Number.parseInt(hex[1] ?? '0', 16);
  const low = Number.parseInt(hex[2] ?? '0', 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * Refuse metadata and link-local addresses, including IPv4-mapped and IPv6
 * forms. Loopback stays reachable so the local fixture can be a target.
 */
export function isBlockedAddress(rawAddress: string): boolean {
  const address = unmapIpv4(rawAddress).toLowerCase();
  if (METADATA_ADDRESSES.has(address) || METADATA_ADDRESSES.has(rawAddress)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
  if (ipv4 !== null) {
    // 169.254.0.0/16 link-local.
    return Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254;
  }
  // fe80::/10 link-local. Read the first hextet so a shorter form such as
  // fe8:: is not mistaken for the fe80 range.
  const first = Number.parseInt(address.split(':')[0] ?? '0', 16);
  return first >= 0xfe80 && first <= 0xfebf;
}

/**
 * Resolve the host and refuse metadata and link-local addresses.
 * Private ranges stay reachable only when an allowlist rule names the host.
 */
async function assertAddressSafe(url: URL): Promise<void> {
  const host = url.hostname;
  const addresses: string[] = [];
  if (isIP(host) !== 0) {
    addresses.push(host);
  } else {
    try {
      const records = await lookup(host, { all: true });
      for (const record of records) addresses.push(record.address);
    } catch {
      throw new RunFailure(ERROR_CODES.TARGET_UNRESOLVABLE, `Could not resolve host: ${host}`);
    }
  }
  if (addresses.length === 0) {
    throw new RunFailure(ERROR_CODES.TARGET_UNRESOLVABLE, `Could not resolve host: ${host}`);
  }
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new RunFailure(
        ERROR_CODES.TARGET_NOT_ALLOWED,
        `Target resolves to a blocked address: ${address}`,
      );
    }
  }
}

export interface TargetGuard {
  /** Full check for a navigation target: scheme, allowlist, and address. */
  assertAllowed(rawUrl: string): Promise<URL>;
  /** Synchronous allowlist check for per-request interception. */
  isRequestAllowed(rawUrl: string): boolean;
}

export function parseTargetUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RunFailure(ERROR_CODES.TARGET_NOT_ALLOWED, `Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RunFailure(
      ERROR_CODES.TARGET_NOT_ALLOWED,
      `Only http and https are allowed, got ${url.protocol}`,
    );
  }
  return url;
}

export function createTargetGuard(rules: readonly TargetRule[]): TargetGuard {
  return {
    async assertAllowed(rawUrl: string): Promise<URL> {
      const url = parseTargetUrl(rawUrl);
      if (!matchRule(url, rules)) {
        throw new RunFailure(
          ERROR_CODES.TARGET_NOT_ALLOWED,
          `Target is not on the allowlist: ${url.origin}${url.pathname}`,
        );
      }
      await assertAddressSafe(url);
      return url;
    },
    isRequestAllowed(rawUrl: string): boolean {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return false;
      }
      if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') {
        return true;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return matchRule(url, rules);
    },
  };
}
