import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  BUSINESS_PARTNER_360_PERMISSIONS,
  type BusinessPartner360PartyCategory,
} from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import {
  createBusinessPartner360Service,
  type BusinessPartner360Core,
  type BusinessPartner360MeshNetworkAdapter,
  type BusinessPartner360Repository,
} from "../index.js";
const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  authEpoch: 7,
  profileHash: "profile",
  requestId: "request",
  assurance: "elevated",
  permissions: { allowed: [] },
} as unknown as VerifiedRequestContext;
const ids = {
  bp: "33333333-3333-4333-8333-333333333333",
  org: "44444444-4444-4444-8444-444444444444",
  company: "55555555-5555-4555-8555-555555555555",
};
class MemoryRepository implements BusinessPartner360Repository<object> {
  constructor(readonly core: BusinessPartner360Core | null) {}
  async resolveCore() {
    return this.core;
  }
  async readFragments() {
    return {
      identifiers: [
        {
          id: "id-1",
          schemeCode: "duns",
          maskedValue: "*****6789",
          primary: true,
          verified: true,
        },
      ],
      openWork: {
        activeRequestCount: 2,
        returnedRequestCount: 1,
        expiringQualificationCount: 0,
        expiringCertificateCount: 0,
        pendingBankVerificationCount: 0,
      },
      recentActivity: [],
      counts: {
        identity: 1,
        "roles-scope": this.core?.roles.length ?? 0,
        "identifiers-tax": 1,
        workforce: this.core?.roles.some((role) => role.code === "workforce")
          ? 1
          : 0,
      },
      provenance: [
        {
          plane: "neon" as const,
          service: "master-data",
          sourceObject: "master.business_partner",
          observedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    };
  }
  async readCommonSection(
    input: Parameters<
      BusinessPartner360Repository<object>["readCommonSection"]
    >[0],
  ) {
    return {
      items: [
        {
          id: "section-item",
          kind: input.sectionCode === "identifiers-tax" ? "tax" : "canonical",
          ...(input.sectionCode === "identifiers-tax"
            ? { maskedValue: "VAT-****42" }
            : { name: "Example Partner" }),
        },
      ],
      ...(!input.cursor.afterId
        ? {
            next: {
              at: "2026-08-29T00:00:00.000Z",
              id: "88888888-8888-4888-8888-888888888888",
            },
          }
        : {}),
      provenance: [
        {
          plane: "neon" as const,
          service: "master-data",
          sourceObject: "fixture",
          observedAt: input.cursor.snapshotAt,
        },
      ],
      redactions: [],
    };
  }
  async readRoleCompanySection(
    input: Parameters<
      BusinessPartner360Repository<object>["readRoleCompanySection"]
    >[0],
  ) {
    return {
      data: {
        scopeState: input.historical ? "historical" : "scoped",
        readOnly: input.historical,
        ...(input.sectionCode === "supplier-company"
          ? {
              supplier: { code: "SUP-1" },
              profile: {
                companyCodeId: input.companyCodeId,
                currencyCode: "USD",
              },
            }
          : input.sectionCode === "customer-company"
            ? {
                customer: { code: "CUS-1" },
                profile: {
                  companyCodeId: input.companyCodeId,
                  currencyCode: "EUR",
                },
              }
            : { roles: this.core?.roles ?? [] }),
      },
      state: "ready" as const,
      provenance: [
        {
          plane: "neon" as const,
          service: "master-data",
          sourceObject: "fixture",
          observedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    };
  }
  async readWorkforceSection(
    input: Parameters<
      BusinessPartner360Repository<object>["readWorkforceSection"]
    >[0],
  ) {
    return {
      data: {
        asOf: input.asOf,
        historical: input.historical,
        readOnly: input.historical,
        personal: {
          personId: "person-1",
          displayName: "Ada Lovelace",
          sensitiveRevealAllowed: input.sensitiveRevealAllowed,
        },
        employments: [{ hireDate: "2026-01-01" }],
        assignments: [],
        peopleCases: [],
        engagements: [
          {
            workerNumber: "CW-1",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            placements: [],
          },
        ],
      },
      state: "ready" as const,
      provenance: [],
    };
  }
  async readNetworkSection() {
    const provenance = [
      {
        authority: "neon" as const,
        authorityTenantId: context.tenantId,
        sourceObject: "snapshot.mesh_business_partner_profile_received",
        observedAt: "2026-08-30T00:00:00.000Z",
        schemaCode: "mesh.business_partner_profile",
        schemaVersion: 1,
        fieldSetCode: "recipient_safe_v1",
        hash: "b".repeat(64),
        freshness: "fresh" as const,
      },
    ];
    return {
      data: {
        accountLink: {
          id: "link-1",
          networkRelationshipId: "77777777-7777-4777-8777-777777777777",
          sourceTenantId: "88888888-8888-4888-8888-888888888888",
          sourceNetworkAccountId: "99999999-9999-4999-8999-999999999999",
          recipientNetworkAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          proposedRole: "supplier" as const,
          status: "active",
        },
        received: {
          snapshotId: "snapshot-1",
          publicationId: "publication-1",
          publicationVersion: 2,
          lifecycleVersion: 1,
          state: "received" as const,
          receivedAt: "2026-08-30T00:00:00.000Z",
        },
        match: {
          id: "match-1",
          state: "matched" as const,
          algorithmCode: "exact",
          algorithmVersion: 1,
          matchedAt: "2026-08-30T00:00:00.000Z",
          diffHash: "c".repeat(64),
          fieldPaths: ["partner.displayName", "partner.websiteUrl"],
        },
        acceptance: {
          id: "accept-1",
          state: "request_created" as const,
          acceptedFields: ["partner.displayName"],
          ignoredFields: ["partner.websiteUrl"],
          acceptanceHash: "d".repeat(64),
          preparedAt: "2026-08-30T00:00:00.000Z",
          businessPartnerRequestId: "request-1",
        },
        bankDisclosure: {
          present: true,
          status: "available",
          disclosureVersion: 1,
          lifecycleVersion: 1,
          observedAt: "2026-08-30T00:00:00.000Z",
        },
        provenance,
      },
      state: "ready" as const,
      provenance: [
        {
          plane: "neon" as const,
          service: "master-data",
          sourceObject: "snapshot.mesh_business_partner_profile_received",
          observedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    };
  }
  async readRestrictedTaxValue() {
    return { tokenOrValue: "vault:tax:opaque-001", protected: true };
  }
  async legacyAggregate() {
    return null;
  }
}
const core = (
  category: BusinessPartner360PartyCategory,
  roles: readonly ("supplier" | "customer" | "workforce")[],
  scopeValid = true,
): BusinessPartner360Core => ({
  id: ids.bp,
  code: "BP.TEST",
  category,
  name: "Example Partner",
  status: "active",
  version: 3,
  changedAt: "2026-08-30T00:00:00.000Z",
  businessDate: "2026-08-30",
  roles: roles.map((code, index) => ({
    id: `role-${index}`,
    code,
    status: "active",
  })),
  scopeValid,
  scopeResolved: true,
});
function fixture(
  value: BusinessPartner360Core | null,
  allowed: ReadonlySet<string> = new Set(
    Object.values(BUSINESS_PARTNER_360_PERMISSIONS),
  ),
  meshNetwork?: BusinessPartner360MeshNetworkAdapter,
) {
  const authorizer = {
    async authorize(input: { permissionCode: string }) {
      return { allowed: allowed.has(input.permissionCode) };
    },
  };
  return createBusinessPartner360Service({
    authorizer: authorizer as never,
    repository: new MemoryRepository(value),
    transactions: {
      async run(_plane, _actor, work) {
        return work({});
      },
    },
    definitions: {
      async resolve() {
        return {
          code: "business_partner.onboarding" as const,
          version: "1.0.0",
          hash: "a".repeat(64),
        };
      },
    },
    ...(meshNetwork ? { meshNetwork } : {}),
    now: () => new Date("2026-08-30T01:00:00.000Z"),
  });
}
describe("Business Partner 360 secure core", () => {
  it.each([
    [
      "supplier",
      core("organization", ["supplier"]),
      ["supplier-company", "banking"],
      ["customer-company", "workforce"],
    ],
    [
      "customer",
      core("organization", ["customer"]),
      ["customer-company", "credit"],
      ["supplier-company", "workforce"],
    ],
    [
      "dual",
      core("organization", ["supplier", "customer"]),
      ["supplier-company", "customer-company"],
      ["workforce"],
    ],
  ] as const)(
    "returns the %s manifest without unrelated domains",
    async (_name, value, present, absent) => {
      const summary = await fixture(value).summary({
        context,
        businessPartnerId: ids.bp,
        operatingOrganizationId: ids.org,
        roleLens: "all",
      });
      const codes = summary.sections.map((section) => section.code);
      for (const code of present) expect(codes).toContain(code);
      for (const code of absent) expect(codes).not.toContain(code);
      expect(JSON.stringify(summary)).not.toMatch(
        /dateOfBirth|nationalIdentifier|personSensitive|passportNumber|bankAccountNumber/i,
      );
    },
  );
  it("fails invalid organization/company scope with the stable safe code", async () => {
    await expect(
      fixture(core("organization", ["supplier"], false)).summary({
        context,
        businessPartnerId: ids.bp,
        operatingOrganizationId: ids.org,
        companyCodeId: ids.company,
      }),
    ).rejects.toMatchObject({ status: 400, code: "BP_360_SCOPE_INVALID" });
  });
  it("passes selected scope coordinates into record visibility authorization", async () => {
    let resource: Readonly<Record<string, unknown>> | undefined;
    const authorizer = {
        async authorize(input: {
          permissionCode: string;
          resource?: Readonly<Record<string, unknown>>;
        }) {
          if (input.permissionCode === BUSINESS_PARTNER_360_PERMISSIONS.record)
            resource = input.resource;
          return { allowed: true };
        },
      },
      service = createBusinessPartner360Service({
        authorizer: authorizer as never,
        repository: new MemoryRepository(core("organization", ["supplier"])),
        transactions: {
          async run(_plane, _actor, work) {
            return work({});
          },
        },
        definitions: {
          async resolve() {
            return {
              code: "business_partner.onboarding" as const,
              version: "1.0.0",
              hash: "a".repeat(64),
            };
          },
        },
      });
    await service.summary({
      context,
      businessPartnerId: ids.bp,
      operatingOrganizationId: ids.org,
      companyCodeId: ids.company,
      legalEntityId: "66666666-6666-4666-8666-666666666666",
    });
    expect(resource).toMatchObject({
      tenantId: context.tenantId,
      businessPartnerId: ids.bp,
      operatingOrganizationId: ids.org,
      companyCodeId: ids.company,
      legalEntityId: "66666666-6666-4666-8666-666666666666",
    });
  });
  it("returns the same non-enumerating 404 for an invisible or missing partner", async () => {
    await expect(
      fixture(core("organization", ["supplier"]), new Set()).summary({
        context,
        businessPartnerId: ids.bp,
      }),
    ).rejects.toMatchObject({ status: 404, code: "BP_360_NOT_FOUND" });
    await expect(
      fixture(null, new Set([BUSINESS_PARTNER_360_PERMISSIONS.record])).summary(
        { context, businessPartnerId: ids.bp },
      ),
    ).rejects.toMatchObject({ status: 404, code: "BP_360_NOT_FOUND" });
  });
  it("returns section 403 only after record visibility and hides denied sections from the manifest", async () => {
    const allowed = new Set<string>([BUSINESS_PARTNER_360_PERMISSIONS.record]);
    const service = fixture(core("organization", ["supplier"]), allowed),
      summary = await service.summary({
        context,
        businessPartnerId: ids.bp,
        operatingOrganizationId: ids.org,
      });
    expect(summary.sections.map((item) => item.code)).toEqual(
      expect.arrayContaining(["overview", "roles-scope"]),
    );
    expect(summary.sections.map((item) => item.code)).not.toContain(
      "addresses",
    );
    await expect(
      service.section({
        context,
        businessPartnerId: ids.bp,
        operatingOrganizationId: ids.org,
        sectionCode: "addresses",
      }),
    ).rejects.toMatchObject({ status: 403, code: "BP_360_SECTION_FORBIDDEN" });
  });
  it("returns independently paginated common sections with record-bound opaque cursors", async () => {
    const service = fixture(core("organization", ["supplier"])),
      first = await service.section<{
        items: readonly unknown[];
        nextCursor?: string;
      }>({
        context,
        businessPartnerId: ids.bp,
        sectionCode: "identity",
        limit: 10,
      });
    expect(first.data.items).toHaveLength(1);
    expect(first.data.nextCursor).toBeTruthy();
    const second = await service.section<{
      items: readonly unknown[];
      nextCursor?: string;
    }>({
      context,
      businessPartnerId: ids.bp,
      sectionCode: "identity",
      limit: 10,
      cursor: first.data.nextCursor,
    });
    expect(second.data.nextCursor).toBeUndefined();
    await expect(
      service.section({
        context,
        businessPartnerId: ids.bp,
        sectionCode: "identity",
        cursor: "not-a-cursor",
      }),
    ).rejects.toMatchObject({ code: "BP_360_CURSOR_STALE" });
  });
  it("keeps canonical section data readable when the completeness definition is unavailable", async () => {
    const service = createBusinessPartner360Service({
        authorizer: {
          async authorize() {
            return { allowed: true };
          },
        } as never,
        repository: new MemoryRepository(core("organization", ["supplier"])),
        transactions: {
          async run(_plane, _actor, work) {
            return work({});
          },
        },
        definitions: {
          async resolve() {
            throw new Error(
              "BUSINESS_PARTNER_DEFINITION_LOCAL_ACTIVE_REQUIRED",
            );
          },
        },
        now: () => new Date("2026-08-30T01:00:00.000Z"),
      }),
      result = await service.section<{ items: readonly unknown[] }>({
        context,
        businessPartnerId: ids.bp,
        sectionCode: "identity",
      });
    expect(result).toMatchObject({
      state: "ready",
      definitionHash: "0".repeat(64),
      data: { items: [{ id: "section-item" }] },
    });
  });
  it("reveals protected tax only through the purpose-bound resolver and records value-free audit", async () => {
    const events: unknown[] = [],
      repository = new MemoryRepository(core("organization", ["supplier"]));
    repository.claimRestrictedReveal = async () => true;
    const authorizer = {
        async authorize() {
          return { allowed: true };
        },
      },
      service = createBusinessPartner360Service({
        authorizer: authorizer as never,
        repository,
        transactions: {
          async run(_plane, _actor, work) {
            return work({});
          },
        },
        definitions: {
          async resolve() {
            return {
              code: "business_partner.onboarding" as const,
              version: "1.0.0",
              hash: "a".repeat(64),
            };
          },
        },
        protectedValues: {
          async reveal(input) {
            expect(input.token).toBe("vault:tax:opaque-001");
            return "MY-TAX-00042";
          },
        },
        audit: {
          async record(input) {
            events.push(input);
            return {
              ...input,
              id: "audit",
              occurredAt: "2026-08-30T01:00:00.000Z",
              severity: "info" as const,
            };
          },
        },
        now: () => new Date("2026-08-30T01:00:00.000Z"),
      });
    const result = await service.revealTaxRegistration({
      context,
      businessPartnerId: ids.bp,
      taxRegistrationId: "77777777-7777-4777-8777-777777777777",
      purpose: "business_verification",
      revealId: "77777777-7777-4777-8777-777777777777",
      purposeExpiresAt: "2026-08-30T01:00:30.000Z",
    });
    expect(result).toMatchObject({
      value: "MY-TAX-00042",
      expiresAt: "2026-08-30T01:01:00.000Z",
    });
    expect(JSON.stringify(events)).not.toMatch(/MY-TAX|vault:tax/);
  });
  it("keeps supplier AP and customer AR projections independent for a dual-role partner", async () => {
    const service = fixture(core("organization", ["supplier", "customer"])),
      scope = {
        context,
        businessPartnerId: ids.bp,
        operatingOrganizationId: ids.org,
        companyCodeId: ids.company,
      } as const,
      supplier = await service.section<Record<string, unknown>>({
        ...scope,
        roleLens: "supplier",
        sectionCode: "supplier-company",
      }),
      customer = await service.section<Record<string, unknown>>({
        ...scope,
        roleLens: "customer",
        sectionCode: "customer-company",
      });
    expect(supplier.data).toMatchObject({
      supplier: { code: "SUP-1" },
      profile: { currencyCode: "USD" },
    });
    expect(supplier.data).not.toHaveProperty("customer");
    expect(customer.data).toMatchObject({
      customer: { code: "CUS-1" },
      profile: { currencyCode: "EUR" },
    });
    expect(customer.data).not.toHaveProperty("supplier");
  });
  it("marks explicit as-of role and company reads historical and read-only", async () => {
    const section = await fixture(core("organization", ["supplier"])).section<
      Record<string, unknown>
    >({
      context,
      businessPartnerId: ids.bp,
      operatingOrganizationId: ids.org,
      companyCodeId: ids.company,
      roleLens: "supplier",
      sectionCode: "supplier-company",
      asOf: "2025-01-31",
    });
    expect(section.data).toMatchObject({
      scopeState: "historical",
      readOnly: true,
    });
  });
  it("does not expose person or workforce records through Business Partner 360", async () => {
    const service = fixture(core("person", ["workforce"]));
    await expect(
      service.summary({ context, businessPartnerId: ids.bp }),
    ).rejects.toMatchObject({ status: 404, code: "BP_360_NOT_FOUND" });
    await expect(
      service.section({
        context,
        businessPartnerId: ids.bp,
        sectionCode: "workforce",
      }),
    ).rejects.toMatchObject({ status: 404, code: "BP_360_NOT_FOUND" });
  });
  it("returns the local safe network projection when the live MESH adapter is unavailable", async () => {
    const result = await fixture(core("organization", ["supplier"])).section<
      Record<string, unknown>
    >({
      context,
      businessPartnerId: ids.bp,
      operatingOrganizationId: ids.org,
      sectionCode: "network",
    });
    expect(result).toMatchObject({
      state: "partial",
      data: {
        local: {
          received: { state: "received" },
          acceptance: {
            acceptedFields: ["partner.displayName"],
            ignoredFields: ["partner.websiteUrl"],
          },
          bankDisclosure: { present: true, status: "available" },
        },
        live: { state: "unavailable", reasonCode: "MESH_ADAPTER_UNAVAILABLE" },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /accountLast4|accountNumber|proposedPayload|fieldDiff|rankedCandidates|person|workforce/i,
    );
  });
});

describe("360 metadata directory admission", () => {
  const make = (
    reason: string,
    baseAllowed = true,
    admitted = true,
    published = true,
    admissionFails = false,
  ) => {
    let baseCalls = 0;
    const service = createBusinessPartner360Service({
      authorizer: {
        async authorize(input: { permissionCode: string; resource?: unknown }) {
          if (input.permissionCode !== BUSINESS_PARTNER_360_PERMISSIONS.record)
            return { allowed: false, reason: "missing_permission" };
          if (input.resource) return { allowed: false, reason };
          baseCalls++;
          return baseAllowed
            ? { allowed: true }
            : { allowed: false, reason: "denied_by_grant" };
        },
      } as never,
      repository: new MemoryRepository(core("organization", ["supplier"])),
      transactions: {
        async run(_plane, _actor, work) {
          return work({});
        },
      },
      definitions: {
        async resolve() {
          throw new Error("Unavailable");
        },
      },
      metadata: {
        async getEntityDescriptor() {
          return published
            ? { directoryScope: { schemaVersion: 1, mode: "tenant" } }
            : {};
        },
      } as never,
      ...(admitted
        ? {
            admitDirectoryRecord: async () => {
              if (admissionFails) throw new Error("Directory denied");
            },
          }
        : {}),
    });
    return { service, baseCalls: () => baseCalls };
  };
  it("accepts a record admitted by the contract without inheriting organization scope", async () => {
    const fixture = make("scope_not_contained");
    const result = await fixture.service.summary({
      context,
      businessPartnerId: ids.bp,
    });
    expect(result.identity.id).toBe(ids.bp);
    expect(fixture.baseCalls()).toBe(1);
    expect(result.sections).toEqual([]); // section grants are not widened
  });
  it.each([
    "denied_by_grant",
    "missing_permission",
    "mfa_required",
    "hard_policy_failed",
  ])("preserves %s", async (reason) => {
    const fixture = make(reason);
    await expect(
      fixture.service.summary({ context, businessPartnerId: ids.bp }),
    ).rejects.toMatchObject({ code: "BP_360_NOT_FOUND" });
    expect(fixture.baseCalls()).toBe(0);
  });
  it("requires published policy, successful row admission and a coarse permission grant", async () => {
    for (const args of [
      [true, false, true, false],
      [true, true, false, false],
      [false, true, true, false],
    ] as const) {
      const fixture = make("scope_not_contained", ...args);
      await expect(
        fixture.service.summary({ context, businessPartnerId: ids.bp }),
      ).rejects.toMatchObject({ code: "BP_360_NOT_FOUND" });
    }
    const fixture = make("scope_not_contained", true, true, true, true);
    await expect(
      fixture.service.summary({ context, businessPartnerId: ids.bp }),
    ).rejects.toThrow("Directory denied");
    expect(fixture.baseCalls()).toBe(0);
  });
});
it("does not read a company transaction section without an explicit scope", async () => {
  const service = fixture({
    ...core("organization", ["supplier"]),
    scopeResolved: false,
  });
  await expect(
    service.section({
      context,
      businessPartnerId: ids.bp,
      sectionCode: "supplier-company",
    }),
  ).rejects.toMatchObject({ code: "BP_360_SCOPE_REQUIRED", status: 409 });
});

describe("published related collection ordering", () => {
  for (const sectionCode of ["contacts", "addresses"] as const) {
    it(`${sectionCode} binds primary-first cursor anchors to the published order`, async () => {
      let order = "primary-first";
      const seen: unknown[] = [];
      class OrderedRepository extends MemoryRepository {
        override async readCommonSection(
          input: Parameters<
            BusinessPartner360Repository<object>["readCommonSection"]
          >[0],
        ) {
          seen.push(input);
          const page = await super.readCommonSection(input);
          return {
            ...page,
            ...(page.next ? { next: { ...page.next, primary: true } } : {}),
          };
        }
      }
      const service = createBusinessPartner360Service({
        authorizer: {
          async authorize() {
            return { allowed: true };
          },
        } as never,
        repository: new OrderedRepository(core("organization", ["supplier"])),
        metadata: {
          async getEntityDescriptor() {
            return {
              recordPresentation: {
                related: [{ sectionKey: sectionCode, collectionOrder: order }],
              },
            };
          },
        } as never,
        transactions: {
          async run(_plane, _actor, work) {
            return work({});
          },
        },
        definitions: {
          async resolve() {
            return {
              code: "business_partner.onboarding" as const,
              version: "1.0.0",
              hash: "a".repeat(64),
            };
          },
        },
        now: () => new Date("2026-09-09T00:00:00Z"),
      });
      const first = await service.section<{ nextCursor?: string }>({
        context,
        businessPartnerId: ids.bp,
        sectionCode,
        limit: 1,
      });
      const payload = JSON.parse(
        Buffer.from(first.data.nextCursor!, "base64url").toString(),
      );
      expect(payload).toMatchObject({
        collectionOrder: "primary-first",
        afterPrimary: true,
      });
      await service.section({
        context,
        businessPartnerId: ids.bp,
        sectionCode,
        cursor: first.data.nextCursor,
      });
      expect(seen[1]).toMatchObject({
        collectionOrder: "primary-first",
        cursor: { afterPrimary: true },
      });
      for (const bad of [undefined, "true", 0]) {
        const cursor = Buffer.from(
          JSON.stringify({ ...payload, afterPrimary: bad }),
        ).toString("base64url");
        await expect(
          service.section({
            context,
            businessPartnerId: ids.bp,
            sectionCode,
            cursor,
          }),
        ).rejects.toMatchObject({ code: "BP_360_CURSOR_STALE" });
      }
      order = "newest-first";
      await expect(
        service.section({
          context,
          businessPartnerId: ids.bp,
          sectionCode,
          cursor: first.data.nextCursor,
        }),
      ).rejects.toMatchObject({ code: "BP_360_CURSOR_STALE" });
    });
  }
});

it("passes independent case authority into summary SQL without inheriting the parent read", async () => {
  const repository = new MemoryRepository(core("organization", ["supplier"]));
  const calls: unknown[] = [];
  repository.readFragments = async (...args: any[]) => {
    const input = args[0];
    expect(await input.authorizeCase("independent-case")).toBe(false);
    throw Error("SUMMARY_CHILD_BOUNDARY_CHECKED");
  };
  const service = createBusinessPartner360Service({
    repository,
    transactions: { run: async (_p: any, _a: any, work: any) => work({}) },
    authorizer: {
      authorize: async () => ({ allowed: true }),
      enforcedEntityProfile: () => true,
    },
    refreshAuthorizationContext: async (c: any) => c,
    authorizeCaseRead: async (q: any, id: string) => {
      calls.push({
        id,
        company: q.companyCodeId,
        organization: q.operatingOrganizationId,
      });
      return false;
    },
    definitions: {
      resolve: async () => {
        throw Error("unused");
      },
    },
  } as never);
  await expect(
    service.summary({
      context,
      businessPartnerId: ids.bp,
      operatingOrganizationId: ids.org,
      companyCodeId: ids.company,
    }),
  ).rejects.toThrow("SUMMARY_CHILD_BOUNDARY_CHECKED");
  expect(calls).toEqual([
    { id: "independent-case", company: ids.company, organization: ids.org },
  ]);
});
it("fails a protected summary closed when its independent case authorizer is unavailable", async () => {
  const repository = new MemoryRepository(core("organization", ["supplier"]));
  repository.readFragments = async (...args: any[]) => {
    await args[0].authorizeCase("independent-case");
    throw Error("must not return");
  };
  const service = createBusinessPartner360Service({
    repository,
    transactions: { run: async (_p: any, _a: any, work: any) => work({}) },
    authorizer: {
      authorize: async () => ({ allowed: true }),
      enforcedEntityProfile: () => true,
    },
    refreshAuthorizationContext: async (c: any) => c,
    definitions: {
      resolve: async () => {
        throw Error("unused");
      },
    },
  } as never);
  await expect(
    service.summary({ context, businessPartnerId: ids.bp }),
  ).rejects.toMatchObject({ code: "BP_CHILD_AUTHORIZATION_UNAVAILABLE" });
});
