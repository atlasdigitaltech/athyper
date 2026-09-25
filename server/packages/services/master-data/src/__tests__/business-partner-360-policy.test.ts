import { describe, expect, it } from "vitest";
import { evaluateBusinessPartner360Policy } from "../business-partner/record/access-policy";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";
import type { Authorizer } from "@athyper/server-contract-auth";
const input = {
  context: {} as never,
  businessPartnerId: "partner",
  category: "organization" as const,
  roles: ["supplier"] as const,
  roleLens: "all" as const,
  scoped: false,
  counts: {},
  directoryAdmitted: true,
  directoryScopeResources: [{operatingOrganizationId:"admitted-org"}],
};
const authorizer = (denied?: string): Authorizer => ({
  async authorize(query) {
    if (query.permissionCode === denied)
      return { allowed: false, reason: "denied_by_grant" };
    if (query.resource?.operatingOrganizationId !== "admitted-org")
      return { allowed: false, reason: "scope_not_contained" };
    return { allowed: true };
  },
});
it("never replaces record scopes with a permission-only authorization",async()=>{
 const calls: Parameters<Authorizer["authorize"]>[0][]=[];
 const check:Authorizer={async authorize(query){calls.push(query);return query.resource ? {allowed:false,reason:"scope_not_contained"} : {allowed:true};}};
 expect((await evaluateBusinessPartner360Policy(check,input)).sections).toEqual([]);
 expect(calls.every(call=>Boolean(call.resource))).toBe(true);
 expect((await evaluateBusinessPartner360Policy(authorizer(),{...input,directoryScopeResources:[]})).sections).toEqual([]);
});
describe("metadata-admitted section navigation", () => {
  it("admits partner-fact sections without commercial roles or company context while retaining permission gates", async () => {
    const facts = ["overview","identity","contacts","addresses","identifiers-tax","banking","qualifications-certificates","network"];
    for (const roleLens of ["all","supplier","customer"] as const) {
      const core = {...input,roles:[],roleLens,scoped:false};
      const allowed = await evaluateBusinessPartner360Policy({authorize:async()=>({allowed:true})},core);
      for(const code of facts) expect(allowed.sections.find(section=>section.code===code)).toMatchObject({authorization:"granted"});
      for(const code of ["supplier-company","customer-company","credit","business-activity"])
        expect(allowed.sections.some(section=>section.code===code)).toBe(false);
      const denied = await evaluateBusinessPartner360Policy({authorize:async()=>({allowed:false,reason:"denied_by_grant"})},core);
      expect(denied.sections).toEqual([]);
      expect(allowed.granted.has(P.network)).toBe(true);
    }
  });
  it("uses only the scoped Network capability and preserves denial", async () => {
    expect(P.network).toBe("neon.relationship.bp_target.network_read");
    const calls: Parameters<Authorizer["authorize"]>[0][] = [];
    const scoped = { ...input, scoped: true, operatingOrganizationId: "org", companyCodeId: "company" };
    const check: Authorizer = { async authorize(query) {
      calls.push(query);
      return { allowed: query.permissionCode === P.network &&
        query.resource?.["operatingOrganizationId"] === "org" &&
        query.resource?.["companyCodeId"] === "company" };
    } };
    const result = await evaluateBusinessPartner360Policy(check, scoped);
    expect(result.sections.some(section => section.code === "network")).toBe(true);
    expect(calls.find(call => call.permissionCode === P.network)?.resource).toMatchObject({
      entityCode: "business_partner", operationKey: "network_read",
      businessPartnerId: "partner", operatingOrganizationId: "org", companyCodeId: "company",
    });
    for (const variant of [{ ...scoped, companyCodeId: "other" }, input]) {
      const denied = await evaluateBusinessPartner360Policy(check, variant);
      expect(denied.sections.some(section => section.code === "network")).toBe(false);
    }
    const legacyOnly = await evaluateBusinessPartner360Policy({ async authorize(query) {
      return { allowed: query.permissionCode === "neon.relationship.business_partner_network.read" };
    } }, scoped);
    expect(legacyOnly.sections.some(section => section.code === "network")).toBe(false);
    expect(calls.some(call => call.permissionCode === "neon.relationship.business_partner_network.read")).toBe(false);
  });
  it("shows granted global tabs and requires context for scoped tabs", async () => {
    const result = await evaluateBusinessPartner360Policy(authorizer(), input);
    for (const key of [
      "overview",
      "identity",
      "contacts",
      "addresses",
      "identifiers-tax",
      "governance",
      "roles-scope",
      "requests",
      "activity",
    ])
      expect(
        result.sections.find((section) => section.code === key),
      ).toMatchObject({ authorization: "granted" });
    expect(
      result.sections.find((section) => section.code === "banking"),
    ).not.toHaveProperty("reasonCode");
    expect(
      result.sections.some((section) => section.code === "customer-company"),
    ).toBe(false);
    expect(result.granted.has(P.bankMasked)).toBe(true);
  });
  it("preserves section and field denials", async () => {
    const result = await evaluateBusinessPartner360Policy(
      authorizer(P.taxMasked),
      input,
    );
    expect(result.granted.has(P.taxMasked)).toBe(false);
    const contacts = await evaluateBusinessPartner360Policy(
      authorizer(P.contact),
      input,
    );
    expect(
      contacts.sections.some((section) => section.code === "contacts"),
    ).toBe(false);
  });
  it("does not relax unadmitted records or explicit transaction scopes", async () => {
    expect(
      (
        await evaluateBusinessPartner360Policy(authorizer(), {
          ...input,
          directoryAdmitted: false,
        })
      ).sections,
    ).toEqual([]);
    expect(
      (
        await evaluateBusinessPartner360Policy(authorizer(), {
          ...input,
          scoped: true,
          operatingOrganizationId: "other",
        })
      ).sections,
    ).toEqual([]);
  });
});

it("keeps banking discoverable across roles and certificates available without company context", async () => {
  const result = await evaluateBusinessPartner360Policy(authorizer(), {
    ...input,
    roles: [],
  });
  expect(
    result.sections.find((section) => section.code === "banking"),
  ).not.toHaveProperty("reasonCode");
  expect(
    result.sections.find(
      (section) => section.code === "qualifications-certificates",
    ),
  ).not.toHaveProperty("reasonCode");
  expect(result.granted.has(P.bankMasked)).toBe(true);
});
it("supports certificate-only readers without granting qualification or attachment access", async () => {
  const result = await evaluateBusinessPartner360Policy(
    {
      async authorize(query) {
        return [P.record, P.certificate].includes(query.permissionCode as never)
          ? { allowed: true }
          : { allowed: false, reason: "denied_by_grant" };
      },
    },
    input,
  );
  expect(
    result.sections.some(
      (section) => section.code === "qualifications-certificates",
    ),
  ).toBe(true);
  expect(result.granted.has(P.qualification)).toBe(false);
  expect(result.granted.has(P.attachment)).toBe(false);
});
it("gates document and discussion tabs by their own permissions without fabricated counts", async () => {
  const result = await evaluateBusinessPartner360Policy(authorizer(), input);
  expect(
    result.sections.find((section) => section.code === "comments"),
  ).not.toHaveProperty("count");
  expect(
    result.sections.find((section) => section.code === "attachments"),
  ).not.toHaveProperty("count");
  expect(
    (
      await evaluateBusinessPartner360Policy(authorizer(P.comment), input)
    ).sections.some((section) => section.code === "comments"),
  ).toBe(false);
  expect(
    (
      await evaluateBusinessPartner360Policy(authorizer(P.attachment), input)
    ).sections.some((section) => section.code === "attachments"),
  ).toBe(false);
});

it("preserves omitted independent-case counts instead of fabricating empty sections", async () => {
  const restricted = await evaluateBusinessPartner360Policy(
    authorizer(),
    input,
  );
  for (const code of ["requests", "activity"]) {
    const section = restricted.sections.find((s) => s.code === code);
    expect(section).not.toHaveProperty("count");
    expect(section?.state).toBe("ready");
  }
  const populated = await evaluateBusinessPartner360Policy(authorizer(), {
    ...input,
    counts: { requests: 2, activity: 1 },
  });
  expect(populated.sections.find((s) => s.code === "requests")).toMatchObject({
    count: 2,
    state: "ready",
  });
  const empty = await evaluateBusinessPartner360Policy(authorizer(), {
    ...input,
    counts: { requests: 0, activity: 0 },
  });
  expect(empty.sections.find((s) => s.code === "requests")).toMatchObject({
    count: 0,
    state: "empty",
  });
});
