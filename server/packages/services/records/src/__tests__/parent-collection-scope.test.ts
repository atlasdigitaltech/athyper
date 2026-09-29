import { expect, it, vi } from "vitest";
import type { MetadataReader, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createParentCollectionScopeResolver } from "../parent-collection-scope.js";
import { parseEntityListScopeCoordinate } from "../entity-list-routes.js";
const id="00000000-0000-4000-8000-000000000001";
const parent={entityCode:"owner_record",planeKey:"neon",releaseId:"owner-release",storage:{schema:"master",object:"owner",idField:"id",tenantField:"tenant_id"},fields:[{key:"id",type:"uuid",writableOn:[]},{key:"tenant_id",type:"uuid",writableOn:[]}],recordPresentation:{entityRelationships:[{key:"children",targetEntity:"child_record",cardinality:"many",fields:[{source:"id",target:"owner_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"}]}} as unknown as EntityRuntimeDescriptor;
const child={operations:{list:{code:"list",permissionCode:"child.read"}},entityCode:"child_record",planeKey:"neon",releaseId:"child-release",storage:{schema:"master",object:"child",idField:"id",tenantField:"tenant_id"},fields:[{key:"owner_id",type:"uuid",writableOn:[]},{key:"tenant_id",type:"uuid",writableOn:[]}]} as unknown as EntityRuntimeDescriptor;
const context={tenantId:id,principalId:id,planeKey:"neon"} as VerifiedRequestContext;
const coordinate={parentEntityCode:"owner_record",parentRecordId:id,relationshipKey:"children"};
it("resolves a generic published parent relationship and retains the existing scope",async()=>{
 const readParent=vi.fn(async()=>({data:{id}}));
 const resolver=createParentCollectionScopeResolver({metadata:{getEntityDescriptor:async()=>parent} as MetadataReader,readParent,
 fallback:{resolve:async()=>({status:"ready",authorizationResource:{tenantId:id},constraints:[{kind:"studio.metadata_entity.catalog.v1",tenantId:id}],labels:[],fingerprintMaterial:{baseline:"qualified"}})}});
 const result=await resolver.resolve({context,descriptor:child,operationCode:"read",coordinate});
 expect(readParent).toHaveBeenCalledWith({context,entityCode:"owner_record",recordId:id});
 expect(result.status).toBe("ready");
 if(result.status!=="ready")throw Error("unexpected denial");
 expect(result.constraints).toHaveLength(2);
 expect(result.constraints[1]).toMatchObject({kind:"entity.parent.v1",predicates:[{field:"owner_id",value:id}]});
 expect(result.fingerprintMaterial).toMatchObject({parentRecordId:id,parentRelease:"owner-release",childRelease:"child-release",baseline:"qualified"});
});
it("does not admit a missing, unrelated, untyped or unauthorized parent",async()=>{
 for(const [descriptor,owner,data] of [[{...child,entityCode:"other"},parent,{id}],[child,{...parent,planeKey:"mesh"},{id}],[child,parent,null],[child,parent,{id:null}]] as const){
  const resolver=createParentCollectionScopeResolver({metadata:{getEntityDescriptor:async()=>owner} as MetadataReader,readParent:async()=>({data})});
  expect((await resolver.resolve({context,descriptor:descriptor as EntityRuntimeDescriptor,operationCode:"read",coordinate})).status).toBe("forbidden");
 }
});
it("requires the complete bounded parent coordinate",()=>{
 expect(parseEntityListScopeCoordinate(coordinate)).toEqual(coordinate);
 expect(()=>parseEntityListScopeCoordinate({parentEntityCode:"owner_record"})).toThrow("supplied together");
 expect(()=>parseEntityListScopeCoordinate({...coordinate,relationshipKey:"children;sql"})).toThrow();
 expect(()=>parseEntityListScopeCoordinate({...coordinate,parentRecordId:"invalid"})).toThrow();
});
