import { describe, expect, it } from "vitest";
import {
  isNetworkPayloadSafe,
  networkQueryKey,
} from "./business-partner-360-network-client";
describe("Business Partner 360 Network client", () => {
  it("isolates queries by NEON record, scope, role, date, and permission epoch", () => {
    const query = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      sectionCode: "network" as const,
      roleLens: "supplier" as const,
      operatingOrganizationId: "org-1",
      companyCodeId: "company-1",
      legalEntityId: "legal-1",
      asOf: "2026-08-30",
      authEpoch: 8,
    };
    const key = networkQueryKey(query);
    expect(key).toEqual([
      "business-partner-360",
      "tenant-1",
      "principal-1",
      "bp-1",
      "network",
      "supplier",
      "org-1",
      "company-1",
      "legal-1",
      "2026-08-30",
      8,
    ]);
    expect(networkQueryKey({ ...query, authEpoch: 9 })).not.toEqual(key);
    expect(
      networkQueryKey({ ...query, businessPartnerId: "bp-2" }),
    ).not.toEqual(key);
  });
  it.each([
    "person",
    "workforce",
    "employee",
    "payload",
    "proposedPayload",
    "fieldDiff",
    "rankedCandidates",
    "accountNumber",
    "accountLast4",
    "iban",
    "routingNumber",
    "bankAccount",
  ])("rejects prohibited field %s", (field) =>
    expect(isNetworkPayloadSafe({ [field]: { value: "secret" } })).toBe(false),
  );
  it("accepts coordinates, statuses, safe paths, versions, hashes, freshness, and provenance", () =>
    expect(
      isNetworkPayloadSafe({
        local: {
          accountLink: { networkRelationshipId: "r", status: "active" },
          received: { state: "received" },
          acceptance: {
            acceptedFields: ["partner.displayName"],
            ignoredFields: ["partner.websiteUrl"],
          },
          bankDisclosure: { present: true, status: "available" },
          provenance: [
            {
              authority: "neon",
              sourceObject: "snapshot.mesh_business_partner_profile_received",
              hash: "a".repeat(64),
              freshness: "fresh",
            },
          ],
        },
        live: { state: "unavailable" },
      }),
    ).toBe(true));
});
