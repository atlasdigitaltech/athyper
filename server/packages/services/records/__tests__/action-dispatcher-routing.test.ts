import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLifecycleCommand } from "../routes/lifecycle-command.registry.js";

const dispatcher = readFileSync(
  resolve(process.cwd(), "packages/services/records/routes/action-dispatcher.route.ts"),
  "utf8",
);

describe("action dispatcher entity-scoped lifecycle routing", () => {
  it.each([
    "purchase_requisition",
    "receipt",
    "service_sheet",
  ])("does not route %s submit as a purchase-invoice command", (entityCode) => {
    const command = resolveLifecycleCommand(entityCode, "submit", "submit_for_approval");
    expect(command.entityCode).toBe(entityCode);
    expect(command.entityCode).not.toBe("purchase_invoice");
  });

  it("resolves lifecycle metadata by entity, operation, and flow before dispatch", () => {
    expect(dispatcher).toContain("resolveLifecycleCommand(entityCode, commandOperationCode, flowCode)");
    expect(dispatcher).toContain('target.startsWith("lifecycle:")');
    expect(dispatcher).toContain('interactionTarget.startsWith("flow:")');
    expect(dispatcher).toContain("executeLifecycleTransition({");
    expect(dispatcher).toContain("command: lifecycleCommand");
    expect(dispatcher).not.toContain("handleSubmitForApproval(");
    expect(dispatcher).not.toContain("handlePostInvoice(");
    expect(dispatcher).not.toContain("handleReverseInvoice(");
    expect(dispatcher).not.toContain('if (flowCode === "submit_for_approval")');
    expect(dispatcher).not.toContain('if (flowCode === "post_invoice")');
    expect(dispatcher).not.toContain('if (flowCode === "reverse_invoice")');
    expect(dispatcher).not.toContain("isPurchaseInvoiceRuntimePilot");
    expect(dispatcher).not.toContain("createWorkflowLifecycleRuntime");
    expect(dispatcher).not.toContain("notificationQueue");
  });

  it("gates commands by entity metadata and emits rollout telemetry", () => {
    expect(dispatcher).toContain("resolveLifecycleOrchestratorRollout(");
    expect(dispatcher).toContain("lifecycle_command_orchestrator_resolution");
    expect(dispatcher).toContain("lifecycle_command_legacy_route_usage");
    expect(dispatcher).toContain("registryKey:");
    expect(dispatcher).toContain("transitionId: transitioned.transitionId");
    expect(dispatcher).toContain("executionToken: transitioned.executionToken");
    expect(dispatcher).toContain("idempotencyReplay: transitioned.idempotencyReplay");
  });
});
