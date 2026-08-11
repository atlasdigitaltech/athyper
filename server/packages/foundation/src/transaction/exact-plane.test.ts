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
});
