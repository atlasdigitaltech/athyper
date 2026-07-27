import { describe, expect, it } from "vitest";
import { isLifecycleOrchestratorOperationEnabled } from "../lifecycle/lifecycle-orchestrator-rollout.js";

describe("entity-scoped lifecycle orchestrator rollout", () => {
  it("supports a whole-entity enable and disable", () => {
    expect(isLifecycleOrchestratorOperationEnabled(true, "submit")).toBe(true);
    expect(isLifecycleOrchestratorOperationEnabled(false, "submit")).toBe(false);
  });

  it("scopes purchase-invoice financial operations independently", () => {
    const flag = { enabled: true, operations: ["submit", "post"] };
    expect(isLifecycleOrchestratorOperationEnabled(flag, "submit")).toBe(true);
    expect(isLifecycleOrchestratorOperationEnabled(flag, "post")).toBe(true);
    expect(isLifecycleOrchestratorOperationEnabled(flag, "reverse")).toBe(false);
  });

  it("fails closed for malformed metadata", () => {
    expect(isLifecycleOrchestratorOperationEnabled({}, "submit")).toBe(false);
    expect(isLifecycleOrchestratorOperationEnabled("true", "submit")).toBe(false);
    expect(isLifecycleOrchestratorOperationEnabled({ operations: "submit" }, "submit")).toBe(false);
  });

  it("normalizes operation codes without allowing an unrelated operation", () => {
    expect(isLifecycleOrchestratorOperationEnabled(["save-and-transition"], "SAVE_AND_TRANSITION")).toBe(true);
    expect(isLifecycleOrchestratorOperationEnabled(["submit"], "post")).toBe(false);
  });
});
