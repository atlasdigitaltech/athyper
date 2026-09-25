import {describe,expect,it} from "vitest";
import {parsePersonPartnerIdentityCreate,parsePartnerIdentityCreate} from "../business-partner/identity/contract";
const base={partnerCategory:"person",personId:"12345678-1234-1234-1234-123456789abc",displayName:" Maya Example "};
const today="2026-09-24";
describe("person partner identity boundary",()=>{
  it("accepts only a reference and common facts, without copying person names",()=>{
    const result=parsePersonPartnerIdentityCreate(base,today);
    expect(result.displayName).toBe("Maya Example");
    expect(result.personId).toBe(base.personId);
    expect(result).not.toHaveProperty("organizationIdentity");
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([{personId:null},{personId:""},{partnerCategory:"organization"},{legalClassification:"government"},{legalClassification:"nonprofit"},{organizationIdentity:{}},{firstName:"Maya"},{tenantId:"other"},{status:"active"},{personEnabled:true}])("rejects invalid or managed input %j",patch=>{
    expect(()=>parsePersonPartnerIdentityCreate({...base,...patch},today)).toThrow("IDENTITY_INVALID");
  });
  it("permits sole proprietor only for a person",()=>{
    expect(parsePersonPartnerIdentityCreate({...base,legalClassification:"sole_proprietor"},today).legalClassification).toBe("sole_proprietor");
    expect(()=>parsePartnerIdentityCreate({partnerCategory:"organization",organizationIdentity:{legalName:"Example"},legalClassification:"sole_proprietor"},today)).toThrow("IDENTITY_INVALID");
  });
});
