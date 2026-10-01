import type { FastifyInstance } from "fastify";

import type { AppDeps } from "../deps.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): void {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    const ready = await deps.pool.ready();
    if (!ready) {
      reply.code(503);
      return { status: "unavailable" };
    }
    return { status: "ready" };
  });
}
