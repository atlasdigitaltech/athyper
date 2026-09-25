import { describe, expect, it, vi } from "vitest";
import { createHttpSupplierWorkforceDistributionEligibility } from "../supplier-workforce-distribution-http-adapter.js";
const businessPartnerId = "44444444-4444-4444-8444-444444444444";
const coordinate = "55555555-5555-4555-8555-555555555555";
function fixture(proofPartner: string | undefined) {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          proof: {
            businessPartnerId: proofPartner,
            networkRelationshipId: coordinate,
            capabilityId: coordinate,
            qualificationId: coordinate,
            evidenceHash: "a".repeat(64),
            evaluatedAt: "2026-09-25T00:00:00Z",
          },
        }),
      ),
  );
  const adapter = createHttpSupplierWorkforceDistributionEligibility({
    baseUrl: "https://mesh.example",
    credentialReference: "test",
    fetch: request as typeof fetch,
    secrets: {
      resolve: async () => ({
        bytes: new TextEncoder().encode("test-only-token"),
      }),
    } as never,
  });
  const input = {
    context: {
      tenantId: coordinate,
      principalId: coordinate,
      requestId: "test",
    },
    requisition: {
      id: coordinate,
      companyCodeId: coordinate,
      expectedStartDate: "2026-10-01",
    },
    businessPartnerId,
  } as never;
  return { adapter, input, request };
}
describe("workforce counterparty proof binding", () => {
  it("sends BP identity and accepts matching evidence", async () => {
    const f = fixture(businessPartnerId);
    expect(await f.adapter.evaluate(f.input)).toMatchObject({
      allowed: true,
      proof: { businessPartnerId },
    });
    const body = JSON.parse(
      (f.request.mock.calls[0] as unknown as [unknown, RequestInit])[1]
        .body as string,
    );
    expect(body.businessPartnerId).toBe(businessPartnerId);
    expect(body).not.toHaveProperty("supplierId");
  });
  it.each([undefined, coordinate])(
    "rejects missing or another partner's evidence",
    async (value) => {
      const f = fixture(value);
      expect(await f.adapter.evaluate(f.input)).toEqual({
        allowed: false,
        reasonCodes: ["MESH_WORKFORCE_EVIDENCE_INVALID"],
      });
    },
  );
});
