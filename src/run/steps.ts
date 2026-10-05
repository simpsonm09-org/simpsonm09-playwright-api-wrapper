import type { Page } from "playwright";

import type { TargetGuard } from "../config/allowlist.js";
import type { Step } from "../schema/request.js";
import { ERROR_CODES, RunFailure } from "./errors.js";
import { describeLocator, resolveLocator } from "./locators.js";

export interface StepDeps {
  readonly guard: TargetGuard;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function failStep(index: number, action: string, message: string): RunFailure {
  return new RunFailure(
    ERROR_CODES.STEP_FAILED,
    `Step ${index} (${action}) failed: ${message}`,
    index,
  );
}

type StepOf<A extends Step["action"]> = Extract<Step, { action: A }>;

async function executeNavigate(
  page: Page,
  step: StepOf<"navigate">,
  index: number,
  deps: StepDeps,
): Promise<void> {
  await deps.guard.assertAllowed(step.url);
  try {
    await page.goto(step.url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw failStep(
        index,
        step.action,
        `navigation timed out for ${step.url}`,
      );
    }
    throw failStep(index, step.action, `navigation failed for ${step.url}`);
  }
}

async function executeClick(page: Page, step: StepOf<"click">): Promise<void> {
  const locator = resolveLocator(page, step.target);
  if (step.button === undefined) {
    await locator.click();
  } else {
    await locator.click({ button: step.button });
  }
}

async function executeWaitFor(
  page: Page,
  step: StepOf<"waitFor">,
  index: number,
): Promise<void> {
  const locator = resolveLocator(page, step.target);
  const state = step.state ?? "visible";
  try {
    await locator.waitFor({ state });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw failStep(
        index,
        step.action,
        `element not ${state}: ${describeLocator(step.target)}`,
      );
    }
    throw error;
  }
}

async function executeAssertVisible(
  page: Page,
  step: StepOf<"assertVisible">,
  index: number,
): Promise<void> {
  const locator = resolveLocator(page, step.target);
  try {
    await locator.waitFor({ state: "visible" });
  } catch {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertVisible) failed: not visible: ${describeLocator(step.target)}`,
      index,
    );
  }
}

async function executeAssertText(
  page: Page,
  step: StepOf<"assertText">,
  index: number,
): Promise<void> {
  if (step.equals === undefined && step.contains === undefined) {
    throw failStep(index, step.action, "one of equals or contains is required");
  }
  const locator = resolveLocator(page, step.target);
  let text: string;
  try {
    text = await locator.innerText();
  } catch {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertText) failed: element not found: ${describeLocator(step.target)}`,
      index,
    );
  }
  if (step.equals !== undefined && text.trim() !== step.equals) {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertText) failed: expected exactly ${JSON.stringify(step.equals)}, got ${JSON.stringify(text)}`,
      index,
    );
  }
  if (step.contains !== undefined && !text.includes(step.contains)) {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertText) failed: expected to contain ${JSON.stringify(step.contains)}, got ${JSON.stringify(text)}`,
      index,
    );
  }
}

async function executeAssertUrl(
  page: Page,
  step: StepOf<"assertUrl">,
  index: number,
): Promise<void> {
  const current = page.url();
  if (step.contains !== undefined && !current.includes(step.contains)) {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertUrl) failed: expected url to contain ${JSON.stringify(step.contains)}, got ${JSON.stringify(current)}`,
      index,
    );
  }
  if (step.matches !== undefined && !current.includes(step.matches)) {
    throw new RunFailure(
      ERROR_CODES.ASSERTION_FAILED,
      `Step ${index} (assertUrl) failed: expected url to match ${JSON.stringify(step.matches)}, got ${JSON.stringify(current)}`,
      index,
    );
  }
}

export async function executeStep(
  page: Page,
  step: Step,
  index: number,
  deps: StepDeps,
  outputs: Record<string, string>,
): Promise<void> {
  switch (step.action) {
    case "navigate":
      await executeNavigate(page, step, index, deps);
      return;
    case "fill":
      await resolveLocator(page, step.target).fill(step.value);
      return;
    case "click":
      await executeClick(page, step);
      return;
    case "press":
      await resolveLocator(page, step.target).press(step.key);
      return;
    case "selectOption":
      await resolveLocator(page, step.target).selectOption(step.value);
      return;
    case "check":
      await resolveLocator(page, step.target).check();
      return;
    case "waitFor":
      await executeWaitFor(page, step, index);
      return;
    case "assertVisible":
      await executeAssertVisible(page, step, index);
      return;
    case "assertText":
      await executeAssertText(page, step, index);
      return;
    case "assertUrl":
      await executeAssertUrl(page, step, index);
      return;
    case "readText": {
      const text = await resolveLocator(page, step.target).innerText();
      outputs[step.as] = text.trim();
      return;
    }
    case "readInputValue": {
      outputs[step.as] = await resolveLocator(page, step.target).inputValue();
      return;
    }
  }
}
