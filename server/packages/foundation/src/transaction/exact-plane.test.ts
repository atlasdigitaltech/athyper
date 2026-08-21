import { describe, expect, it, vi } from "vitest";
import { assertExactPlaneTransaction, brandExactPlaneTransaction, createExactPlaneTransactionCoordinator, exactPlaneOf } from "./exact-plane.js";

describe("exact-plane transactions", () => {
  it("brands coordinator transactions with the requested plane", async () => {
    const transaction = {};
    const coordinator = createExactPlaneTransactionCoordinator({
      run: async (_plane, _actor, work) => work(transaction),
    });
    await coordinator.run("neon", { tenantId: "tenant", principalId: "principal" }, async (exact) => {
      expect(exact).toBe(transaction);
      expect(exactPlaneOf(exact)).toBe("neon");
      assertExactPlaneTransaction(exact, "neon");
      return undefined;
    });
  });

  it("rejects unbranded and wrong-plane transactions before work", () => {
    expect(() => assertExactPlaneTransaction({}, "neon")).toThrowError(expect.objectContaining({ code: "EXACT_PLANE_TRANSACTION_REQUIRED" }));
    const studio = brandExactPlaneTransaction({}, "studio");
    expect(() => assertExactPlaneTransaction(studio, "neon")).toThrowError(expect.objectContaining({ code: "EXACT_PLANE_TRANSACTION_MISMATCH" }));
  });

  it("does not allow an existing transaction to be rebound to another plane", () => {
    const transaction = brandExactPlaneTransaction({}, "mesh");
    const work = vi.fn();
    expect(() => { brandExactPlaneTransaction(transaction, "studio"); work(); }).toThrowError(expect.objectContaining({ code: "EXACT_PLANE_TRANSACTION_MISMATCH" }));
    expect(work).not.toHaveBeenCalled();
  });

  it("propagates an abort signal through the coordinator boundary", async () => {
    const controller = new AbortController();
    const transaction = {};
    const coordinator = createExactPlaneTransactionCoordinator({
      run: async (_plane, _actor, work, signal) => {
        expect(signal).toBe(controller.signal);
        return work(transaction, signal);
      },
    });

    await expect(coordinator.run(
      "mesh",
      { tenantId: "tenant", principalId: "principal" },
      async (_transaction, signal) => signal,
      controller.signal,
    )).resolves.toBe(controller.signal);
  });

  it("rejects an already aborted transaction before opening the boundary", async () => {
    const reason = new Error("cancelled");
    const signal = AbortSignal.abort(reason);
    const run = vi.fn();
    const coordinator = createExactPlaneTransactionCoordinator({ run });

    await expect(coordinator.run(
      "neon",
      { tenantId: "tenant", principalId: "principal" },
      async () => undefined,
      signal,
    )).rejects.toBe(reason);
    expect(run).not.toHaveBeenCalled();
  });
});
