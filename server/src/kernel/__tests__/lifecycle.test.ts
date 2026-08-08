// server/src/kernel/__tests__/lifecycle.test.ts
//
// Unit tests for the Lifecycle class.
// No mocks, no infrastructure — pure logic.
//
// Exit criteria for Phase 1:
//   ✓ handlers run in LIFO order
//   ✓ second shutdown call is a no-op (idempotent)
//   ✓ a throwing handler does not prevent remaining handlers from running
//   ✓ async handlers are awaited in order

import { describe, it, expect, vi } from "vitest";
import { Lifecycle } from "@athyper/server-foundation/kernel";

describe("Lifecycle", () => {
  it("runs shutdown handlers in LIFO order", async () => {
    const lifecycle = new Lifecycle();
    const order: number[] = [];

    lifecycle.onShutdown(() => { order.push(1); });
    lifecycle.onShutdown(() => { order.push(2); });
    lifecycle.onShutdown(() => { order.push(3); });

    await lifecycle.shutdown("test");

    expect(order).toEqual([3, 2, 1]);
  });

  it("second shutdown call is a no-op (idempotent)", async () => {
    const lifecycle = new Lifecycle();
    const handler = vi.fn();
    lifecycle.onShutdown(handler);

    await lifecycle.shutdown("test");
    await lifecycle.shutdown("test");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("continues shutdown even if a handler throws", async () => {
    const lifecycle = new Lifecycle();
    const order: number[] = [];

    lifecycle.onShutdown(() => { order.push(1); });
    lifecycle.onShutdown((): void => { throw new Error("handler 2 failed"); });
    lifecycle.onShutdown(() => { order.push(3); });

    // Must not reject — errors are swallowed per lifecycle contract
    await expect(lifecycle.shutdown("test")).resolves.toBeUndefined();

    // handler 3 ran first (LIFO), handler 2 threw but was swallowed, handler 1 ran
    expect(order).toEqual([3, 1]);
  });

  it("awaits async handlers in LIFO order", async () => {
    const lifecycle = new Lifecycle();
    const log: string[] = [];

    lifecycle.onShutdown(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
      log.push("slow-1");
    });
    lifecycle.onShutdown(async () => {
      log.push("fast-2");
    });

    await lifecycle.shutdown("test");

    // fast-2 registered last → runs first; slow-1 registered first → runs second
    expect(log).toEqual(["fast-2", "slow-1"]);
  });

  it("works correctly with zero registered handlers", async () => {
    const lifecycle = new Lifecycle();
    await expect(lifecycle.shutdown("test")).resolves.toBeUndefined();
  });
});
