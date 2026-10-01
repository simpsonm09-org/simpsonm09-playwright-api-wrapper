import { type Static, Type } from "@sinclair/typebox";

/**
 * Locators are a discriminated union. Accessible locators (role, label, testId)
 * are preferred; text and css remain for arbitrary sites without test ids.
 */
function locatorSchema() {
  return Type.Union([
    Type.Object({
      by: Type.Literal("role"),
      role: Type.String({ minLength: 1 }),
      name: Type.Optional(Type.String()),
    }),
    Type.Object({
      by: Type.Literal("label"),
      text: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      by: Type.Literal("testId"),
      value: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      by: Type.Literal("text"),
      text: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      by: Type.Literal("css"),
      selector: Type.String({ minLength: 1 }),
    }),
  ]);
}

export const LocatorSchema = locatorSchema();
export type LocatorSpec = Static<typeof LocatorSchema>;

const mouseButton = Type.Union([
  Type.Literal("left"),
  Type.Literal("right"),
  Type.Literal("middle"),
]);

const waitState = Type.Union([
  Type.Literal("attached"),
  Type.Literal("detached"),
  Type.Literal("visible"),
  Type.Literal("hidden"),
]);

function stepSchema() {
  return Type.Union([
    Type.Object({
      action: Type.Literal("navigate"),
      url: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      action: Type.Literal("fill"),
      target: locatorSchema(),
      value: Type.String(),
    }),
    Type.Object({
      action: Type.Literal("click"),
      target: locatorSchema(),
      button: Type.Optional(mouseButton),
    }),
    Type.Object({
      action: Type.Literal("press"),
      target: locatorSchema(),
      key: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      action: Type.Literal("selectOption"),
      target: locatorSchema(),
      value: Type.String(),
    }),
    Type.Object({ action: Type.Literal("check"), target: locatorSchema() }),
    Type.Object({
      action: Type.Literal("waitFor"),
      target: locatorSchema(),
      state: Type.Optional(waitState),
    }),
    Type.Object({
      action: Type.Literal("assertVisible"),
      target: locatorSchema(),
    }),
    Type.Object({
      action: Type.Literal("assertText"),
      target: locatorSchema(),
      equals: Type.Optional(Type.String()),
      contains: Type.Optional(Type.String()),
    }),
    Type.Object({
      action: Type.Literal("assertUrl"),
      contains: Type.Optional(Type.String()),
      matches: Type.Optional(Type.String()),
    }),
    Type.Object({
      action: Type.Literal("readText"),
      target: locatorSchema(),
      as: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      action: Type.Literal("readInputValue"),
      target: locatorSchema(),
      as: Type.String({ minLength: 1 }),
    }),
  ]);
}

export const StepSchema = stepSchema();
export type Step = Static<typeof StepSchema>;

export const RunOptionsSchema = Type.Object({
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
  stepTimeoutMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 120000 })),
  failFast: Type.Optional(Type.Boolean()),
  browser: Type.Optional(Type.Literal("chromium")),
});
export type RunOptions = Static<typeof RunOptionsSchema>;

/**
 * A run supplies its steps one of two ways. `steps` carries the whole scenario
 * inline. `flow` names a scenario loaded from the server-side FLOWS_FILE. Both
 * accept a target `url`, `vars`, and `options`, so a named flow stays
 * environment-agnostic and the same flow runs against local and CI targets.
 */
const runRequestBase = {
  url: Type.Optional(Type.String({ minLength: 1 })),
  vars: Type.Optional(Type.Record(Type.String(), Type.String())),
  options: Type.Optional(RunOptionsSchema),
};

export const RunRequestSchema = Type.Union([
  Type.Object({
    ...runRequestBase,
    steps: Type.Array(StepSchema, { minItems: 1, maxItems: 200 }),
  }),
  Type.Object({
    ...runRequestBase,
    flow: Type.String({ minLength: 1 }),
  }),
]);
export type RunRequest = Static<typeof RunRequestSchema>;
