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

export async function executeStep(
  page: Page,
  step: Step,
  index: number,
  deps: StepDeps,
  outputs: Record<string, string>,
): Promise<void> {
  switch (step.action) {
    case "navigate": {
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
      return;
    }
    case "fill": {
      await resolveLocator(page, step.target).fill(step.value);
      return;
    }
    case "click": {
      const locator = resolveLocator(page, step.target);
      if (step.button === undefined) {
        await locator.click();
      } else {
        await locator.click({ button: step.button });
      }
      return;
    }
    case "press": {
      await resolveLocator(page, step.target).press(step.key);
      return;
    }
    case "selectOption": {
      await resolveLocator(page, step.target).selectOption(step.value);
      return;
    }
    case "check": {
      await resolveLocator(page, step.target).check();
      return;
    }
    case "waitFor": {
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
      return;
    }
    case "assertVisible": {
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
      return;
    }
    case "assertText": {
      if (step.equals === undefined && step.contains === undefined) {
        throw failStep(
          index,
          step.action,
          "one of equals or contains is required",
        );
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
      return;
    }
    case "assertUrl": {
      const current = page.url();
      if (step.contains !== undefined && !current.includes(step.contains)) {
        throw new RunFailure(
          ERROR_CODES.ASSERTION_FAILED,
          `Step ${index} (assertUrl) failed: expected url to contain ${JSON.stringify(step.contains)}, got ${JSON.stringify(current)}`,
          index,
        );
      }
      if (step.matches !== undefined) {
        let pattern: RegExp;
        try {
          pattern = new RegExp(step.matches);
        } catch {
          throw failStep(
            index,
            step.action,
            `matches is not a valid regular expression`,
          );
        }
        if (!pattern.test(current)) {
          throw new RunFailure(
            ERROR_CODES.ASSERTION_FAILED,
            `Step ${index} (assertUrl) failed: expected url to match ${JSON.stringify(step.matches)}, got ${JSON.stringify(current)}`,
            index,
          );
        }
      }
      return;
    }
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
