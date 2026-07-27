import { describe, expect, it } from "vitest";
import {
  LifecycleCommandRegistry,
  LifecycleCommandResolutionError,
  lifecycleCommandKey,
  listLifecycleCommands,
  resolveLifecycleCommand,
  type LifecycleCommandRegistration,
} from "../routes/lifecycle-command.registry.js";

const EXPECTED_COMMANDS = [
  ["purchase_requisition", "submit", "submit_for_approval"],
  ["receipt", "submit", "submit_for_approval"],
  ["service_sheet", "submit", "submit_for_approval"],
  ["purchase_invoice", "submit", "submit_for_approval"],
  ["purchase_invoice", "post", "post_invoice"],
  ["purchase_invoice", "reverse", "reverse_invoice"],
] as const;

function registration(
  entityCode = "test_entity",
  operationCode = "submit",
  allowedFlowCodes: readonly string[] = ["submit_for_approval"],
): LifecycleCommandRegistration {
  return {
    entityCode,
    operationCode,
    allowedFlowCodes,
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: {
      mode: "allowlist",
      allowedFields: ["remarks"],
      requiredFields: [],
      rejectUnknownFields: true,
    },
  };
}

describe("lifecycle command registry", () => {
  it("uses a normalized entity-and-operation key", () => {
    expect(lifecycleCommandKey("Purchase-Invoice", "POST")).toBe("purchase_invoice::post");
  });

  it.each(EXPECTED_COMMANDS)(
    "resolves %s::%s for flow:%s exactly once",
    (entityCode, operationCode, flowCode) => {
      const resolved = resolveLifecycleCommand(entityCode, operationCode, flowCode);
      expect(resolved).toMatchObject({
        entityCode,
        operationCode,
        transitionOwner: "lifecycle_orchestrator",
      });
      expect(
        listLifecycleCommands().filter(
          (entry) => entry.entityCode === entityCode && entry.operationCode === operationCode,
        ),
      ).toHaveLength(1);
    },
  );

  it("fails closed for an unregistered entity and operation", () => {
    expect(() => resolveLifecycleCommand("purchase_order", "submit", "submit_for_approval"))
      .toThrowError(expect.objectContaining<Partial<LifecycleCommandResolutionError>>({
        code: "LIFECYCLE_COMMAND_NOT_REGISTERED",
      }));
  });

  it("rejects a flow and entity/operation mismatch explicitly", () => {
    expect(() => resolveLifecycleCommand("purchase_invoice", "post", "submit_for_approval"))
      .toThrowError(expect.objectContaining<Partial<LifecycleCommandResolutionError>>({
        code: "LIFECYCLE_FLOW_ENTITY_MISMATCH",
      }));
  });

  it("detects duplicate registrations during registry construction", () => {
    expect(() => new LifecycleCommandRegistry([
      registration(),
      registration("TEST-ENTITY", "SUBMIT"),
    ])).toThrow("Duplicate lifecycle command registration: test_entity::submit");
  });
});
