import {describe,it,expect} from "vitest";
import {receivedBankDisclosureCard as card} from "../business-partner-bank-disclosure-card.js";
const source={id:"projection",current_disclosure_id:"disclosure",current_disclosure_version:3,projection_status:"linked",received_at:"2026-09-05T10:00:00Z",payload_json:{bankAccount:{accountLast4:"4821",accountHolderName:"Northwind",currencyCode:"GBP"}}};
describe("received bank facts",()=>{
 it("projects masked facts without creating local account authority",()=>{
  const result=card(source);expect(result).toMatchObject({maskedAccount:"•••• 4821",source:"MESH",primary:false,revealable:false});
  expect(result).not.toHaveProperty("effectiveFrom");expect(result.receivedAt).toBe("2026-09-05T10:00:00.000Z");
 });
 it.each([true,false,undefined])("does not materialize Mesh verification %s into Neon",ownerVerified=>{
  const result=card({...source,payload_json:{...source.payload_json,bankAccount:{...source.payload_json.bankAccount,ownerVerified}}});
  expect(result).not.toHaveProperty("verified");expect(result).not.toHaveProperty("verificationState");
 });
 it("ignores historical company acceptance payloads",()=>{
  const result=card({...source,company_assignments:[{company_code_id:"uk",accepted_at:"2026-09-06",verification_status:"applied"}]});
  expect(result).not.toHaveProperty("companyAssignments");expect(result).not.toHaveProperty("acceptance");
 });
 it.each([
  [{projection_status:"revoked"},"Disclosure revoked"],
  [{payload_json:{bankAccount:{},expiresAt:"2020-01-01T00:00:00Z"}},"Disclosure expired"],
 ])("labels unavailable disclosures without making them revealable",(change,status)=>{
  expect(card({...source,...change})).toMatchObject({disclosureStatus:status,revealable:false});
 });
});
