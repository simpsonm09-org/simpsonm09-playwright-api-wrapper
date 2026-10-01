import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadFlows } from "../../src/config/flows.js";

function tempFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "flows-"));
  const path = join(dir, "flows.json");
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("loadFlows", () => {
  it("returns an empty registry when no file is configured", () => {
    expect(loadFlows(undefined).size).toBe(0);
    expect(loadFlows("  ").size).toBe(0);
  });

  it("loads the shipped flows file", () => {
    const flows = loadFlows("flows/flows.json");
    const checkout = flows.get("checkout");
    expect(checkout?.steps).toHaveLength(5);
    expect(checkout?.steps[0]?.action).toBe("fill");
  });

  it("keeps flow options when given", () => {
    const path = tempFile(
      JSON.stringify({
        quick: {
          steps: [
            { action: "navigate", url: "http://localhost:4010/checkout" },
          ],
          options: { timeoutMs: 5000 },
        },
      }),
    );
    expect(loadFlows(path).get("quick")?.options?.timeoutMs).toBe(5000);
  });

  it("rejects a file that cannot be read", () => {
    expect(() => loadFlows("does/not/exist.json")).toThrow(/could not be read/);
  });

  it("rejects invalid JSON", () => {
    expect(() => loadFlows(tempFile("{ not json"))).toThrow(/not valid JSON/);
  });

  it("rejects a step that does not match the step schema", () => {
    const path = tempFile(
      JSON.stringify({ bad: { steps: [{ action: "nope" }] } }),
    );
    expect(() => loadFlows(path)).toThrow(/not a valid flows file/);
  });
});
