import { describe, expect, it } from "vitest";
import { controlAdminErrorCodes, controlAdminSchemas } from "./index.js";
describe("control-admin contract", () => {
  it("has unique stable errors", () => expect(new Set(controlAdminErrorCodes).size).toBe(controlAdminErrorCodes.length));
  it("publishes strict runtime command and approval schemas", () => {
    expect(controlAdminSchemas.runtimeCommand).toMatchObject({
      additionalProperties: false,
      required: ["commandId", "idempotencyKey", "kind", "reason", "payload"],
    });
    expect(controlAdminSchemas.runtimeApprovalDecision).toMatchObject({ additionalProperties: false });
  });
});
