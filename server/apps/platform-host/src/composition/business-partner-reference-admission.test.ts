import { expect, it, vi } from "vitest";
import { admitBusinessPartnerProfileReferences } from "./business-partner-reference-admission.js";
it("rejects unregistered identifier schemes before approval without exposing values", async () => {
 const lookup=vi.fn(async()=>false);
 await expect(admitBusinessPartnerProfileReferences({identifiers:[{
  clientItemKey:"id",definitionFieldCode:"identifier",schemeCode:"synthetic_test",
  value:"NEVER-EXPOSE",valueHash:"a".repeat(64),maskedValue:"****",
 }]},lookup)).rejects.toMatchObject({status:422,code:"BUSINESS_PARTNER_PROFILE_REFERENCE_INVALID",message:"Unknown or inactive reference at identifiers[0].schemeCode"});
 expect(lookup).toHaveBeenCalledWith("master.business_partner_identifier_scheme","synthetic_test");
});
it("uses canonical relationship domains and permits only active references", async () => {
 const lookup=vi.fn(async()=>true);
 await admitBusinessPartnerProfileReferences({relationships:[{clientItemKey:"r",definitionFieldCode:"relationships",relationshipTypeCode:"affiliate"}]},lookup);
 expect(lookup).toHaveBeenCalledWith("master.business_partner_relationship_type","affiliate");
});
it("leaves incomplete draft shape validation to its owner",async()=>{
 const lookup=vi.fn(async()=>false);
 await admitBusinessPartnerProfileReferences({aliases:[{clientItemKey:"a",definitionFieldCode:"aliases"}]},lookup);
 expect(lookup).not.toHaveBeenCalled();
});
