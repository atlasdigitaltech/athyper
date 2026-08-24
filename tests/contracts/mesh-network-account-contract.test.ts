import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { parseMeshNetworkAccountCatalog } from "../../packages/platform/foundation/api-client/src/network-account";

const payload={schemaVersion:1,revision:"sha256:"+"a".repeat(64),tenantId:"10000000-0000-4000-8000-000000000001",accounts:[{networkAccountId:"20000000-0000-4000-8000-000000000001",code:"buyer.apac",displayName:"Athyper APAC Procurement",legalName:"Athyper Group Holdings",role:"buyer",countryCode:"MY",defaultCurrency:"MYR",source:"neon_projection",relatedAccountCount:1},{networkAccountId:"20000000-0000-4000-8000-000000000002",code:"supplier.ph.001",displayName:"Hospital Supplies PH",role:"supplier",countryCode:"PH",defaultCurrency:"PHP",source:"mesh",relatedAccountCount:2}]};

describe("Mesh network-account browser contract",()=>{
  it("parses and freezes authorized buyer and supplier projections",()=>{const result=parseMeshNetworkAccountCatalog(payload);assert.equal(result.accounts[0]?.role,"buyer");assert.equal(result.accounts[1]?.relatedAccountCount,2);assert.equal(Object.isFrozen(result.accounts),true);});
  it("rejects unknown account roles",()=>assert.throws(()=>parseMeshNetworkAccountCatalog({...payload,accounts:[{...payload.accounts[0],role:"administrator"}]}),/role is invalid/));
  it("rejects malformed supplier account codes",()=>assert.throws(()=>parseMeshNetworkAccountCatalog({...payload,accounts:[{...payload.accounts[0],code:"../../tenant"}]}),/catalog code/));
  it("rejects non-positive related-account counts",()=>assert.throws(()=>parseMeshNetworkAccountCatalog({...payload,accounts:[{...payload.accounts[0],relatedAccountCount:0}]}),/must be positive/));
});
