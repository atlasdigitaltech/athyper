import { describe, it, expect } from "vitest";
import { parseCollectionRelationship } from "@athyper/server-contract-metadata";
const binding={schemaVersion:1,sourceRef:"entity_case",subject:{fieldRef:"subject_entity",value:"master.business_partner"},scope:{fieldRef:"current_snapshot.organization",contextRef:"operatingOrganizationId"}};
const storage={schema:"document",object:"entity_case",idField:"id",tenantField:"tenant_id"};
describe("published document relationship",()=>{
  it("supports unrelated subjects through the same registered shape",()=>{for(const value of ["master.business_partner","procurement.purchase_order","workforce.employee"])expect(parseCollectionRelationship({...binding,subject:{...binding.subject,value}},storage).subject.value).toBe(value);});
  it("rejects unregistered sources, fields, coordinates, versions and SQL",()=>{
    for(const candidate of [{...binding,schemaVersion:2},{...binding,sourceRef:"arbitrary_table"},{...binding,sql:"true"},{...binding,subject:{fieldRef:"tenant_id",value:"master.business_partner"}},{...binding,subject:{...binding.subject,value:"x' OR TRUE --"}},{...binding,scope:{...binding.scope,contextRef:"tenantId"}},{...binding,scope:{...binding.scope,fieldRef:"payload.secret"}}])expect(()=>parseCollectionRelationship(candidate,storage)).toThrow();
  });
  it("rejects missing tenant or a mismatched root storage",()=>{expect(()=>parseCollectionRelationship(binding,{...storage,tenantField:undefined})).toThrow();expect(()=>parseCollectionRelationship(binding,{...storage,object:"other"})).toThrow();expect(()=>parseCollectionRelationship(undefined,storage)).toThrow();});
});
