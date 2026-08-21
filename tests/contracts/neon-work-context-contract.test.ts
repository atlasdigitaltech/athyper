import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { parseNeonWorkContextBootstrap } from "../../packages/platform/foundation/api-client/src/work-context";

const tenantId="10000000-0000-4000-8000-000000000001";
const payload={schemaVersion:1,revision:"sha256:"+"a".repeat(64),tenantId,supportsAllPermitted:false,companies:[{companyCodeId:"20000000-0000-4000-8000-000000000001",code:"athq",displayName:"Athyper Group",legalEntityId:"30000000-0000-4000-8000-000000000001",legalEntityCode:"le-athq",legalEntityName:"Athyper Group Holdings Ltd",countryCode:"AE",functionalCurrency:"AED",capabilityGroups:["finance"]}]};

describe("Neon work-context browser contract",()=>{
  it("parses and freezes localized company projections",()=>{const result=parseNeonWorkContextBootstrap(payload);assert.equal(result.companies[0]?.displayName,"Athyper Group");assert.equal(Object.isFrozen(result.companies),true);});
  it("rejects unknown capability groups",()=>{assert.throws(()=>parseNeonWorkContextBootstrap({...payload,companies:[{...payload.companies[0],capabilityGroups:["root"]}]}),/capabilityGroup is invalid/);});
  it("rejects malformed catalog codes",()=>{assert.throws(()=>parseNeonWorkContextBootstrap({...payload,companies:[{...payload.companies[0],code:"../../tenant"}]}),/catalog code/);});
});
