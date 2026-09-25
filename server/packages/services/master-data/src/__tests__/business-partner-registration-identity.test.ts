import { describe, expect, it, vi } from "vitest";
import { validateLegacyRegistrationIdentity, validateRegistrationIdentity } from "../business-partner-registration-identity.js";
const id = "12345678-1234-1234-1234-123456789abc";
describe("registration identity writer adapter", () => {
  it("accepts an explicit person link without resolving organization facts", async () => {
    const resolve = vi.fn(async () => id);
    const payload = Object.freeze({name:"Maya Example",partnerCategory:"person",personId:"12345678-1234-4234-8234-123456789abc",ownershipClass:"external",legalClassification:"sole_proprietor"});
    await validateRegistrationIdentity(payload,"2026-09-25",resolve);
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each([{legalForm:"private_limited"},{registrationCountryCode:"GB"},{incorporationDate:"2020-01-01"},{requestedRole:"supplier"},{legalClassification:"government"}])("rejects organization/commercial fields on a person %j", async extra => {
    await expect(validateRegistrationIdentity({name:"Maya Example",partnerCategory:"person",personId:"12345678-1234-4234-8234-123456789abc",ownershipClass:"external",...extra},"2026-09-25",async()=>id)).rejects.toThrow();
  });
  it("validates approved legacy identity without changing the payload", async () => {
    const payload = Object.freeze({ name: "Aster", legalForm: "private_limited", requestedRole: "supplier", businessPartnerCode: "ASTER" });
    const resolve = vi.fn(async () => id);
    await validateLegacyRegistrationIdentity(payload, "2026-09-24", resolve);
    expect(resolve).toHaveBeenCalledWith("private_limited");
    expect(payload).toEqual({ name: "Aster", legalForm: "private_limited", requestedRole: "supplier", businessPartnerCode: "ASTER" });
  });
  it("rejects unresolved legal form before the materializer", async () => {
    await expect(validateLegacyRegistrationIdentity({name:"Aster",legalForm:"unknown"}, "2026-09-24", async () => null)).rejects.toThrow("legalFormResolution");
  });
  it("does not require a role, organization, company or legal form", async () => {
    const resolve = vi.fn(async () => id);
    await validateLegacyRegistrationIdentity({name:"Aster"}, "2026-09-24", resolve);
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each([{partnerCategory:"person"},{personId:id},{organizationIdentity:{legalName:"Aster"}},{displayName:"Other"}])("rejects unsupported identity input %j", async extra => {
    await expect(validateLegacyRegistrationIdentity({name:"Aster",...extra}, "2026-09-24", async () => id)).rejects.toThrow();
  });
});
