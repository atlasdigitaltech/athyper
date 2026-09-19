import { describe, expect, it, vi } from "vitest";
import {
  createCustomerPortalDeliveryHandler,
  planCustomerPortalProjection,
  type CustomerPortalIntent,
  type CustomerPortalIdentity,
  type CustomerPortalDeliveryPort,
} from "../customer-portal-delivery.js";
const intent: CustomerPortalIntent = {
  tenantId: "tenant",
  outboxId: "event",
  customerId: "customer",
  lifecycleEventId: "lifecycle",
  version: 2,
  status: "active",
  contacts: [
    { sourceRef: "business_partner_contact:contact", personId: "person" },
  ],
};
const identity: CustomerPortalIdentity = {
  id: "identity",
  personId: "person",
  sourceRef: "business_partner_contact:contact",
  version: 4,
  hash: "a".repeat(64),
  status: "active",
  applications: [{ plane: "neon", targetTenantId: "tenant", roles: [] }],
};
describe("Customer portal existing-contact projection", () => {
  it("preserves the approved application scope and advances a deterministic version/hash", () => {
    const before = structuredClone(identity);
    const a = planCustomerPortalProjection(intent, identity);
    expect(a).toMatchObject({
      id: "identity",
      desiredVersion: 5,
      desiredStatus: "active",
    });
    expect(a.desiredHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toEqual(planCustomerPortalProjection(intent, identity));
    expect(identity).toEqual(before);
  });
  it.each([
    ["suspended", "suspended"],
    ["inactive", "deprovisioned"],
    ["archived", "deprovisioned"],
  ] as const)("projects %s to %s", (status, desiredStatus) => {
    expect(
      planCustomerPortalProjection({ ...intent, status }, identity)
        .desiredStatus,
    ).toBe(desiredStatus);
  });
  it("rejects a different Person or contact binding", () => {
    expect(() =>
      planCustomerPortalProjection(intent, { ...identity, personId: "other" }),
    ).toThrow("CONTACT_MISMATCH");
    expect(() =>
      planCustomerPortalProjection(intent, {
        ...identity,
        sourceRef: "business_partner_contact:other",
      }),
    ).toThrow("CONTACT_MISMATCH");
  });
  it("cannot clear an independent IAM suspension", () => {
    expect(() =>
      planCustomerPortalProjection(intent, {
        ...identity,
        status: "suspended",
      }),
    ).toThrow("INDEPENDENT_HOLD");
    expect(
      planCustomerPortalProjection(intent, {
        ...identity,
        status: "suspended",
        priorLifecycleHash: identity.hash,
      }).desiredStatus,
    ).toBe("active");
  });
  it("does not invent missing application grants", () => {
    expect(() =>
      planCustomerPortalProjection(intent, { ...identity, applications: [] }),
    ).toThrow("APPLICATIONS_MISSING");
  });
});
function fixture(disposition: "pending" | "consumed" = "pending") {
  const item = {
    outboxId: "event",
    tenantId: "tenant",
    attempt: 1,
    maxAttempts: 5,
    claimToken: "claim",
  };
  const repository: CustomerPortalDeliveryPort = {
    claim: vi.fn(async () => [item]),
    intent: vi.fn(async () => intent),
    finish: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
  };
  const consume = vi.fn(async () => ({
    receiptId: "receipt",
    lifecycleEventId: "lifecycle",
    disposition,
    attempts: disposition === "consumed" ? ["saga-attempt"] : [],
  }));
  const handler = createCustomerPortalDeliveryHandler(repository, async () => ({
    consume,
  }));
  return {
    repository,
    consume,
    run: () => handler.handle({ data: {} } as never, {} as never),
  };
}
describe("Customer portal delivery receipts", () => {
  it("does not mark queued IAM work consumed", async () => {
    const f = fixture();
    await f.run();
    expect(f.repository.finish).not.toHaveBeenCalled();
    expect(f.repository.retry).toHaveBeenCalledWith(
      expect.anything(),
      "CUSTOMER_PORTAL_OBSERVATION_PENDING",
    );
  });
  it("completes only with the consumer's successful saga receipt", async () => {
    const f = fixture("consumed");
    await f.run();
    expect(f.repository.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptId: "receipt",
        attempts: ["saga-attempt"],
      }),
    );
  });
  it("does not deliver a superseded lifecycle event", async () => {
    const f = fixture();
    vi.mocked(f.repository.intent).mockResolvedValue(undefined);
    await f.run();
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.repository.finish).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
  });
  it("keeps missing bindings as failures without exposing exception data", async () => {
    const f = fixture();
    f.consume.mockRejectedValue(new Error("private provider payload"));
    await f.run();
    expect(f.repository.finish).not.toHaveBeenCalled();
    expect(f.repository.retry).toHaveBeenCalledWith(
      expect.anything(),
      "CUSTOMER_PORTAL_DELIVERY_FAILED",
    );
  });
});
