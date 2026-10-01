import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppDeps } from '../deps.js';
import { ERROR_CODES, isRunFailure, RunFailure } from '../run/errors.js';
import { executeRun, prepareRun, type PreparedRun } from '../run/runner.js';
import { RunRequestSchema } from '../schema/request.js';
import type { RunRequest } from '../schema/request.js';
import { ErrorResponseSchema, RunResultSchema, type StepResult } from '../schema/response.js';

function acceptsEventStream(request: FastifyRequest): boolean {
  const accept = request.headers.accept;
  return typeof accept === 'string' && accept.includes('text/event-stream');
}

function readFailOnRunFailure(request: FastifyRequest): boolean {
  const query = request.query;
  if (query === null || typeof query !== 'object') return false;
  return (query as Record<string, unknown>)['failOnRunFailure'] === 'true';
}

function asFailure(error: unknown): RunFailure {
  if (isRunFailure(error)) return error;
  return new RunFailure(
    ERROR_CODES.INTERNAL,
    error instanceof Error ? error.message : String(error),
  );
}

async function streamRun(
  reply: FastifyReply,
  prepared: PreparedRun,
  deps: AppDeps,
): Promise<void> {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const write = (event: string, data: unknown): void => {
    raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => raw.write(': ping\n\n'), 15_000);
  const controller = new AbortController();
  raw.on('close', () => controller.abort());

  try {
    const result = await executeRun(prepared, deps, {
      sink: { onStep: (step: StepResult) => write('step', step) },
      signal: controller.signal,
    });
    write('result', result);
  } catch (error) {
    const failure = asFailure(error);
    write('result', {
      status: 'failed',
      error: { code: failure.code, message: failure.message },
    });
  } finally {
    clearInterval(heartbeat);
    raw.end();
  }
}

export function registerRunRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post(
    '/v1/runs',
    {
      schema: {
        body: RunRequestSchema,
        response: {
          200: RunResultSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: RunResultSchema,
          413: ErrorResponseSchema,
          429: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const wantsSse = acceptsEventStream(request);
      const failOnRunFailure = readFailOnRunFailure(request);

      let prepared: PreparedRun;
      try {
        // Fastify validated the body against RunRequestSchema at the boundary.
        prepared = prepareRun(request.body as RunRequest, deps.secrets, deps.flows);
      } catch (error) {
        const failure = asFailure(error);
        reply.code(400);
        return { error: { code: failure.code, message: failure.message } };
      }

      try {
        await deps.guard.assertAllowed(prepared.target);
      } catch (error) {
        const failure = asFailure(error);
        reply.code(failure.code === ERROR_CODES.TARGET_UNRESOLVABLE ? 502 : 403);
        return { error: { code: failure.code, message: failure.message } };
      }

      const release = deps.gate.tryAcquire();
      if (release === undefined) {
        reply.code(429);
        return {
          error: {
            code: ERROR_CODES.CONCURRENCY_LIMIT,
            message: `Concurrency limit of ${deps.config.maxConcurrentRuns} reached`,
          },
        };
      }

      try {
        if (wantsSse) {
          await streamRun(reply, prepared, deps);
          return undefined;
        }
        const result = await executeRun(prepared, deps, {});
        reply.code(failOnRunFailure && result.status !== 'passed' ? 409 : 200);
        return result;
      } finally {
        release();
      }
    },
  );
}
