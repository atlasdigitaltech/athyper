import { describe, it, expect, vi } from "vitest";
import { evaluateBusinessPartner360Policy } from "../business-partner/record/access-policy";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";
const input = {
  context: {
    tenantId: "tenant",
    planeKey: "neon",
    assurance: "elevated",
  } as never,
  businessPartnerId: "bp",
  operatingOrganizationId: "org",
  companyCodeId: "company",
  category: "organization" as const,
  roles: ["supplier", "customer"] as const,
  roleLens: "all" as const,
  scoped: true,
  counts: {},
};
describe("reveal affordance authorization", () => {
  it.each(["mfa_required", "missing_permission", "scope_denied"])("offers verification only for authorized step-up denial: %s", async (reason) => {
    const authorize = vi.fn(async (r: any) => [P.identifierReveal, P.taxReveal, P.bankReveal].includes(r.permissionCode)
      ? {allowed:false, reason} : {allowed:true});
    const result = await evaluateBusinessPartner360Policy({authorize} as never, {...input, context:{...(input.context as object), assurance:"baseline"} as never});
    expect(result.granted.has(P.identifierReveal)).toBe(false);
    expect(result.verificationRequired.has(P.identifierReveal)).toBe(reason === "mfa_required");
    expect(result.verificationRequired.has(P.taxReveal)).toBe(reason === "mfa_required");
  });
  it("runs the owning reveal preflight with selected context, without executing a reveal", async () => {
    const authorize = vi.fn(async (r: any) => ({
      allowed:
        ![P.bankReveal, P.taxReveal].includes(r.permissionCode) ||
        !r.resource?.sectionCode,
    }));
    const r = await evaluateBusinessPartner360Policy(
      { authorize } as never,
      input,
    );
    for (const permission of [P.bankReveal, P.taxReveal]) {
      expect(r.granted.has(permission)).toBe(true);
      expect(
        authorize.mock.calls.some(
          ([r]) =>
            r.permissionCode === permission &&
            r.resource?.companyCodeId === "company" &&
            !r.resource?.sectionCode,
        ),
      ).toBe(true);
    }
  });
  it("never infers reveal permission from parent or masked read permission", async () => {
    const authorize = vi.fn(async (r: any) => ({
      allowed: ![P.bankReveal, P.taxReveal].includes(r.permissionCode),
    }));
    const r = await evaluateBusinessPartner360Policy(
      { authorize } as never,
      input,
    );
    expect(r.granted.has(P.bankReveal)).toBe(false);
    expect(r.granted.has(P.taxReveal)).toBe(false);
  });
  it.each(["baseline", "historical"])(
    "hides reveals for %s views",
    async (mode) => {
      const authorize = vi.fn(async () => ({ allowed: true }));
      const r = await evaluateBusinessPartner360Policy({ authorize } as never, {
        ...input,
        ...(mode === "historical"
          ? { historical: true }
          : {
              context: {
                ...(input.context as object),
                assurance: "baseline",
              } as never,
            }),
      });
      expect(r.granted.has(P.bankReveal)).toBe(false);
      expect(r.granted.has(P.taxReveal)).toBe(false);
    },
  );
});

it("derives tax affordances from authorization even when a stored tax value is not tokenized", async () => {
  const { createBusinessPartner360Service } =
    await import("../business-partner/record/service");
  let revealAllowed = true;
  const service = createBusinessPartner360Service({
    authorizer: {
      authorize: async (r: any) => ({
        allowed: ![P.taxReveal, P.identifierReveal].includes(r.permissionCode) || revealAllowed,
      }),
    },
    repository: {
      resolveCore: async () => ({
        id: "bp",
        code: "BP",
        category: "organization",
        displayName: "Synthetic",
        status: "active",
        version: 1,
        businessDate: "2026-09-12",
        roles: [{ id: "r", code: "customer", status: "active" }],
        scopeValid: true,
        scopeResolved: true,
      }),
      readCommonSection: async () => ({
        items: [
          { id: "tax", kind: "tax", maskedValue: "••••", revealable: false },
          { id: "identifier", kind: "identifier", maskedValue: "••••", revealable: true },
        ],
        provenance: [],
        redactions: [],
      }),
    },
    transactions: { run: async (_p: any, _a: any, work: any) => work({}) },
    definitions: {
      resolve: async () => ({ code: "bp", version: "1", hash: "a".repeat(64) }),
    },
    now: () => new Date("2026-09-12T07:00:00Z"),
  } as never);
  const query = {
    context: input.context,
    businessPartnerId: "bp",
    operatingOrganizationId: "org",
    companyCodeId: "company",
    sectionCode: "identifiers-tax" as const,
  };
  expect((await service.section(query)).data).toMatchObject({
    items: [{ maskedValue: "••••", revealable: true }, {kind:"identifier",revealable:true}],
  });
  revealAllowed = false;
  expect((await service.section(query)).data).toMatchObject({
    items: [{ revealable: false }, {kind:"identifier",revealable:false}],
  });
  revealAllowed = true;
  expect(
    (await service.section({ ...query, asOf: "2026-09-11" })).data,
  ).toMatchObject({ items: [{ revealable: false }, {kind:"identifier",revealable:false}] });
});
