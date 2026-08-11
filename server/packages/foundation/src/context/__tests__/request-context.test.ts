import { describe, expect, it } from "vitest";
import {
  getRequestContext,
  runWithJobContext,
  normalizePlaneKey,
  runWithRequestContext,
  tryGetRequestContext,
} from "../index.js";

describe("request context", () => {
  it("normalizes the temporary Athyper input alias but emits only Studio", () => {
    expect(normalizePlaneKey("athyper")).toBe("studio");
    expect(normalizePlaneKey("studio")).toBe("studio");
  });

  it("throws outside an execution scope", () => {
    expect(tryGetRequestContext()).toBeUndefined();
    expect(() => getRequestContext()).toThrow("outside an execution scope");
  });

  it("isolates concurrent asynchronous scopes", async () => {
    const observed: string[] = [];
    await Promise.all([
      runWithRequestContext({ requestId: "request-a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        observed.push(getRequestContext().requestId);
      }),
      runWithRequestContext({ requestId: "request-b" }, async () => {
        observed.push(getRequestContext().requestId);
      }),
    ]);
    expect(observed).toHaveLength(2);
    expect(observed).toContain("request-a");
    expect(observed).toContain("request-b");
    expect(tryGetRequestContext()).toBeUndefined();
  });

  it("generates a request ID for job contexts", async () => {
    const requestId = await runWithJobContext({}, async () =>
      getRequestContext().requestId,
    );
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
