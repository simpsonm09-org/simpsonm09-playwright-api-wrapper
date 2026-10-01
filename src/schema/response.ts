import { type Static, Type } from "@sinclair/typebox";

export const RunStatusSchema = Type.Union([
  Type.Literal("passed"),
  Type.Literal("failed"),
  Type.Literal("timedOut"),
  Type.Literal("rejected"),
]);
export type RunStatus = Static<typeof RunStatusSchema>;

function runErrorSchema() {
  return Type.Object({
    code: Type.String(),
    message: Type.String(),
    stepIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  });
}

export const RunErrorSchema = runErrorSchema();
export type RunError = Static<typeof RunErrorSchema>;

function stepResultSchema() {
  return Type.Object({
    index: Type.Integer({ minimum: 0 }),
    action: Type.String(),
    status: Type.Union([
      Type.Literal("passed"),
      Type.Literal("failed"),
      Type.Literal("skipped"),
    ]),
    durationMs: Type.Integer({ minimum: 0 }),
  });
}

export const StepResultSchema = stepResultSchema();
export type StepResult = Static<typeof StepResultSchema>;

export const RunResultSchema = Type.Object({
  runId: Type.String(),
  status: RunStatusSchema,
  target: Type.String(),
  finalUrl: Type.Optional(Type.String()),
  startedAt: Type.String(),
  finishedAt: Type.String(),
  durationMs: Type.Integer({ minimum: 0 }),
  outputs: Type.Record(Type.String(), Type.String()),
  steps: Type.Array(stepResultSchema()),
  error: Type.Union([runErrorSchema(), Type.Null()]),
});
export type RunResult = Static<typeof RunResultSchema>;

export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
