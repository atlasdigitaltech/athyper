import { beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyBusinessPartnerEligibilityRepository } from "../kysely-business-partner-eligibility-repository.js";

// Supply database rows only; run the production readiness resolver unchanged.
const database = vi.hoisted(() => ({
  status: "suspended",
  credit: true,
  blocked: false,
}));
vi.mock("kysely", () => ({
  sql: Object.assign(
    (parts: TemplateStringsArray) => ({
      async execute() {
        const query = parts.join("?");
        if (query.includes("SELECT bp.status"))
          return {
            rows: [
              {
                status: "active",
                role_id: "customer",
                role_status: database.status,
                assignment_id: "assignment",
                assignment_status: "active",
                company_compatible: true,
                profile_id: "profile",
                profile_status: "active",
                payment_term_id: "terms",
                bank_link_id: null,
              },
            ],
          };
        if (query.includes("FROM control.business_partner_qualification"))
          return { rows: [] };
        if (query.includes("FROM control.business_partner_block"))
          return { rows: database.blocked ? [{ id: "block" }] : [] };
        if (query.includes("FROM master.party_risk_assessment"))
          return {
            rows: [
              {
                id: "risk",
                status: "approved",
                risk_band: "low",
                overall_score: 1,
                next_review_at: "2027-01-01",
                version: 1,
              },
            ],
          };
        if (query.includes("FROM control.customer_credit_review"))
          return {
            rows: database.credit
              ? [
                  {
                    id: "credit",
                    decision: "approved",
                    effective_from: "2026-01-01",
                    effective_until: null,
                  },
                ]
              : [],
          };
        throw new Error(`Unexpected readiness query: ${query}`);
      },
    }),
    { raw: (value: string) => value },
  ),
}));

const repository = new KyselyBusinessPartnerEligibilityRepository();
const resolve = (operationCode: string) =>
  repository.resolve(
    {
      tenantId: "tenant",
      businessPartnerId: "partner",
      role: "customer",
      operatingOrganizationId: "organization",
      companyCodeId: "company",
      businessDate: "2026-09-05",
      operationCode,
    },
    {},
  );

beforeEach(() => {
  database.status = "suspended";
  database.credit = true;
  database.blocked = false;
});
describe("Customer reactivation readiness", () => {
  it("allows suspended Customer activation readiness while keeping orders blocked", async () => {
    expect(await resolve("activation")).toMatchObject({
      eligible: true,
      reasons: [],
    });
    expect(await resolve("order")).toMatchObject({
      eligible: false,
      reasons: [{ code: "ROLE_INACTIVE" }],
    });
  });
  it.each(["inactive", "archived"])(
    "does not reopen a %s Customer through readiness",
    async (status) => {
      database.status = status;
      expect(await resolve("activation")).toMatchObject({
        eligible: false,
        reasons: [{ code: "ROLE_INACTIVE" }],
      });
    },
  );
  it("still requires approved credit and absence of an activation block", async () => {
    database.credit = false;
    database.blocked = true;
    const result = await resolve("activation");
    expect(result?.eligible).toBe(false);
    expect(result?.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "CREDIT_REVIEW_MISSING",
        "BLOCKED_FOR_OPERATION",
      ]),
    );
  });
});
