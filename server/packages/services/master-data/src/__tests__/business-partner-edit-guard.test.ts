import { describe, expect, it, vi } from "vitest";
import { createBusinessPartnerRequestService, type BusinessPartnerRequestServiceOptions } from "../business-partner-request-service.js";
const current = { id: "request", tenantId: "tenant", requestNo: "BPR-TEST", rowVersion: 4, status: "returned", kind: "new_partner", source: { kind: "manual" }, requestedRole: "supplier", operatingOrganizationId: "org", proposedPayload: { requestedComplianceLevel: "standard" }, extensionSummary: { mode: "none", counts: {} } };
const command = { context: { planeKey: "neon", tenantId: "tenant", principalId: "maker" }, requestId: "request", expectedVersion: 4, proposedPayload: { website: "https://example.invalid" } } as never;
function fixture(guardAmendment: ReturnType<typeof vi.fn>) {
  const transaction = {}, patch = vi.fn(async () => ({ ...current, rowVersion: 5 }));
  const append = vi.fn(async () => undefined), record = vi.fn(async () => undefined);
  const options = { guardAmendment, repository: { get: async () => current, patch }, authorizer: { authorize: async () => ({ allowed: true }) }, transactions: { run: async (_plane: unknown, _actor: unknown, work: (tx: object) => Promise<unknown>) => work(transaction) }, outbox: { append }, audit: { record } } as unknown as BusinessPartnerRequestServiceOptions<object>;
  return { service: createBusinessPartnerRequestService(options), patch, append, record, transaction };
}
describe("owning request edit guard", () => {
  it("rejects a denied edit before patch or outcome events", async () => {
    const guard = vi.fn(async () => { throw Error("TASK_EDIT_POLICY_DENIED"); }), f = fixture(guard);
    await expect(f.service.patch(command)).rejects.toThrow("TASK_EDIT_POLICY_DENIED");
    expect(guard).toHaveBeenCalledWith(command, current, f.transaction);
    expect(f.patch).not.toHaveBeenCalled(); expect(f.append).not.toHaveBeenCalled(); expect(f.record).not.toHaveBeenCalled();
  });
  it("stores the evaluated evidence with the owning update event in the same transaction", async () => {
    const evidence = { permitted: true, effect: "full_reapproval", factHash: "hash", changedPaths: ["/proposedPayload/website"] };
    const f = fixture(vi.fn(async () => evidence));
    await expect(f.service.patch(command)).resolves.toMatchObject({ rowVersion: 5 });
    expect(f.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "business_partner.case.updated", payload: expect.objectContaining({ editPolicyEvidence: evidence }) }), f.transaction);
    expect(f.record).toHaveBeenCalled();
  });
});
