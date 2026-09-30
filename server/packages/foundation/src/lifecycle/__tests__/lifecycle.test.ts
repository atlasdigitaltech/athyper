import { describe, expect, it, vi } from "vitest";
import { LifecycleManager } from "../index.js";

describe("LifecycleManager", () => {
  it("runs shutdown handlers once in LIFO order and continues after errors", async () => {
    const lifecycle = new LifecycleManager();
    const order: number[] = [];
    lifecycle.onShutdown(() => order.push(1));
    lifecycle.onShutdown(() => { throw new Error("expected"); });
    lifecycle.onShutdown(async () => { order.push(3); });

    await lifecycle.shutdown("test");
    await lifecycle.shutdown("duplicate");

    expect(order).toEqual([3, 1]);
  });

  it("signals ready handlers once in FIFO order", async () => {
    const lifecycle = new LifecycleManager();
    const first = vi.fn();
    const second = vi.fn();
    lifecycle.onReady(first);
    lifecycle.onReady(second);

    await lifecycle.signalReady();
    await lifecycle.signalReady();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(first.mock.invocationCallOrder[0]).toBeLessThan(
      second.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });
  it("fails critical startup after running all initialization hooks", async () => {
    const lifecycle = new LifecycleManager();
    const failure = new Error("dependency unavailable");
    const remaining = vi.fn();
    lifecycle.onReady(async () => { throw failure; });
    lifecycle.onReady(remaining);
    await expect(lifecycle.signalReady({ failOnError: true })).rejects.toMatchObject({
      message: "Startup initialization failed", errors: [failure],
    });
    expect(remaining).toHaveBeenCalledOnce();
  });

  it("preserves best-effort readiness observers by default", async () => {
    const lifecycle = new LifecycleManager();
    lifecycle.onReady(() => { throw new Error("observer failed"); });
    await expect(lifecycle.signalReady()).resolves.toBeUndefined();
  });

});
