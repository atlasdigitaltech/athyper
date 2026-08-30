import { describe, expect, it } from "vitest";
import {
  assertBusinessPartner360Phase1Contract,
  BUSINESS_PARTNER_360_PERMISSIONS,
  BUSINESS_PARTNER_360_SCHEMA_VERSION,
  BUSINESS_PARTNER_360_SECTION_CODES,
  BUSINESS_PARTNER_360_SECTION_DEFINITIONS,
  type BusinessPartner360PartyCategory,
  type BusinessPartner360SectionCode,
} from "./business-partner-360.js";

interface AcceptanceFixture {
  readonly code: string;
  readonly category: BusinessPartner360PartyCategory;
  readonly roles: readonly ("supplier" | "customer" | "workforce")[];
  readonly meshLinked?: boolean;
  readonly expected: readonly BusinessPartner360SectionCode[];
}

const common = ["overview", "identity", "contacts", "addresses", "identifiers-tax", "roles-scope", "requests", "activity"] as const;
const fixtures: readonly AcceptanceFixture[] = [
  { code: "organization", category: "organization", roles: [], expected: common },
  { code: "supplier", category: "organization", roles: ["supplier"], expected: [...common, "supplier-company", "banking", "qualifications-certificates", "business-activity"] },
  { code: "customer", category: "organization", roles: ["customer"], expected: [...common, "customer-company", "credit", "business-activity"] },
  { code: "dual-role", category: "organization", roles: ["supplier", "customer"], expected: [...common, "supplier-company", "customer-company", "banking", "qualifications-certificates", "credit", "business-activity"] },
  { code: "person", category: "person", roles: [], expected: [...common, "workforce"] },
  { code: "workforce", category: "person", roles: ["workforce"], expected: [...common, "workforce"] },
  { code: "external-worker", category: "person", roles: ["workforce"], expected: [...common, "workforce"] },
  { code: "mesh-linked", category: "organization", roles: ["supplier"], meshLinked: true, expected: [...common, "supplier-company", "banking", "qualifications-certificates", "business-activity", "network"] },
];

describe("Business Partner 360 Phase 1 contract lock", () => {
  it("locks unique section codes, bounded routes and four-part permission catalog codes", () => {
    expect(BUSINESS_PARTNER_360_SCHEMA_VERSION).toBe(1);
    expect(BUSINESS_PARTNER_360_SECTION_DEFINITIONS.map(section => section.code)).toEqual(BUSINESS_PARTNER_360_SECTION_CODES);
    expect(new Set(BUSINESS_PARTNER_360_SECTION_CODES).size).toBe(BUSINESS_PARTNER_360_SECTION_CODES.length);
    for (const section of BUSINESS_PARTNER_360_SECTION_DEFINITIONS) {
      expect(section.routes.every(path => path.startsWith("/api/neon/business-partners/:id/360/"))).toBe(true);
      expect(section.permission.split(".")).toHaveLength(4);
      expect(section.fieldPermissions.every(permission => permission.split(".").length === 4)).toBe(true);
      expect(section.discoverableWhenDenied).toBe(false);
    }
    expect(Object.values(BUSINESS_PARTNER_360_PERMISSIONS).every(permission => permission.split(".").length === 4)).toBe(true);
  });

  it.each(fixtures)("resolves the $code acceptance fixture", fixture => {
    expect(applicableSections(fixture)).toEqual(new Set(fixture.expected));
  });

  it("rejects every prohibited Phase 1 risk family at any nesting depth", () => {
    for (const key of ["risk", "riskAssessment", "risk_score", "overallRiskScore", "riskBand", "riskIncidentCount", "riskTrend", "riskExposure"]) {
      expect(() => assertBusinessPartner360Phase1Contract({ schemaVersion: 1, data: { [key]: "forbidden" } })).toThrowError(/BP_360_PHASE1_RISK_FIELD_FORBIDDEN/);
    }
    expect(() => assertBusinessPartner360Phase1Contract({ schemaVersion: 1, data: { creditReview: { decision: "approved" } } })).not.toThrow();
  });
});

function applicableSections(fixture: AcceptanceFixture): Set<BusinessPartner360SectionCode> {
  return new Set(BusinessPartner360SectionCodeList(fixture));
}

function BusinessPartner360SectionCodeList(fixture: AcceptanceFixture): BusinessPartner360SectionCode[] {
  return BUSINESS_PARTNER_360_SECTION_DEFINITIONS.filter(section => {
    if (!section.categories.includes(fixture.category)) return false;
    if (section.code === "network") return Boolean(fixture.meshLinked) && section.roles.some(role => fixture.roles.includes(role));
    return section.global || section.roles.some(role => fixture.roles.includes(role));
  }).map(section => section.code);
}
