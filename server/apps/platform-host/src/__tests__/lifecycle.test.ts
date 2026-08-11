import { describe, it, expect } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";

describe("lifecycle", () => {
  it("runs shutdown hooks in LIFO order", async () => {
    const lifecycle = createLifecycle();
    const log: string[] = [];
    lifecycle.onShutdown(() => { log.push("first"); });
    lifecycle.onShutdown(async () => { log.push("second"); });
    await lifecycle.shutdown("SIGTERM");
    expect(log).toEqual(["second", "first"]);
  });

  it("swallows hook errors and continues", async () => {
    const lifecycle = createLifecycle();
    const log: string[] = [];
    lifecycle.onShutdown(() => { throw new Error("boom"); });
    lifecycle.onShutdown(() => { log.push("ran"); });
    await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
    expect(log).toContain("ran");
  });
});
