import { describe, expect, it } from "vitest";

import { authHeaders, buildTestApp } from "../helpers.js";

const cases = [
  { status: 400, code: "VALIDATION_FAILED", message: "boom" },
  { status: 401, code: "UNAUTHORIZED", message: "boom" },
  { status: 403, code: "REQUEST_FAILED", message: "boom" },
  { status: 413, code: "PAYLOAD_TOO_LARGE", message: "boom" },
  { status: 500, code: "INTERNAL", message: "Internal server error" },
] as const;

describe("error handler", () => {
  for (const { status, code, message } of cases) {
    it(`maps status ${status} to ${code}`, async () => {
      const { app } = buildTestApp();
      app.get(`/__error/${status}`, async () => {
        const error = new Error("boom");
        (error as { statusCode?: number }).statusCode = status;
        throw error;
      });

      const response = await app.inject({
        method: "GET",
        url: `/__error/${status}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: { code, message } });
      await app.close();
    });
  }
});
