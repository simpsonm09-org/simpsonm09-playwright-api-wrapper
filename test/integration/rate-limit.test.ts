import { describe, expect, it } from "vitest";

import { authHeaders, buildTestApp, testConfig } from "../helpers.js";

describe("rate limit", () => {
  it("returns 429 with RATE_LIMITED once the limit is exceeded", async () => {
    const config = testConfig({ RATE_LIMIT_MAX: "2" });
    const { app } = buildTestApp({ config });

    const send = () =>
      app.inject({
        method: "POST",
        url: "/v1/runs",
        headers: authHeaders(),
        payload: { steps: [] },
      });

    expect((await send()).statusCode).toBe(400);
    expect((await send()).statusCode).toBe(400);

    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });

    await app.close();
  });
});
