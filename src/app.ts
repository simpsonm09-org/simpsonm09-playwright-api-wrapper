import rateLimit from "@fastify/rate-limit";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";

import { isAuthorized } from "./auth.js";
import type { AppDeps } from "./deps.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";

function errorCode(status: number): string {
  if (status === 400) return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL";
  return "REQUEST_FAILED";
}

function errorMessage(status: number, failure: { message?: string }): string {
  if (status >= 500) return "Internal server error";
  return failure.message ?? "Request failed";
}

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

  // Registered before the routes so one limiter guards every handler. Its 429
  // is an Error with statusCode 429, so setErrorHandler shapes the body.
  app.register(rateLimit, {
    max: deps.config.rateLimitMax,
    timeWindow: deps.config.rateLimitWindowMs,
  });

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
    reply.code(status).send({
      error: {
        code: errorCode(status),
        message: errorMessage(status, failure),
      },
    });
  });

  // Routes load in a child context registered after the limiter, so the
  // plugin's onRoute hook attaches the limiter to each handler.
  app.register((instance) => {
    registerHealthRoutes(instance, deps);
    registerRunRoutes(instance, deps);
  });

  return app;
}
