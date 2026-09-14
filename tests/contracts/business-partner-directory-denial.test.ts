import { describe, it, expect, vi } from "vitest";
import { createBusinessPartner360Service } from "../../server/packages/services/master-data/src/business-partner-360-service.js";
import { MasterDataError } from "../../server/packages/services/master-data/src/errors.js";
import { RecordServiceError } from "../../server/packages/services/records/src/errors.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

const context = {
  planeKey: "neon",
  tenantId: "tenant",
  principalId: "principal",
  assurance: "elevated",
} as VerifiedRequestContext;
function fixture(error: Error) {
  const authorize = vi.fn(),
    resolveCore = vi.fn();
  const service = createBusinessPartner360Service({
    authorizer: { authorize },
    repository: { resolveCore } as never,
    transactions: {
      async run(_plane, _actor, work) {
        return work({});
      },
    },
    definitions: {} as never,
    admitDirectoryRecord: async () => {
      throw error;
    },
  });
  const input = {
    context,
    businessPartnerId: "partner",
    purpose: "qualification.neon",
    revealId: "11111111-1111-4111-8111-111111111111",
    purposeExpiresAt: new Date(Date.now() + 30000).toISOString(),
  };
  return {
    authorize,
    resolveCore,
    requests: {
      summary: () => service.summary(input),
      section: () => service.section({ ...input, sectionCode: "banking" }),
      bank: () =>
        service.revealBankAccount({ ...input, bankAccountLinkId: "bank" }),
      tax: () =>
        service.revealTaxRegistration({ ...input, taxRegistrationId: "tax" }),
    },
  };
}
describe("BP directory rejection at the service boundary", () => {
  for (const status of [403, 404])
    for (const operation of ["summary", "section", "bank", "tax"] as const)
      it(`preserves Records ${status} for ${operation} without exposing its detail`, async () => {
        const f = fixture(
          new RecordServiceError(
            status,
            "RECORD_ACCESS_DENIED",
            "Private upstream detail",
          ),
        );
        let caught: unknown;
        try {
          await f.requests[operation]();
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(MasterDataError);
        expect(caught).toMatchObject({ status });
        expect((caught as Error).message).not.toContain(
          "Private upstream detail",
        );
        expect(f.authorize).not.toHaveBeenCalled();
        expect(f.resolveCore).not.toHaveBeenCalled();
      });
  it("does not relabel unexpected directory failures as access denials", async () => {
    const failure = new Error("Unexpected backend failure"),
      f = fixture(failure);
    await expect(f.requests.summary()).rejects.toBe(failure);
  });
});
