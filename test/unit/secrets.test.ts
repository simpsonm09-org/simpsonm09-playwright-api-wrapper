import { describe, expect, it } from "vitest";

import { loadSecrets } from "../../src/config/secrets.js";

describe("loadSecrets", () => {
  it("exposes only RUN_SECRET_ variables under their short names", () => {
    const secrets = loadSecrets({
      RUN_SECRET_CARD_PASSWORD: "hunter2",
      RUN_SECRET_LOGIN: "qa",
      API_KEY: "should-not-leak",
      PATH: "/usr/bin",
    });
    expect(secrets).toEqual({ CARD_PASSWORD: "hunter2", LOGIN: "qa" });
  });

  it("returns an empty map when no secrets are set", () => {
    expect(loadSecrets({})).toEqual({});
  });
});
