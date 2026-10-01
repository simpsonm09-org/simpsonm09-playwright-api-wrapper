import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";

import { isAuthorized } from "./auth.js";
import type { AppDeps } from "./deps.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: {
      level: deps.config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
        censor: "***",
      },
    },
    bodyLimit: deps.config.maxBodyBytes,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (path === "/healthz" || path === "/readyz") return;
    if (!isAuthorized(request.headers.authorization, deps.config.apiKey)) {
      reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid API key",
        },
      });
      return reply;
    }
    return undefined;
  });

  app.setErrorHandler((error, _request, reply) => {
    const failure = error as { statusCode?: number; message?: string };
    const status =
      typeof failure.statusCode === "number" ? failure.statusCode : 500;
    const code =
      status === 400
        ? "VALIDATION_FAILED"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 413
            ? "PAYLOAD_TOO_LARGE"
            : status >= 500
              ? "INTERNAL"
              : "REQUEST_FAILED";
    const message =
      status >= 500
        ? "Internal server error"
        : (failure.message ?? "Request failed");
    reply.code(status).send({ error: { code, message } });
  });

  registerHealthRoutes(app, deps);
  registerRunRoutes(app, deps);

  return app;
}
