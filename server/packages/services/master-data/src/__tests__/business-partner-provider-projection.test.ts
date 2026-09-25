import { expect, it, vi } from "vitest";
import type { BusinessPartner360Query } from "@athyper/server-contract-master-data";
import { projectBusinessPartnerProvider } from "../business-partner/record/projection-policy";
const query = {
  context: { tenantId: "tenant", principalId: "principal", planeKey: "neon" },
  businessPartnerId: "partner",
} as BusinessPartner360Query;
it("exposes directory linkage only through bank-read projection and never account plaintext", async () => {
  const data={collections:{bank_accounts:[{id:"account",bank_name:"Directory bank",branch_name:"Branch",branch_code:"DEMO0001",bic:"DEMOXXXX",account_last4:"3002",account_id_value:"secret"}],payment_instrument_links:[{id:"link",account_last4:"3002",is_primary:false}]}};
  const allowed=await projectBusinessPartnerProvider({query,section:"banking",data,authorizer:{authorize:async()=>({allowed:true as const})}});
  expect(JSON.stringify(allowed)).toContain("DEMO0001");expect(JSON.stringify(allowed)).toContain('"is_primary":false');expect(JSON.stringify(allowed)).not.toContain("secret");
  const denied=await projectBusinessPartnerProvider({query,section:"banking",data,authorizer:{authorize:async()=>({allowed:false as const,reason:"denied"})}});
  expect(JSON.stringify(denied)).not.toContain("Directory bank");expect(JSON.stringify(denied)).not.toContain("3002");
});
it("keeps legal and display names distinct under identity-read authorization", async () => {
  const data = {items:[{id:"partner",name:"Display",legalName:"Registered",personSensitiveProfile:{secret:true}}]};
  const allowed = await projectBusinessPartnerProvider({query,section:"identity",data,authorizer:{authorize:async()=>({allowed:true as const})}});
  expect(allowed).toEqual({items:[{id:"partner",name:"Display",legalName:"Registered"}]});
  const denied = await projectBusinessPartnerProvider({query,section:"identity",data,authorizer:{authorize:async()=>({allowed:false as const,reason:"denied"})}});
  expect(JSON.stringify(denied)).not.toContain("Registered");
  expect(JSON.stringify(denied)).not.toContain("Display");
});
it("closed certificate projection requires native per-file admission and excludes undeclared evidence fields", async () => {
  const input = { query, section: "qualifications-certificates", data: { certifications: [{ id: "cert", attachment: { attachmentId: "file", fileName: "evidence.pdf", storageKey: "secret" } }] }, authorizer: { authorize: async () => ({ allowed: true as const }) } };
  expect(await projectBusinessPartnerProvider(input)).toEqual({ certifications: [{ id: "cert" }] });
  expect(await projectBusinessPartnerProvider({ ...input, authorizeCertificateAttachment: async () => false })).toEqual({ certifications: [{ id: "cert" }] });
  const authorize = vi.fn(async () => true);
  expect(await projectBusinessPartnerProvider({ ...input, authorizeCertificateAttachment: authorize })).toEqual({ certifications: [{ id: "cert", attachment: { attachmentId: "file", fileName: "evidence.pdf" } }] });
  expect(authorize).toHaveBeenCalledWith("file");
});
it("retains read-only crosswalk evidence without substituting selected classification", async () => {
  const result = await projectBusinessPartnerProvider({ query, section: "identity",
    data: { items: [{ id: "classification", industryDomainCode: "naics", industryCode: "11", crosswalks: [{ sourceDomainCode: "naics", sourceCode: "11", targetDomainCode: "isic", targetCode: "A", provenance: "AI_GENERATED", verified: false, readOnly: true, metadata: { secret: true } }] }] },
    authorizer: { authorize: async () => ({ allowed: true as const }) },
  });
  expect(result).toEqual({ items: [{ id: "classification", industryDomainCode: "naics", industryCode: "11", crosswalks: [{ sourceDomainCode: "naics", sourceCode: "11", targetDomainCode: "isic", targetCode: "A", provenance: "AI_GENERATED", verified: false, readOnly: true }] }] });
});
it("projects local Network rows without reversing coordinates and independently gates governance", async () => {
  const result = await projectBusinessPartnerProvider({
    query, section: "network",
    data: {
      commercialRelationships: [{ id: "rel", sourceBusinessPartnerId: "source", targetBusinessPartnerId: "partner", direction: "incoming", readOnly: true, secret: "excluded" }],
      governanceRelations: [{ id: "gov", memberName: "Restricted" }],
      collections: {
        commercial_relationships: [{ id: "rel", source_business_partner_id: "source", target_business_partner_id: "partner", metadata: { secret: true } }],
        governance_relations: [{ id: "gov", member_name: "Restricted" }],
      },
    },
    authorizer: { authorize: async request => request.permissionCode === "neon.relationship.bp_target.network_read" ? { allowed: true as const } : { allowed: false as const, reason: "denied" } },
  });
  expect(result).toEqual({
    commercialRelationships: [{ id: "rel", sourceBusinessPartnerId: "source", targetBusinessPartnerId: "partner", direction: "incoming", readOnly: true }],
    governanceRelations: [],
    collections: { commercial_relationships: [{ id: "rel", source_business_partner_id: "source", target_business_partner_id: "partner" }], governance_relations: [] },
  });
});
it("projects known nested fields and removes undeclared objects/arrays", async () => {
  const result = await projectBusinessPartnerProvider({
    query,
    section: "contacts",
    data: {
      items: [
        {
          id: "contact",
          displayName: "Public name",
          secret: { token: "secret" },
          unknown: ["secret"],
          channels: [
            {
              id: "channel",
              type: "email",
              value: "private@example.test",
              unexpected: "secret",
            },
          ],
        },
      ],
    },
    authorizer: {
      authorize: async (request) =>
        ({
          allowed:
            request.permissionCode !==
            "neon.relationship.business_partner.read_contact_sensitive",
        }) as never,
    },
  });
  expect(result).toEqual({
    items: [
      {
        id: "contact",
        displayName: "Public name",
        channels: [{ id: "channel", type: "email" }],
      },
    ],
  });
});
it("does not use a mask declaration to release the raw value", async () => {
  const result = await projectBusinessPartnerProvider({
    query,
    section: "banking",
    data: {
      accounts: [
        {
          linkId: "bank",
          maskedAccount: "123456789012",
          protectedValueToken: "never",
          rawAccount: "never",
        },
      ],
    },
    authorizer: { authorize: async () => ({ allowed: true }) },
  });
  expect(result).toEqual({
    accounts: [{ linkId: "bank", maskedAccount: "••••9012" }],
  });
});
it("tax rows require tax permission independently from identifier permission", async () => {
  const authorizer = {
    authorize: vi.fn(async (request: any) =>
      request.permissionCode.includes("_tax.")
        ? { allowed: false as const, reason: "denied" }
        : { allowed: true as const },
    ),
  };
  const result = await projectBusinessPartnerProvider({
    query,
    section: "identifiers-tax",
    data: { items: [{ kind: "tax", id: "tax-id", maskedValue: "123456789" }] },
    authorizer,
  });
  expect(result).toEqual({ items: [] });
  expect(
    authorizer.authorize.mock.calls.every(([r]) =>
      r.permissionCode.includes("_tax."),
    ),
  ).toBe(true);
});
it("masks identifier values and excludes raw values and protected tokens from the provider projection", async () => {
  const result = await projectBusinessPartnerProvider({
    query, section: "identifiers-tax",
    data: {items: [{kind:"identifier",id:"identifier-id",maskedValue:"123456789",identifier_value:"123456789",registration_number:"123456789",protectedValueToken:"opaque-token",metadata:{protected:true}}]},
    authorizer: {authorize: async () => ({allowed:true})},
  });
  expect(result).toEqual({items:[{kind:"identifier",id:"identifier-id",maskedValue:"••••6789"}]});
  const denied = await projectBusinessPartnerProvider({
    query, section:"identifiers-tax", data:{items:[{kind:"identifier",id:"identifier-id",maskedValue:"123456789"}]},
    authorizer:{authorize:async()=>({allowed:false,reason:"denied"})},
  });
  expect(denied).toEqual({items:[]});
});
it("does not reuse a decision from another nested field", async () => {
  const result = await projectBusinessPartnerProvider({
    query,
    section: "contacts",
    data: { items: [{ id: "allowed", displayName: "hidden" }] },
    authorizer: {
      authorize: async (r) =>
        r.resource?.["providerFieldPath"] === "items.*.displayName"
          ? { allowed: false, reason: "denied" }
          : { allowed: true },
    },
  });
  expect(result).toEqual({ items: [{ id: "allowed" }] });
});
it("keeps nested company selections separate", async () => {
  const result = await projectBusinessPartnerProvider({
    query,
    section: "banking",
    data: {
      accounts: [
        { linkId: "a", companyCodeId: "allowed" },
        { linkId: "b", companyCodeId: "denied" },
      ],
    },
    authorizer: {
      authorize: async (r) =>
        r.resource?.["companyCodeId"] === "allowed"
          ? { allowed: true }
          : { allowed: false, reason: "denied" },
    },
  });
  expect(result).toEqual({
    accounts: [{ linkId: "a", companyCodeId: "allowed" }],
  });
});
it("closes unknown providers and authorization outages", async () => {
  await expect(
    projectBusinessPartnerProvider({
      query,
      section: "unknown",
      data: { anything: "secret" },
      authorizer: { authorize: async () => ({ allowed: true }) },
    }),
  ).rejects.toMatchObject({ code: "BP_PROVIDER_POLICY_UNAVAILABLE" });
  await expect(
    projectBusinessPartnerProvider({
      query,
      section: "contacts",
      data: { items: [{ id: "contact" }] },
      authorizer: {
        authorize: async () => ({
          allowed: false,
          reason: "entity_authorization_unavailable",
        }),
      },
    }),
  ).rejects.toMatchObject({ code: "BP_PROVIDER_AUTHORIZATION_UNAVAILABLE" });
});

it("declares every BP section and keeps independent attachment admission separate", async () => {
  const { BUSINESS_PARTNER_360_SECTION_CODES } =
    await import("@athyper/server-contract-master-data");
  const { businessPartnerProviderPolicies } =
    await import("../business-partner/record/projection-policy");
  expect(Object.keys(businessPartnerProviderPolicies).sort()).toEqual(
    [...BUSINESS_PARTNER_360_SECTION_CODES].sort(),
  );
  const resources: unknown[] = [];
  const result = await projectBusinessPartnerProvider({
    query,
    section: "attachments",
    data: { items: [{ id: "file", fileName: "secret.txt" }] },
    authorizer: {
      authorize: async (request) => {
        resources.push(request.resource);
        return request.resource?.["resourceCode"] === "document.attachment"
          ? { allowed: false, reason: "denied" }
          : { allowed: true };
      },
    },
  });
  expect(result).toEqual({ items: [] });
  expect(resources).toEqual([
    {
      tenantId: "tenant",
      resourceId: "file",
      resourceCode: "document.attachment",
      recordId: "file",
    },
  ]);
});

it("omits deferred summary fields while keeping allowed contact fields", async () => {
  const { businessPartnerSummaryFieldPolicy } =
    await import("../business-partner/record/projection-policy");
  const result = await projectBusinessPartnerProvider({
    query,
    section: "summary",
    policy: businessPartnerSummaryFieldPolicy,
    data: {
      primaryContact: {
        id: "contact",
        displayName: "Visible name",
        email: "hidden@example.test",
        phone: "hidden",
      },
    },
    authorizer: {
      authorize: async (request) =>
        request.resource?.["providerOperationKey"] === "contact_sensitive_read"
          ? { allowed: false, reason: "entity_authorization_deferred" }
          : { allowed: true },
    },
  });
  expect(result).toEqual({
    primaryContact: { id: "contact", displayName: "Visible name" },
  });
});

it.each(["comments", "attachments"])(
  "does not report an independent %s authorization outage as an empty provider",
  async (section) => {
    const authorize = vi.fn(async () => ({
      allowed: false as const,
      reason: "entity_authorization_unavailable" as const,
    }));
    await expect(
      projectBusinessPartnerProvider({
        query,
        section,
        data: {
          items: [
            {
              id: "independent-child",
              fileName: "private.pdf",
              body: "Private comment",
            },
          ],
        },
        authorizer: { authorize },
      }),
    ).rejects.toMatchObject({ code: "BP_PROVIDER_AUTHORIZATION_UNAVAILABLE" });
    expect(authorize).toHaveBeenCalledTimes(1);
  },
);

it.each(["comments", "attachments"])(
  "checks each populated %s child independently even when parent fields are allowed",
  async (section) => {
    const decisions: string[] = [];
    const result = await projectBusinessPartnerProvider({
      query,
      section,
      data: {
        items: [
          {
            id: "allowed-child",
            fileName: "visible.pdf",
            body: "Visible comment",
          },
          {
            id: "denied-child",
            fileName: "private.pdf",
            body: "Private comment",
          },
        ],
      },
      authorizer: {
        authorize: async (request) => {
          if (request.resource?.["resourceCode"]) {
            const id = String(request.resource["recordId"]);
            decisions.push(id);
            return id === "allowed-child"
              ? { allowed: true }
              : { allowed: false, reason: "denied" };
          }
          return { allowed: true };
        },
      },
    });
    expect(decisions).toEqual(["allowed-child", "denied-child"]);
    expect(result).toMatchObject({ items: [{ id: "allowed-child" }] });
    expect(JSON.stringify(result)).not.toMatch(
      /denied-child|private\.pdf|Private comment/,
    );
  },
);
