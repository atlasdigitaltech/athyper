import { expect, it, vi } from "vitest";
import type { BusinessPartner360Query } from "@athyper/server-contract-master-data";
import { projectBusinessPartnerProvider } from "../business-partner-provider-projection.js";
const query = {
  context: { tenantId: "tenant", principalId: "principal", planeKey: "neon" },
  businessPartnerId: "partner",
} as BusinessPartner360Query;
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

it("declares every BP section and keeps independent attachment admission separate",async()=>{
 const {BUSINESS_PARTNER_360_SECTION_CODES}=await import("@athyper/server-contract-master-data");
 const {businessPartnerProviderPolicies}=await import("../business-partner-provider-projection.js");
 expect(Object.keys(businessPartnerProviderPolicies).sort()).toEqual([...BUSINESS_PARTNER_360_SECTION_CODES].sort());
 const resources:unknown[]=[];
 const result=await projectBusinessPartnerProvider({query,section:"attachments",data:{items:[{id:"file",fileName:"secret.txt"}]},authorizer:{authorize:async request=>{resources.push(request.resource);return request.resource?.["resourceCode"]==="document.attachment"?{allowed:false,reason:"denied"}:{allowed:true};}}});
 expect(result).toEqual({items:[]});expect(resources).toEqual([{tenantId:"tenant",entityCode:"document.attachment",resourceCode:"document.attachment",recordId:"file"}]);
});
