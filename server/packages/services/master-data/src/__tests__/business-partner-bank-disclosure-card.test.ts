import {describe,it,expect} from "vitest";
import {receivedBankDisclosureCard as card} from "../business-partner-bank-disclosure-card.js";
const source={id:"projection",current_disclosure_id:"disclosure",current_disclosure_version:3,projection_status:"linked",received_at:"2026-09-05T10:00:00Z",payload_json:{bankAccount:{accountLast4:"4821",accountHolderName:"Northwind",currencyCode:"GBP"}}};
const assignment={company_code_id:"uk",company_name:"CirrusAtlantic UK",purpose:"settlement",is_primary:true,effective_from:"2026-09-01",accepted_at:"2026-09-06",accepted_disclosure_id:"disclosure",accepted_disclosure_version:3,verification_id:"review",verification_status:"applied"};
describe("received bank card facts",()=>{
 it("leaves missing owner verification unknown and does not invent an effective date",()=>{
  const result=card(source);expect(result.verified).toBeNull();expect(result).not.toHaveProperty("effectiveFrom");expect(result.receivedAt).toBe("2026-09-05T10:00:00.000Z");expect(result.companyUsage).toBe("No companies assigned");expect(result.acceptance).toBe("No company acceptance recorded");
 });
 it("uses the actual company assignment, accepted version, and assignment dates",()=>{
  const result=card({...source,company_assignments:[assignment]},"uk");
  expect(result.companyUsage).toBe("CirrusAtlantic UK");expect(result.acceptance).toContain("Accepted · disclosure v3");expect(result.companyAssignments[0]).toMatchObject({effectiveFrom:"2026-09-01",acceptedDisclosureVersion:3,verificationId:"review"});
 });
 it("does not infer current acceptance from an older applied review",()=>{
  const result=card({...source,company_assignments:[{...assignment,accepted_at:null,accepted_disclosure_version:null,accepted_disclosure_id:null}]});
  expect(result.acceptance).toContain("Previously applied · review required");
 });
 it.each([{current_disclosure_version:4},{current_disclosure_id:"replacement"},{projection_status:"revoked"},{payload_json:{bankAccount:{},expiresAt:"2020-01-01T00:00:00Z"}}])("requires review when accepted disclosure is no longer current",change=>expect(card({...source,...change,company_assignments:[assignment]}).acceptance).toContain("Change pending review"));
 it("keeps independent company acceptances separate",()=>{
  const result=card({...source,company_assignments:[assignment,{...assignment,company_code_id:"de",company_name:"Germany",accepted_at:null,verification_status:"pending_verification"}]});
  expect(result.acceptance).toContain("CirrusAtlantic UK: Accepted");expect(result.acceptance).toContain("Germany: Not accepted");
 });
 it("distinguishes explicit false owner evidence from omission",()=>expect(card({...source,payload_json:{bankAccount:{ownerVerified:false}}}).verified).toBe(false));
});
