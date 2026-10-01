import { readFileSync } from 'node:fs';

import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import { RunOptionsSchema, StepSchema, type RunOptions, type Step } from '../schema/request.js';

const FlowSchema = Type.Object({
  steps: Type.Array(StepSchema, { minItems: 1, maxItems: 200 }),
  options: Type.Optional(RunOptionsSchema),
});

const FlowsFileSchema = Type.Record(Type.String({ minLength: 1 }), FlowSchema);

/** One named scenario. The target url and vars still come from the request. */
export interface Flow {
  readonly steps: Step[];
  readonly options?: RunOptions;
}

/** Named flows, resolved once at startup. Empty when no file is configured. */
export type FlowRegistry = ReadonlyMap<string, Flow>;

/**
 * Parse the FLOWS_FILE JSON. Each key is a flow name and each value is a step
 * list. The file lives on the server, so it is trusted after this parse. A bad
 * file is a startup error, not a per-request one.
 */
export function loadFlows(filePath: string | undefined): FlowRegistry {
  if (filePath === undefined || filePath.trim() === '') return new Map();

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`FLOWS_FILE could not be read: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`FLOWS_FILE is not valid JSON: ${filePath}`);
  }

  if (!Value.Check(FlowsFileSchema, parsed)) {
    const first = Value.Errors(FlowsFileSchema, parsed).First();
    const detail = first === undefined ? '' : ` at ${first.path} (${first.message})`;
    throw new Error(`FLOWS_FILE is not a valid flows file: ${filePath}${detail}`);
  }

  const flows = new Map<string, Flow>();
  for (const [name, flow] of Object.entries(parsed as Record<string, Static<typeof FlowSchema>>)) {
    flows.set(
      name,
      flow.options === undefined ? { steps: flow.steps } : { steps: flow.steps, options: flow.options },
    );
  }
  return flows;
}
