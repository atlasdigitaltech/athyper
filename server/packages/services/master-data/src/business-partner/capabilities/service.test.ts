import { describe, expect, it, vi } from "vitest";
import { PartnerCapabilityService, type PartnerCapabilityCommand } from "./service.js";

const context = { tenantId: "44444444-4444-4444-8444-444444444444", principalId: "11111111-1111-4111-8111-111111111111" };
const command: PartnerCapabilityCommand = {
  businessPartnerId: "22222222-2222-4222-8222-222222222222", capability: "supplier", enabled: true,
  expectedVersion: 1, reason: "Approved capability setup", idempotencyKey: "capability-test-1",
};
const tx = {};
function setup(allowed = true) {
  const authorize = vi.fn(async () => allowed);
  const change = vi.fn(async () => ({ businessPartnerId: command.businessPartnerId, capability: command.capability,
    enabled: true, recordVersion: "2", evidenceId: "evidence", replayed: false }));
  return { authorize, change, service: new PartnerCapabilityService({ change }, authorize) };
}
describe("Partner capability command boundary", () => {
  it.each(["supplier", "customer"] as const)("requires scoped %s authorization", async capability => {
    const { service, authorize, change } = setup();
    await service.change({ ...command, capability }, context, tx);
    expect(authorize).toHaveBeenCalledWith({ ...context, entityCode: "business_partner", recordId: command.businessPartnerId,
      operation: `business_partner.capability.${capability}.manage` }, tx);
    expect(change).toHaveBeenCalledWith({ ...command, capability }, context, tx);
  });
  it("denies before touching the writer, including retries", async () => {
    const { service, change } = setup(false);
    await expect(service.change(command, context, tx)).rejects.toMatchObject({ status: 403 });
    expect(change).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: "true" }, { capability: "preferred" }, { expectedVersion: 0 }, { expectedVersion: 1.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { reason: " " }, { idempotencyKey: " short " },
    { businessPartnerId: "supplier-code" }, { supplierId: "legacy-id" }, { qualificationDecision: "approved" },
  ])("rejects invalid or conflated commands: %j", async patch => {
    const { service, authorize, change } = setup();
    await expect(service.change({ ...command, ...patch } as PartnerCapabilityCommand, context, tx)).rejects.toMatchObject({ status: 400 });
    expect(authorize).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
  it("propagates authorization failure without writing", async () => {
    const { service, authorize, change } = setup();
    authorize.mockRejectedValueOnce(new Error("IAM unavailable"));
    await expect(service.change(command, context, tx)).rejects.toThrow("IAM unavailable");
    expect(change).not.toHaveBeenCalled();
  });
});
