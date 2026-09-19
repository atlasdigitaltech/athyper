import { describe, expect, it, vi } from "vitest";
import { createWorkforceClient } from "./client";

describe("People/Workforce request client", () => {
  it("creates onboarding through the workforce authority with protected evidence", async () => {
    const request = vi.fn().mockResolvedValue({ request: {}, replayed: false });
    const client = createWorkforceClient({ request } as never);
    await client.onboard(
      {
        legalEntityId: "legal-1",
        companyCodeId: "company-1",
        orgUnitId: "org-unit-1",
        protectedProfileContentItemId: "content-1",
        requestedChanges: { employmentType: "regular" },
      },
      "workforce-test-key",
    );
    const call = request.mock.calls[0];
    expect(call?.[1]).toMatchObject({
      body: {
        idempotencyKey: "workforce-test-key",
        kind: "onboard_person",
        sourceKind: "manual",
        protectedProfileContentItemId: "content-1",
      },
    });
    expect(JSON.stringify(call)).not.toMatch(/businessPartner|dateOfBirth|nationalId|passport/i);
  });

  it("lists workforce requests without a Business Partner coordinate", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const client = createWorkforceClient({ request } as never);
    await client.list("company-1", "pending_approval");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      query: { companyCodeId: "company-1", status: "pending_approval", limit: 100 },
    });
  });
});
