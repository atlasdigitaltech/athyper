import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createNeonRecordCollectionScopeResolver } from "./record-collection-scope.js";

const companyCodeId = "11111111-1111-4111-8111-111111111111";
const legalEntityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" }, fields: [], operations: { read: { code: "read", permissionCode: "neon.relationship.business_partner.read" } },
} satisfies EntityRuntimeDescriptor;
const context = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1, profileHash: "profile", requestId: "request", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } satisfies VerifiedRequestContext;

describe("Neon record collection scope resolver", () => {
  const catalog = {
    neonWorkContexts: async () => ({ revision: "work-r1", companies: [{ companyCodeId, legalEntityId, code: "1000", displayName: "Malaysia Company", legalEntityCode: "MY01", legalEntityName: "Malaysia Legal Entity" }] }),
    neonOperatingOrganizations: async () => ({ revision: "org-r1", organizations: [{ id: organizationId, code: "PROC-MY", displayName: "Malaysia Procurement", companyAssignments: [{ companyCodeId }] }] }),
  };

  it("requires an explicit operating organization without consulting a client-side remembered value", async () => {
    const result = await createNeonRecordCollectionScopeResolver(catalog).resolve({ context, descriptor, operationCode: "read" });
    expect(result).toMatchObject({ status: "context_required", labels: [{ key: "operating_organization" }] });
  });

  it("validates the company pairing and emits the closed business-partner constraint", async () => {
    const result = await createNeonRecordCollectionScopeResolver(catalog).resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId } });
    expect(result).toMatchObject({ status: "ready", authorizationResource: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId }, constraints: [{ kind: "neon.business_partner.operating_organization.v1", operatingOrganizationId: organizationId }] });
    expect(result.labels.map((label) => label.value)).toEqual(["1000 · Malaysia Company", "PROC-MY · Malaysia Procurement"]);
  });

  it("fails closed for a company coordinate that is absent or incompatible", async () => {
    const resolver = createNeonRecordCollectionScopeResolver(catalog);
    await expect(resolver.resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId: "44444444-4444-4444-8444-444444444444", legalEntityId, operatingOrganizationId: organizationId } })).resolves.toMatchObject({ status: "forbidden", code: "NEON_WORK_CONTEXT_NOT_PERMITTED" });
    const incompatible = createNeonRecordCollectionScopeResolver({ ...catalog, neonOperatingOrganizations: async () => ({ revision: "org-r2", organizations: [{ id: organizationId, code: "PROC-MY", displayName: "Malaysia Procurement", companyAssignments: [] }] }) });
    await expect(incompatible.resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId } })).resolves.toMatchObject({ status: "forbidden", code: "NEON_WORK_CONTEXT_INCOMPATIBLE" });
  });
});

it("requires a validated organization for request collections and emits their snapshot scope", async () => {
  const catalog = {neonWorkContexts:async()=>({revision:"v1",companies:[]}),neonOperatingOrganizations:async()=>({revision:"v1",organizations:[{id:organizationId,code:"PROC",displayName:"Procurement",companyAssignments:[]}]})};
  const requests={...descriptor,entityCode:"business_partner_request",collectionRelationship:{schemaVersion:1 as const,sourceRef:"entity_case" as const,subject:{fieldRef:"subject_entity" as const,value:"master.business_partner"},scope:{fieldRef:"current_snapshot.organization" as const,contextRef:"operatingOrganizationId" as const}},storage:{schema:"document",object:"entity_case",idField:"id",tenantField:"tenant_id"}};
  const resolver=createNeonRecordCollectionScopeResolver(catalog);
  expect(await resolver.resolve({context,descriptor:requests,operationCode:"read"})).toMatchObject({status:"context_required"});
  expect(await resolver.resolve({context,descriptor:{...requests,collectionRelationship:undefined},operationCode:"read"})).toMatchObject({status:"forbidden",code:"COLLECTION_RELATIONSHIP_REQUIRED"});
  const alternate={...requests,entityCode:"purchase_request",collectionRelationship:{...requests.collectionRelationship,subject:{...requests.collectionRelationship.subject,value:"procurement.purchase_order"}}};
  expect(await resolver.resolve({context,descriptor:alternate,operationCode:"read",coordinate:{operatingOrganizationId:organizationId}})).toMatchObject({status:"ready",constraints:[{kind:"platform.document_relationship.v1",operatingOrganizationId:organizationId}]});
  expect(await resolver.resolve({context,descriptor:requests,operationCode:"read",coordinate:{operatingOrganizationId:organizationId}})).toMatchObject({status:"ready",constraints:[{kind:"platform.document_relationship.v1",operatingOrganizationId:organizationId}]});
  expect(await resolver.resolve({context,descriptor:requests,operationCode:"read",coordinate:{operatingOrganizationId:"00000000-0000-4000-8000-000000000001"}})).toMatchObject({status:"forbidden"});
});

describe("Published directory rules",()=>{
 const catalog={neonWorkContexts:async()=>({revision:"w",companies:[{companyCodeId,legalEntityId,code:"C",displayName:"Company",legalEntityCode:"L",legalEntityName:"Legal"}]}),neonOperatingOrganizations:async()=>({revision:"o",organizations:[{id:organizationId,code:"O",displayName:"Org",companyAssignments:[{companyCodeId}]}]})};
 const run=(mode:"tenant"|"organization"|"company"|"organization_company",coordinate?:{operatingOrganizationId?:string;companyCodeId?:string;legalEntityId?:string})=>createNeonRecordCollectionScopeResolver(catalog).resolve({context,descriptor:{...descriptor,directoryScope:{schemaVersion:1,mode}},operationCode:"read",coordinate});
 it("allows tenant directory browsing without a selected context",async()=>{expect(await run("tenant")).toMatchObject({status:"ready",constraints:[]});});
 it("restricts to all authorized organizations without requiring a selection",async()=>{expect(await run("organization")).toMatchObject({status:"ready",constraints:[{organizationIds:[organizationId]}]});});
 it("restricts to all authorized companies",async()=>{expect(await run("company")).toMatchObject({status:"ready",constraints:[{companyIds:[companyCodeId]}]});});
 it("intersects both restrictions",async()=>{expect(await run("organization_company")).toMatchObject({status:"ready",constraints:[{organizationIds:[organizationId],companyIds:[companyCodeId]}]});});
 it("filters only narrow tenant scope and reject unauthorized coordinates",async()=>{expect(await run("tenant",{companyCodeId,legalEntityId})).toMatchObject({constraints:[{companyIds:[companyCodeId]}]});expect(await run("tenant",{operatingOrganizationId:"other"})).toMatchObject({status:"forbidden"});});
 it("fails closed with empty authorized scope",async()=>{const resolver=createNeonRecordCollectionScopeResolver({...catalog,neonOperatingOrganizations:async()=>({revision:"none",organizations:[]})});expect(await resolver.resolve({context,descriptor:{...descriptor,directoryScope:{schemaVersion:1,mode:"organization"}},operationCode:"read"})).toMatchObject({constraints:[{organizationIds:[]}]});});
});
it("requires explicit authorized transaction coordinates and authoritative eligibility",async()=>{
 const catalog={neonWorkContexts:async()=>({revision:"w",companies:[{companyCodeId,legalEntityId,code:"C",displayName:"C",legalEntityCode:"L",legalEntityName:"L"}]}),neonOperatingOrganizations:async()=>({revision:"o",organizations:[{id:organizationId,code:"O",displayName:"O",companyAssignments:[{companyCodeId}]}]})};
 const resolver=createNeonRecordCollectionScopeResolver(catalog,async()=>["eligible-partner"]),scoped={...descriptor,directoryScope:{schemaVersion:1 as const,mode:"tenant" as const,quickFilters:[{key:"partnerRole" as const,label:"Role",emptyLabel:"All",options:[{value:"supplier",label:"Supplier"}]},{key:"eligibleOperation" as const,label:"Eligibility",emptyLabel:"All",options:[{value:"order",label:"Orders"}],requires:["partnerRole","organization","company"] as const}]}};
 expect(await resolver.resolve({context,descriptor:{...scoped,directoryScope:{schemaVersion:1,mode:"tenant"}},operationCode:"read",coordinate:{partnerRole:"supplier"}})).toMatchObject({status:"forbidden",code:"DIRECTORY_FILTER_UNAVAILABLE"});
 expect(await resolver.resolve({context,descriptor:scoped,operationCode:"read",coordinate:{partnerRole:"customer"}})).toMatchObject({status:"forbidden",code:"DIRECTORY_FILTER_UNAVAILABLE"});
 expect(await resolver.resolve({context,descriptor:scoped,operationCode:"read",coordinate:{eligibleOperation:"order"}})).toMatchObject({status:"forbidden",code:"ELIGIBILITY_CONTEXT_REQUIRED"});
 expect(await resolver.resolve({context,descriptor:scoped,operationCode:"read",coordinate:{partnerRole:"supplier",eligibleOperation:"order",operatingOrganizationId:organizationId,companyCodeId,legalEntityId}})).toMatchObject({status:"ready",constraints:[{eligibleIds:["eligible-partner"],partnerRole:"supplier"}]});
});
it("tenant directory access does not require organization or company catalog access",async()=>{
 const resolver=createNeonRecordCollectionScopeResolver({neonWorkContexts:async()=>{throw new Error("No company access");},neonOperatingOrganizations:async()=>{throw new Error("No organization access");}});
 expect(await resolver.resolve({context,descriptor:{...descriptor,directoryScope:{schemaVersion:1,mode:"tenant"}},operationCode:"read"})).toMatchObject({status:"ready",constraints:[]});
});
it("tenant directory rules do not widen import authorization",async()=>{
 const resolver=createNeonRecordCollectionScopeResolver({neonWorkContexts:async()=>({revision:"w",companies:[]}),neonOperatingOrganizations:async()=>({revision:"o",organizations:[]})});
 expect(await resolver.resolve({context,descriptor:{...descriptor,directoryScope:{schemaVersion:1,mode:"tenant"}},operationCode:"import"})).toMatchObject({status:"context_required"});
});

describe("multi-select directory scope",()=>{
 const otherCompany="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",otherOrganization="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const catalog={neonWorkContexts:async()=>({revision:"r",companies:[companyCodeId,otherCompany].map(id=>({companyCodeId:id,legalEntityId,code:id,displayName:id,legalEntityCode:"LE",legalEntityName:"Legal"}))}),neonOperatingOrganizations:async()=>({revision:"r",organizations:[organizationId,otherOrganization].map(id=>({id,code:id,displayName:id,companyAssignments:[{companyCodeId}]}))})};
 const resolver=createNeonRecordCollectionScopeResolver(catalog), published={...descriptor,directoryScope:{schemaVersion:1 as const,mode:"tenant" as const}};
 it("retains all selected scopes and canonicalizes selection order",async()=>{
  const coordinate={companyCodeIds:[otherCompany,companyCodeId],operatingOrganizationIds:[otherOrganization,organizationId]};
  const result=await resolver.resolve({context,descriptor:published,operationCode:"read",coordinate});
  expect(result).toMatchObject({status:"ready",constraints:[{companyIds:[companyCodeId,otherCompany],organizationIds:[organizationId,otherOrganization]}]});
  const reordered=await resolver.resolve({context,descriptor:published,operationCode:"read",coordinate:{companyCodeIds:[companyCodeId,otherCompany,companyCodeId],operatingOrganizationIds:[organizationId,otherOrganization]}});
  expect(reordered).toEqual(result);
 });
 it("does not accept partially unauthorized selections",async()=>{
  for(const coordinate of [{companyCodeIds:[companyCodeId,organizationId]},{operatingOrganizationIds:[organizationId,companyCodeId]}]) expect(await resolver.resolve({context,descriptor:published,operationCode:"read",coordinate})).toMatchObject({status:"forbidden"});
 });
 it("rejects malformed, oversized, conflicting and mutation scopes",async()=>{
  for(const coordinate of [{companyCodeIds:["invalid"]},{companyCodeIds:Array(101).fill(companyCodeId)},{companyCodeIds:[companyCodeId],companyCodeId,legalEntityId}]) expect(await resolver.resolve({context,descriptor:published,operationCode:"read",coordinate})).toMatchObject({status:"forbidden"});
  expect(await resolver.resolve({context,descriptor:published,operationCode:"import",coordinate:{companyCodeIds:[companyCodeId]}})).toMatchObject({status:"forbidden"});
 });
 it("empty selections use the published restricted scope rather than widening it",async()=>{
  expect(await resolver.resolve({context,descriptor:{...published,directoryScope:{schemaVersion:1,mode:"organization_company"}},operationCode:"read",coordinate:{companyCodeIds:[],operatingOrganizationIds:[]}})).toMatchObject({constraints:[{companyIds:[companyCodeId,otherCompany],organizationIds:[organizationId,otherOrganization]}]});
 });
});
