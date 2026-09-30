import { expect, it } from "vitest";
import { createTenantWorkGate } from "../tenant-work-gate.js";

it("admits one tenant at a time, rotates waiting tenants, and releases failed work", async () => {
  const gate = createTenantWorkGate(); const order: string[] = [];
  let release!: () => void;
  const signal = new AbortController().signal;
  const first = gate("a", signal, () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const queued = [gate("a", signal, async () => { order.push("a1"); }), gate("b", signal, async () => { order.push("b"); throw new Error("parse failed"); }).catch(() => undefined), gate("a", signal, async () => { order.push("a2"); })];
  release(); await first; await Promise.all(queued);
  expect(order).toEqual(["a1", "b", "a2"]);
});

it("cancels queued work without invoking its parser", async () => {
  const gate = createTenantWorkGate(); let release!: () => void; let ran = false;
  const first = gate("a", new AbortController().signal, () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const controller = new AbortController();
  const next = gate("b", controller.signal, async () => { ran = true; });
  controller.abort(new Error("closed")); await expect(next).rejects.toThrow("closed");
  release(); await first; expect(ran).toBe(false);
});
