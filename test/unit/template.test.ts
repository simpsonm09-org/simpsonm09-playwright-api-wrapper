import { describe, expect, it } from "vitest";

import { makeTemplateResolver, redactSecrets } from "../../src/run/template.js";

describe("makeTemplateResolver", () => {
  const resolver = makeTemplateResolver({
    vars: { email: "qa@example.test", card: "4242424242424242" },
    secrets: { CARD_PASSWORD: "hunter2" },
  });

  it("resolves request variables", () => {
    expect(resolver.resolveString("${email}")).toBe("qa@example.test");
    expect(resolver.resolveString("card=${card}!")).toBe(
      "card=4242424242424242!",
    );
  });

  it("resolves secrets and tracks them for redaction", () => {
    expect(resolver.resolveString("${secret.CARD_PASSWORD}")).toBe("hunter2");
    expect(resolver.usedSecretValues()).toContain("hunter2");
  });

  it("resolves nested structures", () => {
    const resolved = resolver.resolveDeep({
      steps: [{ action: "fill", value: "${email}" }],
    });
    expect(resolved.steps[0]?.value).toBe("qa@example.test");
  });

  it("fails on an unknown variable", () => {
    expect(() => resolver.resolveString("${missing}")).toThrow(
      /Unknown variable/,
    );
  });

  it("fails on an unknown secret", () => {
    expect(() => resolver.resolveString("${secret.MISSING}")).toThrow(
      /Unknown secret/,
    );
  });
});

describe("redactSecrets", () => {
  it("replaces every occurrence of a secret value", () => {
    const text = "failed using hunter2 and again hunter2";
    expect(redactSecrets(text, ["hunter2"])).toBe(
      "failed using *** and again ***",
    );
  });

  it("leaves text unchanged when there are no secrets", () => {
    expect(redactSecrets("plain", [])).toBe("plain");
  });
});
