import { describe, expect, it } from "vitest";
import { adaptLegacyOrganizationIdentity, applyPartnerIdentityPatch, parsePartnerIdentityCreate } from "../business-partner/identity/contract";

const today = "2026-09-24";
const input = () => ({ partnerCategory: "organization", organizationIdentity: { legalName: " Aster Research Ltd " } });
describe("partner identity contract", () => {
  it("defaults display name only at creation and freezes normalized identity", () => {
    const value = parsePartnerIdentityCreate(input(), today);
    expect(value.displayName).toBe("Aster Research Ltd");
    expect(Object.isFrozen(value.organizationIdentity)).toBe(true);
    expect(value).not.toHaveProperty("partnerRole");
  });
  it("does not change a display label when legal name changes", () => {
    const value = parsePartnerIdentityCreate({ ...input(), displayName: "Aster" }, today);
    const changed = applyPartnerIdentityPatch(value, { organizationIdentity: { legalName: "Aster New Ltd" } }, today);
    expect(changed.displayName).toBe("Aster");
    expect(changed.organizationIdentity.legalName).toBe("Aster New Ltd");
    expect(value.organizationIdentity.legalName).toBe("Aster Research Ltd");
  });
  it("keeps person enablement closed without a client-controlled bypass", () => {
    expect(() => parsePartnerIdentityCreate({ partnerCategory: "person", personId: "x", personEnabled: true }, today)).toThrow("PERSON_PARTNER_ENABLEMENT_PENDING");
  });
  it.each(["personId", "tenantId", "status", "recordVersion", "canonicalPartyId", "metadata", "supplier", "companyCodeId"])("rejects foreign/managed field %s", key => {
    expect(() => parsePartnerIdentityCreate({ ...input(), [key]: "injected" }, today)).toThrow("IDENTITY_INVALID");
  });
  it.each(["partnerCategory", "personId", "ownershipClass", "recordVersion"])("rejects patch of immutable/managed %s", key => {
    expect(() => applyPartnerIdentityPatch(parsePartnerIdentityCreate(input(), today), { [key]: "changed" }, today)).toThrow("IDENTITY_INVALID");
  });
  it("distinguishes absent values and explicit nullable clearing", () => {
    const current = parsePartnerIdentityCreate({ ...input(), description: "Keep", websiteUrl: "https://example.test" }, today);
    expect(applyPartnerIdentityPatch(current, {}, today).description).toBe("Keep");
    expect(applyPartnerIdentityPatch(current, { description: null }, today).description).toBeNull();
    expect(() => applyPartnerIdentityPatch(current, { displayName: null }, today)).toThrow();
    expect(() => applyPartnerIdentityPatch(current, { organizationIdentity: null }, today)).toThrow();
    expect(() => applyPartnerIdentityPatch(current, { organizationIdentity: { legalName: null } }, today)).toThrow();
  });
  it.each([
    { registrationCountryCode: "my" }, { incorporationDate: "2025-02-29" },
    { employeeCount: 10 }, { employeeCount: -1 }, { foundedYear: 2027 },
    { legalFormValueId: "not-a-uuid" }, { unknown: "field" },
    { employeeCount: 1, employeeCountAsOf: "2026-09-25", employeeCountScope: "organization" },
    { employeeCount: 2147483648, employeeCountAsOf: today, employeeCountScope: "organization" },
  ])("rejects invalid organization values %j", fields => {
    expect(() => parsePartnerIdentityCreate({ ...input(), organizationIdentity: { legalName: "Aster", ...fields } }, today)).toThrow("IDENTITY_INVALID");
  });
  it("requires a complete tuple when patching headcount", () => {
    const current = parsePartnerIdentityCreate({ ...input(), organizationIdentity: { legalName: "Aster", employeeCount: 0, employeeCountAsOf: today, employeeCountScope: "organization" } }, today);
    expect(applyPartnerIdentityPatch(current, { organizationIdentity: { employeeCount: 8 } }, today).organizationIdentity.employeeCount).toBe(8);
    expect(() => applyPartnerIdentityPatch(current, { organizationIdentity: { employeeCount: null } }, today)).toThrow();
    expect(applyPartnerIdentityPatch(current, { organizationIdentity: { employeeCount: null, employeeCountAsOf: null, employeeCountScope: null } }, today).organizationIdentity.employeeCount).toBeNull();
  });
  it.each(["http://example.test", "https://user@example.test", "https://example.test/a b"])("rejects invalid website %s", websiteUrl => {
    expect(() => parsePartnerIdentityCreate({ ...input(), websiteUrl }, today)).toThrow();
  });
  it("adapts only explicitly extracted legacy identity and preserves source payload", () => {
    const old = { name: "Legacy Ltd", legalForm: "private_limited", incorporationDate: "2000-02-29" };
    const id = "12345678-1234-1234-1234-123456789abc";
    const value = adaptLegacyOrganizationIdentity(old, id, today);
    expect(value.displayName).toBe(old.name);
    expect(value.organizationIdentity.legalName).toBe(old.name);
    expect(value.organizationIdentity.legalFormValueId).toBe(id);
    expect(old.legalForm).toBe("private_limited");
    expect(() => adaptLegacyOrganizationIdentity(old, null, today)).toThrow("legalFormResolution");
    expect(() => adaptLegacyOrganizationIdentity({ name: "Legacy" }, id, today)).toThrow("legalFormResolution");
  });
});
