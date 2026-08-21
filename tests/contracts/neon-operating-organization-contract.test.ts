import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { parseNeonOperatingOrganizationCatalog } from "../../packages/platform/foundation/api-client/src/operating-organization";

const companyCodeId="20000000-0000-4000-8000-000000000001";
const payload={schemaVersion:1,revision:"sha256:"+"a".repeat(64),tenantId:"10000000-0000-4000-8000-000000000001",effectiveAt:"2026-08-18T00:00:00.000Z",organizations:[{id:"30000000-0000-4000-8000-000000000001",code:"athyper.global.procurement",displayName:"Athyper Global Procurement",domain:"procurement",path:["Athyper Group Shared Services","Athyper Global Procurement"],capabilities:["procurement"],procurementProfileConfigured:true,salesProfileConfigured:false,companyAssignments:[{companyCodeId,participationRole:"participant",effectiveFrom:"2026-01-01"}],defaults:{leadCompanyCodeId:companyCodeId,currency:"MYR"}}]};

describe("Neon operating-organization browser contract",()=>{
  it("parses and freezes authorized organization projections",()=>{const result=parseNeonOperatingOrganizationCatalog(payload);assert.equal(result.organizations[0]?.code,"athyper.global.procurement");assert.equal(Object.isFrozen(result.organizations),true);assert.equal(Object.isFrozen(result.organizations[0]?.companyAssignments),true);});
  it("rejects unknown capabilities",()=>assert.throws(()=>parseNeonOperatingOrganizationCatalog({...payload,organizations:[{...payload.organizations[0],capabilities:["root"]}]}),/capability is invalid/));
  it("rejects malformed effective dates",()=>assert.throws(()=>parseNeonOperatingOrganizationCatalog({...payload,organizations:[{...payload.organizations[0],companyAssignments:[{companyCodeId,participationRole:"participant",effectiveFrom:"today"}]}]}),/ISO date/));
});
