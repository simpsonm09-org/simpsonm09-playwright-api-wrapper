import { describe, expect, it } from "vitest";

import {
  createTargetGuard,
  isBlockedAddress,
  matchRule,
  parseAllowedTargets,
} from "../../src/config/allowlist.js";

describe("parseAllowedTargets", () => {
  it("parses origin and path prefixes", () => {
    const rules = parseAllowedTargets(
      "http://fixture:3000/checkout, https://app.test",
    );
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      scheme: "http:",
      host: "fixture",
      port: "3000",
      pathPrefix: "/checkout",
    });
  });

  it("rejects a non-http scheme", () => {
    expect(() => parseAllowedTargets("ftp://example.test")).toThrow();
  });

  it("rejects a non-URL entry", () => {
    expect(() => parseAllowedTargets("not a url")).toThrow();
  });
});

describe("matchRule", () => {
  const rules = parseAllowedTargets("http://localhost:3000/checkout");

  it("matches the exact prefix and its children", () => {
    expect(matchRule(new URL("http://localhost:3000/checkout"), rules)).toBe(
      true,
    );
    expect(
      matchRule(new URL("http://localhost:3000/checkout/step2"), rules),
    ).toBe(true);
  });

  it("does not match a sibling path or a different port", () => {
    expect(matchRule(new URL("http://localhost:3000/checkoutx"), rules)).toBe(
      false,
    );
    expect(matchRule(new URL("http://localhost:3000/other"), rules)).toBe(
      false,
    );
    expect(matchRule(new URL("http://localhost:4000/checkout"), rules)).toBe(
      false,
    );
  });

  it("does not match a different scheme", () => {
    expect(matchRule(new URL("https://localhost:3000/checkout"), rules)).toBe(
      false,
    );
  });
});

describe("target guard", () => {
  it("allows an allowlisted loopback host", async () => {
    const guard = createTargetGuard(
      parseAllowedTargets("http://127.0.0.1:3000"),
    );
    await expect(
      guard.assertAllowed("http://127.0.0.1:3000/checkout"),
    ).resolves.toBeInstanceOf(URL);
  });

  it("rejects a host outside the allowlist", async () => {
    const guard = createTargetGuard(
      parseAllowedTargets("http://127.0.0.1:3000"),
    );
    await expect(guard.assertAllowed("http://example.com/")).rejects.toThrow(
      /allowlist/i,
    );
  });

  it("rejects a non-http scheme", async () => {
    const guard = createTargetGuard(
      parseAllowedTargets("http://127.0.0.1:3000"),
    );
    await expect(guard.assertAllowed("file:///etc/passwd")).rejects.toThrow(
      /http/i,
    );
  });

  it("blocks a metadata address even when the path prefix is open", async () => {
    const guard = createTargetGuard(
      parseAllowedTargets("http://169.254.169.254"),
    );
    await expect(
      guard.assertAllowed("http://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow(/blocked/i);
  });
});

describe("isBlockedAddress", () => {
  it("blocks IPv4 and IPv6 link-local addresses", () => {
    expect(isBlockedAddress("169.254.10.10")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("febf::abcd")).toBe(true);
  });

  it("blocks IPv4-mapped metadata and link-local forms", () => {
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:100.100.100.200")).toBe(true);
    expect(isBlockedAddress("::ffff:a9fe:a9fe")).toBe(true);
  });

  it("leaves loopback, public, and non-link-local IPv6 addresses reachable", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(false);
    expect(isBlockedAddress("::1")).toBe(false);
    expect(isBlockedAddress("203.0.113.10")).toBe(false);
    expect(isBlockedAddress("2001:db8::1")).toBe(false);
    expect(isBlockedAddress("fe8::1")).toBe(false);
  });
});
